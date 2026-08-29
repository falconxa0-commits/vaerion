/**
 * Vaerion — Ollama adapter (MS-3).
 *
 * Wire contract (Ollama Chat API, streaming form — verified against the
 * provider's API documentation at MS-3 build time):
 *   - POST /api/chat with `stream: true` (the default) yields NDJSON: one
 *     JSON object per line; each line carries `message: {role, content}`
 *     while `done: false`, and the terminal line carries `done: true` with
 *     timing/token fields (`prompt_eval_count` = input tokens,
 *     `eval_count` = output tokens, `done_reason` when present).
 *   - Local inference: no credential is ever required or sent.
 *
 * Endpoint resolution happens in the sanctioned transport seam (host key
 * "ollama"). Nothing downstream may see Ollama shapes.
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
import { parseNdjsonChunks } from "./sse.ts";

function buildRequest(req: ModelRequest, modelId: string): TransportRequest {
  if (req.op !== "chat") {
    // Ollama's embeddings endpoint exists but the v0.1 gateway normalizes
    // chat for this provider; the capability matrix is declared honestly.
    throw new VaerionError("E1701", `provider "ollama" does not implement op "${req.op}" (chat only in v0.1)`);
  }
  const messages: ChatMessage[] = req.messages ?? [];
  return {
    host: "ollama",
    path: "/api/chat",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: modelId, messages, stream: true }),
  };
}

/** Map one parsed Ollama NDJSON line onto normalized frames. */
export function mapOllamaEvent(ev: unknown): StreamFrame[] {
  const e = ev as Record<string, unknown> | null;
  if (!e || typeof e !== "object") {
    throw new VaerionError("E1702", "ollama stream line is not an object");
  }
  const frames: StreamFrame[] = [];
  const message = e.message as Record<string, unknown> | undefined;
  if (message && typeof message.content === "string" && message.content.length > 0) {
    frames.push({ type: "text", delta: message.content });
  }
  if (e.error !== undefined) {
    frames.push({ type: "error", code: "provider_error", message: String(e.error) });
    return frames;
  }
  if (e.done === true) {
    const input = Number.isInteger(e.prompt_eval_count) ? (e.prompt_eval_count as number) : 0;
    const output = Number.isInteger(e.eval_count) ? (e.eval_count as number) : 0;
    frames.push({ type: "usage", inputTokens: input, outputTokens: output });
    frames.push({ type: "done", stopReason: typeof e.done_reason === "string" ? e.done_reason : null });
  }
  return frames;
}

/** Consume an established 200 NDJSON stream → normalized frames. */
async function* ollamaChatFrames(chunks: AsyncIterable<{ text: string }>): AsyncIterable<StreamFrame> {
  const raw: string[] = [];
  for await (const c of chunks) raw.push(c.text);
  const parsed = parseNdjsonChunks(raw);
  for (const item of parsed) {
    if (!item.ok) throw new VaerionError("E1702", item.error);
    for (const frame of mapOllamaEvent(item.value)) {
      if (frame.type === "error") {
        throw new VaerionError("E1601", `ollama stream error: ${frame.message}`);
      }
      yield frame;
    }
  }
}

export const ollamaAdapter: ProviderAdapter = {
  provider: "ollama",
  ops: new Set<ModelOp>(["chat"]),
  requiresSecret: false,
  secretName: null,
  async open(req, ctx) {
    const at = req.model.indexOf("/");
    if (at <= 0) throw new VaerionError("E1700", `model must be "provider/model-id", got: ${req.model}`);
    const request = buildRequest(req, req.model.slice(at + 1));
    const response = await ctx.transport.send(request);
    if (response.status !== 200) {
      const detail: string[] = [];
      for await (const c of response.chunks) detail.push(c.text);
      throw new VaerionError("E1601", `ollama returned HTTP ${response.status}`, { body: detail.join("").slice(0, 200) });
    }
    return ollamaChatFrames(response.chunks);
  },
};
