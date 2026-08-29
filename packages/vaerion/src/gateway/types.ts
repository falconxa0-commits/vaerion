/**
 * Vaerion — Model Gateway contracts (MS-3).
 *
 * Constitutional law (D-J): the gateway is the SINGLE gate. All model I/O
 * crosses it; no component speaks to providers directly. Every invocation
 * enters through the broker's `model.invoke` domain (decide → journal → act)
 * and is metered on the spine.
 *
 * The normalized stream is the canonical wire form (R-MG1): provider-shaped
 * chunks are always mapped onto `StreamFrame` by an adapter before anything
 * downstream may consume them. Adapters are pure with respect to transport:
 * they receive an injected `GatewayTransport` (fetch in production, cassette
 * replay in tests — ADR-0012), never ambient network.
 */

import type { Clock, Rng } from "../kernel/clock.ts";

/** Operations the gateway normalizes (R-MG1). */
export type ModelOp = "chat" | "embed" | "rerank";

export const MODEL_OPS: ReadonlyArray<ModelOp> = ["chat", "embed", "rerank"];

/** Canonical chat message (provider shapes are normalized onto this). */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * A model invocation request. `model` is canonical `provider/model-id`
 * (e.g. `anthropic/claude-3-5-sonnet-latest`, `mockbrain/mock-1`).
 */
export interface ModelRequest {
  op: ModelOp;
  model: string;
  messages?: ChatMessage[];
  /** embed inputs. */
  input?: string[];
  /** rerank query + documents. */
  query?: string;
  documents?: string[];
  /** Optional determinism seed (honored by MockBrain; recorded, never generated here). */
  seed?: number;
  maxOutputTokens?: number;
  /** Declared intent surfaces on the broker decision (redacted on journal). */
  intent?: string;
}

/** Split `provider/model-id`. Unknown shapes fail closed (E1700). */
export function parseModelId(model: string): { provider: string; modelId: string } {
  const at = model.indexOf("/");
  if (at <= 0 || at === model.length - 1) {
    throw Object.assign(new Error(`model must be "provider/model-id", got: ${model}`), { code: "E1700" });
  }
  return { provider: model.slice(0, at), modelId: model.slice(at + 1) };
}

/**
 * Normalized stream frame — the canonical form every provider stream is
 * mapped onto. Downstream consumers see ONLY these.
 */
export type StreamFrame =
  | { type: "text"; delta: string }
  | { type: "tool_call"; index: number; id: string | null; name: string | null; argsDelta: string }
  | { type: "embedding"; index: number; vector: number[] }
  | { type: "rerank"; index: number; score: number }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "error"; code: string; message: string }
  | { type: "done"; stopReason: string | null };

export function assertStreamFrame(f: unknown): asserts f is StreamFrame {
  const x = f as Partial<StreamFrame> | null;
  const fail: (m: string) => never = (m) => {
    throw Object.assign(new Error(`stream contract violated: ${m}`), { code: "E1702" });
  };
  if (!x || typeof x !== "object") fail("frame must be an object");
  const t = (x as { type?: unknown }).type;
  if (t !== "text" && t !== "tool_call" && t !== "embedding" && t !== "rerank" && t !== "usage" && t !== "error" && t !== "done") {
    fail(`unknown frame type ${String(t)}`);
  }
  if (t === "text" && typeof (x as { delta?: unknown }).delta !== "string") fail("text frame requires string delta");
  if (t === "usage") {
    const u = x as unknown as { inputTokens?: unknown; outputTokens?: unknown };
    if (!Number.isInteger(u.inputTokens) || (u.inputTokens as number) < 0) fail("usage.inputTokens must be a non-negative integer");
    if (!Number.isInteger(u.outputTokens) || (u.outputTokens as number) < 0) fail("usage.outputTokens must be a non-negative integer");
  }
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Integer micro-USD cost (deterministic; never floats on the wire). */
export interface UsageCost {
  inputMicroUsd: number;
  outputMicroUsd: number;
  totalMicroUsd: number;
}

export interface InvocationResult {
  model: string;
  provider: string;
  op: ModelOp;
  /** Assembled text (chat). Redacted before it is journaled. */
  text: string;
  /** The full normalized stream (canonical form). */
  frames: StreamFrame[];
  usage: TokenUsage | null;
  cost: UsageCost | null;
  stopReason: string | null;
  /** Transport attempts after retries (1 = first try succeeded). */
  attempts: number;
  /** Wall latency via the injected clock (hermetic in tests). */
  latencyMs: number;
  /** blake3 of the assembled text — the journal stores the hash + redacted text. */
  textHash: string | null;
}

/**
 * Transport request (provider-agnostic byte carrier). Adapters name a HOST
 * KEY (e.g. "anthropic") + wire path; only the sanctioned transport seam
 * (gateway/transport.ts) resolves host keys to network endpoints — engine
 * code outside that file carries no endpoint URLs (constitutional C1).
 */
export interface TransportRequest {
  /** Host key resolved by the transport (e.g. "anthropic", "openai", "ollama"). */
  host: string;
  /** Wire path, e.g. "/v1/messages". */
  path: string;
  method: "POST";
  headers: Record<string, string>;
  /** Request body (JSON string). Secret-bearing headers are set by the transport caller. */
  body: string;
}

/** One raw wire chunk from the provider (SSE text, NDJSON line, or body fragment). */
export interface TransportChunk {
  /** Provider wire text for this chunk (may contain partial lines; the SSE parser buffers). */
  text: string;
}

export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  /** The response body as an ordered chunk iterator (streaming canonical form). */
  chunks: AsyncIterable<TransportChunk>;
}

/**
 * The transport port: the ONLY door to provider networks. Production uses
 * `fetchTransport` (the single sanctioned egress site, constitutional-check
 * C1); tests use cassette replay or scripted transports (ADR-0012).
 */
export interface GatewayTransport {
  readonly name: string;
  send(req: TransportRequest): Promise<TransportResponse>;
}

/** Injectable context for adapters (hermetic by construction). */
export interface ProviderContext {
  clock: Clock;
  rng: Rng;
  transport: GatewayTransport;
  /** Resolved secret value for this call, or null when the provider needs none. */
  secret: string | null;
}

/**
 * Provider adapter port. Adapters own ONE responsibility: mapping between
 * their provider's wire shape and the normalized contract. Nothing else in
 * the engine knows a provider's wire format.
 *
 * `open` ESTABLISHES the stream (transport.send — the retryable phase) and
 * resolves to the frame iterator; once frames flow, consumption is never
 * retried (partial output must not be re-sent or double-metered).
 */
export interface ProviderAdapter {
  readonly provider: string;
  /** Operations this adapter implements (capability matrix, declared honestly). */
  readonly ops: ReadonlySet<ModelOp>;
  /** True when the adapter requires a credential to reach its provider. */
  readonly requiresSecret: boolean;
  /** The canonical secret NAME this provider needs (ADR-0013 names only). */
  readonly secretName: string | null;
  /** Establish the stream and return the normalized frame iterator. */
  open(req: ModelRequest, ctx: ProviderContext): Promise<AsyncIterable<StreamFrame>>;
}

/** Assemble text frames into the full text (the only assembly law). */
export function assembleText(frames: readonly StreamFrame[]): string {
  let out = "";
  for (const f of frames) if (f.type === "text") out += f.delta;
  return out;
}
