/**
 * Vaerion — Model Gateway pricing (R-MG3).
 *
 * Law: cost accounting is INTEGER micro-USD arithmetic — floats never carry
 * money on the wire, and identical usage always yields identical cost
 * (determinism P2). Prices are data, published per canonical model id in
 * micro-USD per 1M tokens, and marked with the source they were transcribed
 * from. A model without a table entry costs `null` — an unpriced call is
 * reported honestly, never faked as free.
 *
 * Rounding rule (documented, deterministic): half-up on the exact rational
 * product `tokens × priceMicroUsdPerMTok / 1_000_000`.
 */

import type { ModelOp, TokenUsage, UsageCost } from "./types.ts";

/** Price in integer micro-USD per 1M tokens (both directions required). */
export interface ModelPrice {
  /** Canonical provider/model key, e.g. "anthropic/claude-3-5-sonnet-latest". */
  readonly key: string;
  readonly inputMicroUsdPerMTok: number;
  readonly outputMicroUsdPerMTok: number;
  /** Which op classes this price covers (embed/rerank models price input only). */
  readonly op: ModelOp;
}

/**
 * Published price table (micro-USD per 1M tokens). Transcribed from the
 * provider price pages current at the 2026-08 MS-3 build; provider drift is
 * a data update, never a code change.
 */
export const PRICE_TABLE: ReadonlyArray<ModelPrice> = [
  // Anthropic — chat models (per-MTok list prices).
  { key: "anthropic/claude-3-5-sonnet-latest", inputMicroUsdPerMTok: 3_000_000, outputMicroUsdPerMTok: 15_000_000, op: "chat" },
  { key: "anthropic/claude-3-5-haiku-latest", inputMicroUsdPerMTok: 800_000, outputMicroUsdPerMTok: 4_000_000, op: "chat" },
  { key: "anthropic/claude-3-opus-latest", inputMicroUsdPerMTok: 15_000_000, outputMicroUsdPerMTok: 75_000_000, op: "chat" },
  // OpenAI — chat models.
  { key: "openai/gpt-4o", inputMicroUsdPerMTok: 2_500_000, outputMicroUsdPerMTok: 10_000_000, op: "chat" },
  { key: "openai/gpt-4o-mini", inputMicroUsdPerMTok: 150_000, outputMicroUsdPerMTok: 600_000, op: "chat" },
  // OpenAI — embeddings (input-only pricing; output side is structurally 0).
  { key: "openai/text-embedding-3-small", inputMicroUsdPerMTok: 20_000, outputMicroUsdPerMTok: 0, op: "embed" },
  { key: "openai/text-embedding-3-large", inputMicroUsdPerMTok: 130_000, outputMicroUsdPerMTok: 0, op: "embed" },
  // Ollama — local inference is unpriced by definition (0, not null).
  { key: "ollama/*", inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, op: "chat" },
  { key: "ollama/*", inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, op: "embed" },
  // MockBrain — the seeded virtual provider costs nothing (ADR-0012).
  { key: "mockbrain/*", inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, op: "chat" },
  { key: "mockbrain/*", inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, op: "embed" },
  { key: "mockbrain/*", inputMicroUsdPerMTok: 0, outputMicroUsdPerMTok: 0, op: "rerank" },
];

/**
 * Look up the price for a canonical model id. Exact key first, then the
 * provider wildcard `provider/*` for the op. `null` = unpriced (honest).
 */
export function priceFor(model: string, op: ModelOp): ModelPrice | null {
  for (const p of PRICE_TABLE) {
    if (p.key === model && p.op === op) return p;
  }
  const at = model.indexOf("/");
  if (at <= 0) return null;
  const wildcard = `${model.slice(0, at)}/*`;
  for (const p of PRICE_TABLE) {
    if (p.key === wildcard && p.op === op) return p;
  }
  return null;
}

/** Half-up rounding of the exact rational `numerator / 1_000_000` (integers only). */
function roundHalfUpMicroUsd(tokens: number, pricePerMTok: number): number {
  const product = tokens * pricePerMTok; // exact in float64 for realistic magnitudes (< 2^53)
  return Math.floor((product + 500_000) / 1_000_000);
}

/**
 * Compute the deterministic integer cost of a usage record.
 * `null` price ⇒ `null` cost (never silently free).
 */
export function costOf(model: string, op: ModelOp, usage: TokenUsage): UsageCost | null {
  const price = priceFor(model, op);
  if (price === null) return null;
  const inputMicroUsd = roundHalfUpMicroUsd(usage.inputTokens, price.inputMicroUsdPerMTok);
  const outputMicroUsd = roundHalfUpMicroUsd(usage.outputTokens, price.outputMicroUsdPerMTok);
  return { inputMicroUsd, outputMicroUsd, totalMicroUsd: inputMicroUsd + outputMicroUsd };
}

/** Human/JSON display form: integer micro-USD → "$0.001230" (6 decimals, trimmed). */
export function formatMicroUsd(microUsd: number): string {
  const dollars = microUsd / 1_000_000;
  return `$${dollars.toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0")}`;
}

/** Sum rollups (integer addition — associative, order-free, exact). */
export function addCosts(a: UsageCost | null, b: UsageCost | null): UsageCost | null {
  if (a === null && b === null) return null;
  const x = a ?? { inputMicroUsd: 0, outputMicroUsd: 0, totalMicroUsd: 0 };
  const y = b ?? { inputMicroUsd: 0, outputMicroUsd: 0, totalMicroUsd: 0 };
  return {
    inputMicroUsd: x.inputMicroUsd + y.inputMicroUsd,
    outputMicroUsd: x.outputMicroUsd + y.outputMicroUsd,
    totalMicroUsd: x.totalMicroUsd + y.totalMicroUsd,
  };
}
