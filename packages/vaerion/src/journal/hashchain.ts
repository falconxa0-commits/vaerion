/**
 * Vaerion — journal hash chain.
 *
 * hash(rec) = blake3( canonicalJson(rec_without_hash) )
 * prev of record i=1 is GENESIS_HASH (64 zeros).
 *
 * The chain is the tamper-evidence layer for both run journals and the audit
 * ledger (same primitive, one implementation).
 */

import { canonicalJson } from "../kernel/canonical.ts";
import { blake3HexOf, GENESIS_HASH, type HashHex } from "../kernel/hash.ts";
import { stripHash, type JournalRecord, type UnsealedRecord } from "./records.ts";
export type { UnsealedRecord };

export { GENESIS_HASH };

/**
 * Compute a record's hash over its unsealed form. Async because blake3
 * (hash-wasm) is async; the writer awaits per record — durability over speed
 * is a ratified posture for the journal.
 */
export async function hashRecord(unsealed: UnsealedRecord): Promise<HashHex> {
  return blake3HexOf(canonicalJson(unsealed));
}

/** Seal: stamp hash onto an unsealed record (pure — returns a new object). */
export async function sealRecord(unsealed: UnsealedRecord): Promise<JournalRecord> {
  const hash = await hashRecord(unsealed);
  return { ...(unsealed as JournalRecord), hash } as JournalRecord;
}

export function expectedPrev(records: JournalRecord[]): HashHex {
  const last = records[records.length - 1];
  return last ? last.hash : GENESIS_HASH;
}

/**
 * Verify chain continuity over already-parsed, shape-valid records.
 * Returns the first failure only (deterministic diagnosis), or null.
 */
export async function firstChainError(records: JournalRecord[]): Promise<{ i: number; reason: string } | null> {
  let prev: HashHex = GENESIS_HASH;
  for (const rec of records) {
    if (rec.i !== (prev === GENESIS_HASH ? 1 : rec.i)) {
      // index continuity checked by caller (needs full list); here only linkage
    }
    if (rec.prev !== prev) {
      return { i: rec.i, reason: `prev mismatch: expected ${prev.slice(0, 12)}…, found ${rec.prev.slice(0, 12)}…` };
    }
    const actual = await hashRecord(stripHash(rec));
    if (actual !== rec.hash) {
      return { i: rec.i, reason: `hash mismatch: recorded ${rec.hash.slice(0, 12)}…, computed ${actual.slice(0, 12)}…` };
    }
    prev = rec.hash;
  }
  return null;
}

/** Check 1-based index continuity (pure, sync). */
export function firstIndexError(records: JournalRecord[]): { i: number; reason: string } | null {
  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx] as JournalRecord;
    if (rec.i !== idx + 1) {
      return { i: rec.i, reason: `chain index out of order: expected ${idx + 1}, found ${rec.i}` };
    }
  }
  return null;
}
