/**
 * Vaerion — research state replay.
 *
 * Law: research state is restorable by folding the run's journal (R-RT2) —
 * snapshots are accelerators, never truth. The reducer is a PURE fold: it
 * never mutates its inputs, never reads a clock, and returns unknown records
 * unchanged (forward-compat duty). Known research events with malformed
 * payloads fail loudly; replayResearch wraps that as E1500 (restore failed).
 */

import type { Reducer } from "../journal/replay.ts";
import type { JournalRecord } from "../journal/records.ts";
import { VaerionError } from "../kernel/errors.ts";
import { assertEvidenceShape, type EvidenceRecord } from "./evidence.ts";
import { assertIndexedDocShape, type IndexedDoc } from "./local-index.ts";

export interface ResearchPackRef {
  pack_fingerprint: string;
  query: string;
  capability: string;
}

export interface ResearchState {
  evidence: EvidenceRecord[];
  documents: IndexedDoc[];
  packs: ResearchPackRef[];
}

export const initialResearchState: ResearchState = {
  evidence: [],
  documents: [],
  packs: [],
};

function packRefOf(payload: Record<string, unknown>): ResearchPackRef {
  const pack_fingerprint = payload.pack_fingerprint;
  const query = payload.query;
  const capability = payload.capability;
  if (typeof pack_fingerprint !== "string" || pack_fingerprint.length === 0) {
    throw new VaerionError("E1600", "research.context.prepared payload: pack_fingerprint missing");
  }
  if (typeof query !== "string") {
    throw new VaerionError("E1600", "research.context.prepared payload: query missing");
  }
  if (typeof capability !== "string" || capability.length === 0) {
    throw new VaerionError("E1600", "research.context.prepared payload: capability missing");
  }
  return { pack_fingerprint, query, capability };
}

/**
 * Pure fold: journal records → research state. Unknown kinds/events are
 * returned unchanged (same content, fresh container for appended events).
 */
export const researchStateReducer: Reducer<ResearchState> = (state, rec) => {
  if (rec.k !== "evt") return state;
  const type = rec.env.type;
  if (type === "research.evidence.recorded") {
    const evidence = rec.env.payload.evidence;
    assertEvidenceShape(evidence);
    return { ...state, evidence: [...state.evidence, evidence] };
  }
  if (type === "research.index.updated") {
    const doc = rec.env.payload.doc;
    assertIndexedDocShape(doc);
    return { ...state, documents: [...state.documents, doc] };
  }
  if (type === "research.context.prepared") {
    return { ...state, packs: [...state.packs, packRefOf(rec.env.payload)] };
  }
  return state;
};

/**
 * Full fold from record 0 (own simple loop — snapshot semantics deliberately
 * not applied here). Corrupt research payloads surface as E1500.
 */
export function replayResearch(records: JournalRecord[]): ResearchState {
  let state = initialResearchState;
  for (const rec of records) {
    try {
      state = researchStateReducer(state, rec);
    } catch (err) {
      throw new VaerionError(
        "E1500",
        `research state restore failed at record index ${rec.i}: ${(err as Error).message}`,
        { record_index: rec.i },
        err,
      );
    }
  }
  return state;
}
