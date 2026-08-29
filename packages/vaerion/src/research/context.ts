/**
 * Vaerion — the ONE context path.
 *
 * Law (ratified): context assembly is a PURE function; the journaled event
 * `research.context.prepared` is the only way an assembled pack becomes
 * visible to a run. blocks[0] is ALWAYS the trusted instruction; every piece
 * of untrusted content travels exclusively as its rendered fence string.
 * Any evidence not in the "untrusted" fencing posture is refused (E1401) —
 * trusted evidence cannot enter a context without a fencing review.
 *
 * Hashing: the pack fingerprint is blake3 over the canonical JSON of the pack
 * WITHOUT the fingerprint field. canonicalJson rejects floats (E1901), so
 * evidence-block scores are carried as integer milli-scores (score × 1000,
 * rounded) — byte-stable by construction.
 */

import { VaerionError } from "../kernel/errors.ts";
import { fingerprintOfPack } from "./fingerprint.ts";
import { assertFencedOrTrusted, renderFence, type FencedBlock } from "./fencing.ts";
import type { ProvenanceRecord } from "./provenance.ts";
import { assertEvidenceShape, type EvidenceRecord } from "./evidence.ts";
import type { Citation } from "./citation.ts";
import type { IndexHit } from "./local-index.ts";
import type { ResearchCapabilityDeclaration } from "./capability.ts";

export interface InstructionBlock {
  kind: "instruction";
  text: string;
}

export interface UntrustedEvidenceBlock {
  kind: "untrusted_evidence";
  /** The rendered fence — the ONLY channel untrusted content travels through. */
  fence: string;
  citation_id: string;
  evidence_id: string;
  /** Integer milli-score (score × 1000, rounded) — canonicalJson-safe. */
  score: number;
}

export type ContextBlock = InstructionBlock | UntrustedEvidenceBlock;

export interface ContextPack {
  query: string;
  capability: string;
  pack_fingerprint: string;
  blocks: ContextBlock[];
  tokens_estimated: number;
  provenance: ProvenanceRecord[];
  dropped_count: number;
}

export interface PrepareContextInput {
  query: string;
  capability: ResearchCapabilityDeclaration;
  hits: IndexHit[];
  evidence: EvidenceRecord[];
  citations: Citation[];
  budgetTokens: number;
  instructionText: string;
}

/** Rebuild the fence for an evidence record (fields are pinned by its provenance). */
function fencedBlockOfEvidence(e: EvidenceRecord): FencedBlock {
  const block: FencedBlock = {
    fence: "untrusted",
    source_id: e.source_id,
    source_path: e.provenance.source_path,
    capability: e.capability,
    fingerprint: e.provenance.fingerprint,
    content: e.excerpt,
  };
  assertFencedOrTrusted(block);
  return block;
}

interface Candidate {
  evidence: EvidenceRecord;
  score: number;
  citationId: string;
  fence: string;
}

/**
 * Assemble a context pack. Pure with respect to its inputs; deterministic:
 *   - evidence blocks ordered by hit score desc, then evidence_id asc;
 *   - an evidence piece is a candidate only if it has a matching hit (joined
 *     via provenance.fingerprint.doc_id) AND a citation — unattributed or
 *     unmatched content is dropped, never silently included;
 *   - candidates are included greedily while the running token estimate
 *     (ceil(chars/4) of the full rendered pack) stays ≤ budgetTokens.
 */
export async function prepareContext(input: PrepareContextInput): Promise<ContextPack> {
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1600", `prepareContext: ${why}`);
  };
  if (!input || typeof input !== "object") fail("input must be an object");
  if (typeof input.query !== "string") fail("query must be a string");
  const capability = input.capability;
  if (!capability || typeof capability !== "object" || typeof capability.name !== "string" || capability.name.length === 0) {
    throw new VaerionError("E1403", "prepareContext: capability must be a declared ResearchCapabilityDeclaration");
  }
  if (!Array.isArray(input.hits)) fail("hits must be an array");
  if (!Array.isArray(input.evidence)) fail("evidence must be an array");
  if (!Array.isArray(input.citations)) fail("citations must be an array");
  if (!Number.isInteger(input.budgetTokens) || input.budgetTokens < 0) {
    fail(`budgetTokens must be a non-negative integer, got ${String(input.budgetTokens)}`);
  }
  if (typeof input.instructionText !== "string" || input.instructionText.length === 0) {
    fail("instructionText must be a non-empty string (blocks[0] is always the trusted instruction)");
  }

  // Fencing gate: EVERY piece of evidence must be in the untrusted posture.
  for (const e of input.evidence) {
    assertEvidenceShape(e);
    if (e.fencing !== "untrusted") {
      throw new VaerionError(
        "E1401",
        `evidence ${e.evidence_id} has fencing "${e.fencing}" — trusted evidence cannot enter a context without fencing review`,
        { evidence_id: e.evidence_id },
      );
    }
  }

  // Join hits → evidence via doc_id; citations → evidence via evidence_id.
  const scoreByDocId = new Map<string, number>();
  for (const hit of input.hits) {
    if (!hit || typeof hit !== "object" || typeof hit.doc_id !== "string") fail("hit missing doc_id");
    scoreByDocId.set(hit.doc_id, hit.score);
  }
  const citationByEvidenceId = new Map<string, string>();
  for (const c of input.citations) {
    if (!c || typeof c !== "object" || typeof c.evidence_id !== "string" || typeof c.citation_id !== "string") {
      fail("citation missing evidence_id/citation_id");
    }
    if (!citationByEvidenceId.has(c.evidence_id)) citationByEvidenceId.set(c.evidence_id, c.citation_id);
  }

  const candidates: Candidate[] = [];
  for (const e of input.evidence) {
    const score = scoreByDocId.get(e.provenance.fingerprint.doc_id);
    const citationId = citationByEvidenceId.get(e.evidence_id);
    if (score === undefined || citationId === undefined) continue; // dropped: no hit or no citation
    candidates.push({ evidence: e, score, citationId, fence: renderFence(fencedBlockOfEvidence(e)) });
  }
  candidates.sort((a, z) => {
    if (z.score !== a.score) return z.score - a.score;
    if (a.evidence.evidence_id < z.evidence.evidence_id) return -1;
    if (a.evidence.evidence_id > z.evidence.evidence_id) return 1;
    return 0;
  });

  // Incremental render accounting: rendered = [header, ...blockTexts].join("\n\n")
  // ⇒ chars = headerLen + Σ (2 + blockTextLen). Exactly equals a full render.
  const header = `# research context\nquery: ${input.query}\ncapability: ${capability.name}`;
  let totalChars = header.length;

  const blocks: ContextBlock[] = [];
  // blocks[0] is ALWAYS the trusted instruction — never budget-gated away.
  blocks.push({ kind: "instruction", text: input.instructionText });
  totalChars += 2 + input.instructionText.length;

  const provenance: ProvenanceRecord[] = [];
  for (const candidate of candidates) {
    const nextChars = totalChars + 2 + candidate.fence.length;
    if (Math.ceil(nextChars / 4) <= input.budgetTokens) {
      totalChars = nextChars;
      blocks.push({
        kind: "untrusted_evidence",
        fence: candidate.fence,
        citation_id: candidate.citationId,
        evidence_id: candidate.evidence.evidence_id,
        score: Math.round(candidate.score * 1000),
      });
      provenance.push(candidate.evidence.provenance);
    }
    // else: dropped — counted below.
  }

  const dropped_count = input.evidence.length - (blocks.length - 1);
  const tokens_estimated = Math.ceil(totalChars / 4);

  // Fingerprint the pack WITHOUT its fingerprint field; insert last.
  const pack_fingerprint = await fingerprintOfPack({
    query: input.query,
    capability: capability.name,
    blocks,
    tokens_estimated,
    provenance,
    dropped_count,
  });

  return {
    query: input.query,
    capability: capability.name,
    pack_fingerprint,
    blocks,
    tokens_estimated,
    provenance,
    dropped_count,
  };
}
