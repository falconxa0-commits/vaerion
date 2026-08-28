/**
 * vae-context — the pack contract (D14.1, D14.2, D14.4).
 *
 * Packs are deterministic artifacts of a run: every inclusion is
 * provenance-tracked, every exclusion carries a reason — exclusion is
 * never silent. The assembler port is implemented in MS-4; the
 * contract ships now so packs have exactly one lawful shape.
 */

import type { ProvenanceRecord } from "./research.ts";

export type MemoryScope = "run" | "session" | "project";

export interface PackItem {
  readonly content: string;
  readonly provenance: ProvenanceRecord;
  /** Token estimate recorded at assembly time (budget adherence, D20.5). */
  readonly tokensEstimate: number;
}

export interface ExclusionEntry {
  readonly candidate: string;
  readonly reason: string;
}

export interface ContextPack {
  readonly packVersion: 1;
  readonly scope: MemoryScope;
  readonly items: PackItem[];
  /** Mandatory: why every considered-but-excluded candidate is out (D14.4). */
  readonly exclusions: ExclusionEntry[];
  readonly fingerprint: string;
}

/** Pack assembler port (MS-4 implements; the contract is law now). */
export interface PackAssembler {
  assemble(input: { goal: string; scope: MemoryScope; budgetTokens: number }): Promise<ContextPack>;
}

export type { ProvenanceRecord } from "./research.ts";
