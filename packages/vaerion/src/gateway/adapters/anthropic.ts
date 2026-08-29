/**
 * Vaerion — Anthropic adapter (MS-3).
 *
 * Wire contract (Anthropic Messages API, streaming form — verified against
 * the provider's streaming documentation at MS-3 build time):
 *   - POST /v1/messages with `stream: true` yields `text/event-stream`.
 *   - SSE events, each `data:` payload a JSON object with a `type`:
 *     `message_start` (message.usage.input_tokens baseline),
 *     `content_block_start` (text or tool_use block; tool_use carries id/name),
 *     `content_block_delta` (delta.type `text_delta` → {text} fragment, or
 *     `input_json_delta` → {partial_json} tool-args fragment),
 *     `content_block_stop`, `message_delta` (delta.stop_reason + cumulative
 *     usage.output_tokens), `message_stop`, `ping` (ignored), `error`.
 *
 * This adapter maps those events onto the normalized StreamFrame contract —
 * nothing downstream may see Anthropic shapes. Endpoint resolution happens
 * in the sanctioned transport seam (host key "anthropic").
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
import { SseParser } from "./sse.ts";

const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Internal mapping result: normalized frames plus usage-partial markers.
 * `usage-partial {outputTokens}` carries the CUMULATIVE output token count
 * from `message_delta`; the streaming driver coalesces it with the
 * `message_start` input baseline before any public frame is emitted.
 */
type MappedEvent = { frame: StreamFrame } | { partial: "output"; outputTokens: number };

function buildChatBody(req: ModelRequest, modelId: string): Record<string, unknown> {
  const messages: ChatMessage[] = (req.messages ?? []).filter((m) => m.role !== "system");
  const system = (req.messages ?? []).filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const body: Record<string, unknown> = { model: modelId, max_tokens: req.maxOutputTokens ?? 1024, stream: true, messages };
  if (system.length > 0) body.system = system;
  return body;
}

function buildRequest(req: ModelRequest, modelId: string, apiKey: string | null): TransportRequest {
  if (req.op !== "chat") {
    // Honest capability matrix: Anthropic exposes no embeddings/rerank API.
    throw new VaerionError("E1701", `provider "anthropic" does not implement op "${req.op}"`);
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return {
    host: "anthropic",
    path: "/v1/messages",
    method: "POST",
    headers,
    body: JSON.stringify(buildChatBody(req, modelId)),
  };
}

/** Map one parsed SSE payload (JSON object with `type`) onto the internal form. */
export function mapAnthropicEvent(ev: unknown): MappedEvent[] {
  const e = ev as Record<string, unknown> | null;
  if (!e || typeof e !== "object" || typeof e.type !== "string") {
    throw new VaerionError("E1702", "anthropic stream event missing type");
  }
  switch (e.type) {
    case "ping":
      return [];
    case "message_start": {
      const msg = e.message as Record<string, unknown> | undefined;
      const usage = msg && typeof msg === "object" ? (msg.usage as Record<string, unknown> | undefined) : undefined;
      const input = usage && Number.isInteger(usage.input_tokens) ? (usage.input_tokens as number) : 0;
      return [{ frame: { type: "usage", inputTokens: input, outputTokens: 0 } }];
    }
    case "content_block_start": {
      const block = e.content_block as Record<string, unknown> | undefined;
      if (block && block.type === "tool_use") {
        return [{
          frame: {
            type: "tool_call",
            index: typeof e.index === "number" ? e.index : 0,
            id: typeof block.id === "string" ? block.id : null,
            name: typeof block.name === "string" ? block.name : null,
            argsDelta: "",
          },
        }];
      }
      return [];
    }
    case "content_block_delta": {
      const delta = e.delta as Record<string, unknown> | undefined;
      if (!delta) return [];
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        return [{ frame: { type: "text", delta: delta.text } }];
      }
      if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
        return [{ frame: { type: "tool_call", index: typeof e.index === "number" ? e.index : 0, id: null, name: null, argsDelta: delta.partial_json } }];
      }
      return [];
    }
    case "message_delta": {
      const delta = e.delta as Record<string, unknown> | undefined;
      const usage = e.usage as Record<string, unknown> | undefined;
      const out: MappedEvent[] = [];
      if (usage && Number.isInteger(usage.output_tokens)) {
        out.push({ partial: "output", outputTokens: usage.output_tokens as number });
      }
      out.push({ frame: { type: "done", stopReason: delta && typeof delta.stop_reason === "string" ? delta.stop_reason : null } });
      return out;
    }
    case "message_stop":
      return [];
    case "error": {
      const err = e.error as Record<string, unknown> | undefined;
      return [{ frame: { type: "error", code: String(err?.type ?? "provider_error"), message: String(err?.message ?? "anthropic stream error") } }];
    }
    default:
      // Unknown event types are no-ops here: provider-side additions must
      // not break stream parity (forward-compat is loud only on the spine).
      return [];
  }
}

/**
 * Consume an established 200 response body (SSE chunks) and yield normalized
 * frames. Usage is coalesced before yield: `message_start` supplies input
 * tokens, the latest `message_delta` partial supplies output tokens.
 */
async function* streamAnthropicFrames(chunks: AsyncIterable<{ text: string }>): AsyncIterable<StreamFrame> {
  const parser = new SseParser();
  let inputTokens = 0;
  let outputTokens = 0;
  const handle = function* (mapped: MappedEvent[]): Generator<StreamFrame> {
    for (const m of mapped) {
      if ("partial" in m) {
        outputTokens = m.outputTokens;
        continue;
      }
      if (m.frame.type === "done") {
        yield { type: "usage", inputTokens, outputTokens };
      }
      yield m.frame;
    }
  };
  for await (const chunk of chunks) {
    for (const ev of parser.feed(chunk.text)) {
      const trimmed = ev.data.trim();
      if (trimmed.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch (err) {
        throw new VaerionError("E1702", `anthropic SSE data is not JSON: ${(err as Error).message}`);
      }
      yield* handle(mapAnthropicEvent(parsed));
    }
  }
  for (const ev of parser.flush()) {
    const trimmed = ev.data.trim();
    if (trimmed.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      throw new VaerionError("E1702", "anthropic SSE tail is not JSON");
    }
    yield* handle(mapAnthropicEvent(parsed));
  }
}

export const anthropicAdapter: ProviderAdapter = {
  provider: "anthropic",
  ops: new Set<ModelOp>(["chat"]),
  requiresSecret: true,
  secretName: "ANTHROPIC_API_KEY",
  async open(req, ctx) {
    const at = req.model.indexOf("/");
    if (at <= 0) throw new VaerionError("E1700", `model must be "provider/model-id", got: ${req.model}`);
    // Establish the connection (retryable phase happens around this call in
    // the service); frame consumption below is never retried.
    const request = buildRequest(req, req.model.slice(at + 1), ctx.secret);
    const response = await ctx.transport.send(request);
    if (response.status !== 200) {
      let detail = "";
      for await (const c of response.chunks) detail += c.text;
      throw new VaerionError("E1601", `anthropic returned HTTP ${response.status}`, { body: detail.slice(0, 200) });
    }
    return streamAnthropicFrames(response.chunks);
  },
};
