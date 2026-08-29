/**
 * Vaerion — MockBrain: the seeded virtual provider (ADR-0012).
 *
 * MockBrain implements the ProviderAdapter port with NO network, NO
 * credentials, and NO wall-clock: every output (text, tool calls, usage,
 * embeddings, rerank scores) is a pure function of the request + seed. Two
 * runs with the same seed and the same request produce byte-identical
 * streams — the determinism demo the blueprint demands (M4 exit: identical
 * seed ⇒ identical journals) and the hermetic device for all AI-facing CI.
 *
 * Determinism law: entropy comes ONLY from blake3 over the canonicalized
 * request (plus the explicit `seed` field). Math.random/Date.now are banned
 * everywhere (C2) and appear nowhere here.
 */

import { blake3HexOf } from "../kernel/hash.ts";
import { canonicalJson } from "../kernel/canonical.ts";
import { VaerionError } from "../kernel/errors.ts";
import type {
  ChatMessage,
  ModelOp,
  ModelRequest,
  ProviderAdapter,
  ProviderContext,
  StreamFrame,
} from "./types.ts";

/** Deterministic embedding dimension for MockBrain vectors. */
export const MOCKBRAIN_EMBED_DIM = 64;

async function hashOf(value: unknown): Promise<string> {
  return blake3HexOf(canonicalJson(value));
}

/** Deterministic 32-bit uint stream from a hex blake3 digest. */
function* uint32Stream(digest: string): Generator<number> {
  for (let i = 0; i < digest.length; i += 8) {
    yield parseInt(digest.slice(i, i + 8).padEnd(8, "0"), 16) >>> 0;
  }
}

/** Split the prompt into lowercase word tokens (deterministic tokenizer). */
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);
}

const MOCK_VOCAB = [
  "spine", "journal", "deterministic", "receipt", "broker", "capability",
  "evidence", "provenance", "fence", "budget", "metered", "sealed",
  "canonical", "chain", "gate", "authority", "hermetic", "seeded",
] as const;

/**
 * Generate deterministic chat text: seeded vocabulary walk over the request
 * entropy, echoing the request topic. Pure function of request + seed.
 */
async function mockChatText(req: ModelRequest): Promise<string> {
  const lastUser = [...(req.messages ?? [])].reverse().find((m) => m.role === "user");
  const topic = lastUser ? lastUser.content.slice(0, 80) : "the request";
  const digest = await hashOf({ op: "chat", model: req.model, messages: req.messages ?? [], seed: req.seed ?? 0, max: req.maxOutputTokens ?? null });
  const words: string[] = [];
  let produced = 0;
  const targetWords = 24 + (parseInt(digest.slice(0, 2), 16) % 24); // 24–47 words
  for (const u of uint32Stream(digest)) {
    for (let k = 0; k < 4 && produced < targetWords; k++) {
      const word = MOCK_VOCAB[(u >>> (k * 8)) % MOCK_VOCAB.length];
      if (word === undefined) continue;
      words.push(word);
      produced++;
    }
    if (produced >= targetWords) break;
  }
  const sentence = words.join(" ");
  return `mock(seed=${req.seed ?? 0}): on ${topic} — ${sentence}.`;
}

/** Deterministic embedding: blake3-projected vector (dim 64), values in [-1, 1). */
async function mockEmbedVector(text: string, seed: number | undefined): Promise<number[]> {
  const digest = await hashOf({ text, seed: seed ?? 0 });
  const vector: number[] = [];
  for (const u of uint32Stream(digest)) {
    for (let k = 0; k < 4 && vector.length < MOCKBRAIN_EMBED_DIM; k++) {
      const v = ((u >>> (k * 8)) & 0xff) / 127.5 - 1; // [-1, 1)
      vector.push(Math.round(v * 10000) / 10000);
    }
    if (vector.length >= MOCKBRAIN_EMBED_DIM) break;
  }
  return vector;
}

/** Deterministic rerank: token-overlap Jaccard plus a stable hash tie-breaker. */
async function mockRerankScore(query: string, doc: string, seed: number | undefined): Promise<number> {
  const q = new Set(tokenize(query));
  const d = new Set(tokenize(doc));
  if (q.size === 0 || d.size === 0) return 0;
  let inter = 0;
  for (const w of q) if (d.has(w)) inter++;
  const digest = await hashOf({ query, doc, seed: seed ?? 0 });
  const jitter = (parseInt(digest.slice(0, 4), 16) % 100) / 10000; // tiny stable tie-breaker
  return Math.round((inter / (q.size + d.size - inter) + jitter) * 10000) / 10000;
}

/** Deterministic token estimate (4 chars/token) — usage accounting for mocks. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function* streamMockChat(req: ModelRequest): AsyncIterable<StreamFrame> {
  const messages: ChatMessage[] = req.messages ?? [];
  if (messages.length === 0) {
    throw new VaerionError("E1702", "mockbrain chat requires at least one message");
  }
  const text = await mockChatText(req);
  // Emit the text in deterministic 8-char fragments (exercises the streaming
  // assembly path identically to wire providers).
  for (let i = 0; i < text.length; i += 8) {
    yield { type: "text", delta: text.slice(i, i + 8) };
  }
  // Deterministic tool call when the request asks for tools.
  const wantsTool = messages.some((m) => m.role === "system" && m.content.includes("tools:"));
  if (wantsTool) {
    const digest = await hashOf({ tool: true, model: req.model, seed: req.seed ?? 0 });
    yield { type: "tool_call", index: 0, id: `call_${digest.slice(0, 12)}`, name: "mock_tool", argsDelta: JSON.stringify({ seed: req.seed ?? 0 }) };
  }
  const inputTokens = messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
  yield { type: "usage", inputTokens, outputTokens: estimateTokens(text) };
  yield { type: "done", stopReason: "end_turn" };
}

async function* streamMockEmbed(req: ModelRequest): AsyncIterable<StreamFrame> {
  const inputs = req.input ?? [];
  if (inputs.length === 0) {
    throw new VaerionError("E1702", "mockbrain embed requires non-empty input");
  }
  let inputTokens = 0;
  for (const text of inputs) inputTokens += estimateTokens(text);
  for (let index = 0; index < inputs.length; index++) {
    yield { type: "embedding", index, vector: await mockEmbedVector(inputs[index] ?? "", req.seed) };
  }
  yield { type: "usage", inputTokens, outputTokens: 0 };
  yield { type: "done", stopReason: null };
}

async function* streamMockRerank(req: ModelRequest): AsyncIterable<StreamFrame> {
  const docs = req.documents ?? [];
  const query = req.query ?? "";
  if (docs.length === 0 || query.length === 0) {
    throw new VaerionError("E1702", "mockbrain rerank requires query and documents");
  }
  const scored: Array<{ index: number; score: number }> = [];
  for (let index = 0; index < docs.length; index++) {
    scored.push({ index, score: await mockRerankScore(query, docs[index] ?? "", req.seed) });
  }
  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  let inputTokens = estimateTokens(query);
  for (const doc of docs) inputTokens += estimateTokens(doc);
  for (const s of scored) yield { type: "rerank", index: s.index, score: s.score };
  yield { type: "usage", inputTokens, outputTokens: 0 };
  yield { type: "done", stopReason: null };
}

export const mockBrainAdapter: ProviderAdapter = {
  provider: "mockbrain",
  ops: new Set<ModelOp>(["chat", "embed", "rerank"]),
  requiresSecret: false,
  secretName: null,
  // `ctx` is accepted for port uniformity; MockBrain touches no transport.
  async open(req: ModelRequest, _ctx: ProviderContext): Promise<AsyncIterable<StreamFrame>> {
    switch (req.op) {
      case "chat":
        return streamMockChat(req);
      case "embed":
        return streamMockEmbed(req);
      case "rerank":
        return streamMockRerank(req);
    }
  },
};
