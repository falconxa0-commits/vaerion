/**
 * Vaerion — citations.
 *
 * Law: every claim answerable to research content must be attributable. A
 * citation is a stable pointer (id + locator + optional verbatim quote) from
 * rendered context back to an evidence record. Citation ids are minted from
 * the GIVEN order — 0001-based, zero-padded — so the same input order always
 * yields the same ids (no clock, no randomness).
 */

import type { EvidenceRecord } from "./evidence.ts";

export interface Citation {
  citation_id: string;
  evidence_id: string;
  locator: string;
  quote: string | null;
}

/**
 * Build citations for `evidence` in the order given. quote = quoteMap[id] ?? null.
 * Deterministic: same evidence order ⇒ same citation ids.
 */
export function makeCitations(evidence: EvidenceRecord[], quoteMap: Record<string, string | null>): Citation[] {
  return evidence.map((rec, idx) => ({
    citation_id: `cit_${String(idx + 1).padStart(4, "0")}`,
    evidence_id: rec.evidence_id,
    locator: rec.provenance.locator,
    quote: quoteMap[rec.evidence_id] ?? null,
  }));
}
