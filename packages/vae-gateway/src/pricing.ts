/**
 * vae-gateway — versioned pricing tables (D13.3).
 *
 * Pricing is versioned data, not code. Staleness is surfaced, never
 * hidden. Costs feed receipts (Sacred Invariant V) as decimal strings
 * (D8.3).
 */

import { blake3Text, canonicalJson } from "vae-foundation";

export interface ModelPrice {
  /** USD per million input tokens — decimal string. */
  readonly inputPerMTok: string;
  /** USD per million output tokens — decimal string. */
  readonly outputPerMTok: string;
}

export interface PricingTable {
  readonly pricingVersion: 1;
  readonly asOf: string;
  readonly models: Readonly<Record<string, ModelPrice>>;
}

export const SEED_PRICING: PricingTable = {
  pricingVersion: 1,
  asOf: "2026-01-01",
  models: {
    "mock:free": { inputPerMTok: "0.00", outputPerMTok: "0.00" },
  },
};

export function pricingFingerprint(table: PricingTable): string {
  return blake3Text(canonicalJson(table));
}

/** Look up a price; unknown models are surfaced, never silently priced at zero. */
export function priceFor(table: PricingTable, model: string): ModelPrice {
  const price = table.models[model];
  if (price === undefined) {
    throw new Error(`no pricing entry for model '${model}' (pricing v${table.pricingVersion}, as of ${table.asOf}) — staleness is surfaced, not hidden (D13.3)`);
  }
  return price;
}
