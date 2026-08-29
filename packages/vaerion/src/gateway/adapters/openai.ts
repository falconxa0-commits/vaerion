/**
 * Vaerion — OpenAI adapter (MS-3).
 *
 * Wire contract (OpenAI Chat Completions + Embeddings, streaming form —
 * verified against the provider's API reference at MS-3 build time):
 *   - POST /v1/chat/completions with `stream: true` and
 *     `stream_options: {"include_usage": true}` yields `text/event-stream`
 *     whose `data:` payloads are chunk objects: `choices[0].delta.content`
 *     carries text fragments, `choices[0].delta.tool_calls[]` carry tool
 *     fragments, and a final chunk with empty `choices` carries `usage`
 *     {prompt_tokens, completion_tokens}. The stream terminates with
 *     `data: [DONE]`.
 *   - POST /v1/embeddings is non-streaming JSON: `{data: [{embedding: [...],
 *     index}], usage: {prompt_tokens, total_tokens}}`.
 *
 * Endpoint resolution happens in the sanctioned transport seam (host key
 * "openai"). Nothing downstream may see OpenAI shapes.
 */

import { VaerionError } from "../../kernel/errors.ts";
import type {
  ChatMessage,
  ModelOp,
  ModelRequest,
  ProviderAdapter,
  ProviderContext,
  StreamFrame,
  TransportRequest,
} from "../types.ts";
import { parseSseChunks } from "./sse.ts";

function buildChatBody(req: ModelRequest, modelId: string): Record<string, unknown> {
  const messages: ChatMessage[] = req.messages ?? [];
  return {
    model: modelId,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(req.maxOutputTokens !== undefined ? { max_completion_tokens: req.maxOutputTokens } : {}),
  };
}

function buildEmbedBody(req: ModelRequest, modelId: string): Record<string, unknown> {
  return { model: modelId, input: req.input ?? [] };
}

function buildRequest(req: ModelRequest, modelId: string, apiKey: string | null): TransportRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey !== null) headers.authorization = `Bearer ${apiKey}`;
  if (req.op === "chat") {
    return { host: "openai", path: "/v1/chat/completions", method: "POST", headers, body: JSON.stringify(buildChatBody(req, modelId)) };
  }
  if (req.op === "embed") {
    return { host: "openai", path: "/v1/embeddings", method: "POST", headers, body: JSON.stringify(buildEmbedBody(req, modelId)) };
  }
  // Honest capability matrix: OpenAI exposes no rerank API.
  throw new VaerionError("E1701", `provider "openai" does not implement op "${req.op}"`);
}

/** Map one parsed OpenAI chunk object onto normalized frames. */
export function mapOpenAiEvent(ev: unknown): StreamFrame[] {
  const e = ev as Record<string, unknown> | null;
  if (!e || typeof e !== "object") {
    throw new VaerionError("E1702", "openai stream event is not an object");
  }
  if (e.done === true) return [{ type: "done", stopReason: null }];
  const frames: StreamFrame[] = [];
  const choices = Array.isArray(e.choices) ? (e.choices as Array<Record<string, unknown>>) : [];
  for (const choice of choices) {
    const delta = (choice.delta ?? null) as Record<string, unknown> | null;
    if (delta && typeof delta.content === "string" && delta.content.length > 0) {
      frames.push({ type: "text", delta: delta.content });
    }
    if (delta && Array.isArray(delta.tool_calls)) {
      for (const raw of delta.tool_calls as Array<Record<string, unknown>>) {
        const fn = (raw.function ?? null) as Record<string, unknown> | null;
        frames.push({
          type: "tool_call",
          index: typeof raw.index === "number" ? raw.index : 0,
          id: typeof raw.id === "string" ? raw.id : null,
          name: fn && typeof fn.name === "string" ? fn.name : null,
          argsDelta: fn && typeof fn.arguments === "string" ? fn.arguments : "",
        });
      }
    }
    const finish = choice.finish_reason;
    if (typeof finish === "string") {
      frames.push({ type: "done", stopReason: finish });
    }
  }
  const usage = e.usage as Record<string, unknown> | undefined;
  if (usage && Number.isInteger(usage.prompt_tokens) && Number.isInteger(usage.completion_tokens)) {
    frames.push({ type: "usage", inputTokens: usage.prompt_tokens as number, outputTokens: usage.completion_tokens as number });
  }
  const err = e.error as Record<string, unknown> | undefined;
  if (err && typeof err.message === "string") {
    frames.push({ type: "error", code: String(err.code ?? err.type ?? "provider_error"), message: err.message });
  }
  return frames;
}

async function readAllChunks(chunks: AsyncIterable<{ text: string }>): Promise<string[]> {
  const out: string[] = [];
  for await (const c of chunks) out.push(c.text);
  return out;
}

/** Consume an established 200 chat stream: SSE chunks → normalized frames. */
async function* openAiChatFrames(chunks: AsyncIterable<{ text: string }>): AsyncIterable<StreamFrame> {
  const raw: string[] = await readAllChunks(chunks);
  const parsed = parseSseChunks(raw);
  let finalUsage: { inputTokens: number; outputTokens: number } | null = null;
  for (const item of parsed) {
    if (!item.ok) throw new VaerionError("E1702", item.error);
    for (const frame of mapOpenAiEvent(item.value)) {
      if (frame.type === "usage") {
        finalUsage = { inputTokens: frame.inputTokens, outputTokens: frame.outputTokens };
        continue;
      }
      if (frame.type === "done") {
        stopReason = frame.stopReason;
        continue;
      }
      if (frame.type === "error") {
        throw new VaerionError("E1601", `openai stream error: ${frame.message}`, { code: frame.code });
      }
      yield frame;
    }
  }
  yield { type: "usage", inputTokens: finalUsage?.inputTokens ?? 0, outputTokens: finalUsage?.outputTokens ?? 0 };
  yield { type: "done", stopReason };
}

/** Consume a completed embeddings response body → normalized frames. */
async function* openAiEmbedFrames(bodyText: string): AsyncIterable<StreamFrame> {
  let body: unknown;
  try {
    body = JSON.parse(bodyText) as unknown;
  } catch (err) {
    throw new VaerionError("E1702", `openai embedding body is not JSON: ${(err as Error).message}`);
  }
  const b = body as Record<string, unknown> | null;
  const data = Array.isArray(b?.data) ? (b!.data as Array<Record<string, unknown>>) : [];
  for (const item of data) {
    const vector = item.embedding;
    if (!Array.isArray(vector)) throw new VaerionError("E1702", "openai embedding item missing embedding array");
    yield { type: "embedding", index: typeof item.index === "number" ? item.index : 0, vector: vector.map(Number) };
  }
  const usage = (b?.usage ?? null) as Record<string, unknown> | null;
  if (usage && Number.isInteger(usage.prompt_tokens)) {
    yield { type: "usage", inputTokens: usage.prompt_tokens as number, outputTokens: 0 };
  } else {
    yield { type: "usage", inputTokens: 0, outputTokens: 0 };
  }
  yield { type: "done", stopReason: null };
}

export const openaiAdapter: ProviderAdapter = {
  provider: "openai",
  ops: new Set<ModelOp>(["chat", "embed"]),
  requiresSecret: true,
  secretName: "OPENAI_API_KEY",
  async open(req, ctx) {
    const at = req.model.indexOf("/");
    if (at <= 0) throw new VaerionError("E1700", `model must be "provider/model-id", got: ${req.model}`);
    const modelId = req.model.slice(at + 1);
    const request = buildRequest(req, modelId, ctx.secret);
    const response = await ctx.transport.send(request);
    if (response.status !== 200) {
      const detail = (await readAllChunks(response.chunks)).join("");
      throw new VaerionError("E1601", `openai returned HTTP ${response.status}`, { body: detail.slice(0, 200) });
    }
    if (req.op === "embed") {
      const bodyText = (await readAllChunks(response.chunks)).join("");
      return openAiEmbedFrames(bodyText);
    }
    return openAiChatFrames(response.chunks);
  },
};
