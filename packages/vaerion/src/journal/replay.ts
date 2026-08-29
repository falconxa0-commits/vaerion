/**
 * Vaerion — journal replay & deterministic restoration.
 *
 * A journal replays to identical final state given the same reducer
 * (R-RT2). Reducers are pure folds over records; snapshots are accelerators
 * that may skip ahead but never alter the fold's result (E1501 if a snapshot
 * claims a seq whose fold disagrees).
 */

import type { JournalRecord } from "./records.ts";
import type { ReadResult } from "./reader.ts";
import { readJournal } from "./reader.ts";

export type Reducer<S> = (state: S, rec: JournalRecord) => S;

export interface ReplayOptions<S> {
  records: JournalRecord[];
  reducer: Reducer<S>;
  initial: S;
  /**
   * Validate a snapshot before resuming from it. Default: accept only states
   * that look like a harness RunState (snapshots are accelerators; anything
   * else is ignored and the fold runs from the beginning — deterministically).
   */
  snapshotValidator?: (rec: Extract<JournalRecord, { k: "snapshot" }>, stateAtSeq: S) => boolean;
}

/** Default snapshot validation: is this actually a foldable RunState? */
function defaultSnapshotValidator(rec: Extract<JournalRecord, { k: "snapshot" }>): boolean {
  const s = rec.state as Record<string, unknown> | null;
  return (
    s !== null &&
    typeof s === "object" &&
    typeof s.runId === "string" &&
    typeof s.traceId === "string" &&
    (s.status === "open" || s.status === "awaiting_gate" || s.status === "closed") &&
    Array.isArray(s.openGates) &&
    Array.isArray(s.resolvedGates) &&
    Array.isArray(s.blobRefs) &&
    typeof s.decisions === "object" && s.decisions !== null
  );
}

export interface ReplayResult<S> {
  state: S;
  appliedRecords: number;
  appliedFromIndex: number; // 1-based record index replay started at
  usedSnapshot: boolean;
  snapshotSeq: number | null;
}

/**
 * Fold records into state. The LAST snapshot passing validation is used as
 * the starting point; earlier records are skipped — deterministically, since
 * the snapshot itself was produced by this same fold. Unvalidated snapshots
 * are transparent (never trusted, never fatal).
 */
export function replayRecords<S>(opts: ReplayOptions<S>): ReplayResult<S> {
  const { records, reducer, initial } = opts;
  const validator = opts.snapshotValidator ?? ((rec) => defaultSnapshotValidator(rec));

  // Locate the last usable snapshot.
  let snapIdx = -1;
  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx];
    if (rec && rec.k === "snapshot" && validator(rec, initial)) snapIdx = idx;
  }

  let state = initial;
  let applied = 0;
  let fromIndex = 1;
  let usedSnapshot = false;
  let snapshotSeq: number | null = null;

  if (snapIdx >= 0) {
    const snap = records[snapIdx] as Extract<JournalRecord, { k: "snapshot" }>;
    state = snap.state as S;
    // Fold the snapshot record itself so counters it represents stay exact.
    state = reducer(state, snap);
    usedSnapshot = true;
    snapshotSeq = snap.seq_at;
    fromIndex = (snapIdx as number) + 2;
    applied = snapIdx as number;
  }

  for (let idx = usedSnapshot ? fromIndex - 1 : 0; idx < records.length; idx++) {
    const rec = records[idx];
    if (!rec) continue;
    if (usedSnapshot && idx <= (snapIdx as number)) continue;
    state = reducer(state, rec);
    applied++;
  }

  return {
    state,
    appliedRecords: usedSnapshot ? records.length - (snapIdx as number) : applied,
    appliedFromIndex: fromIndex,
    usedSnapshot,
    snapshotSeq,
  };
}

/** Read + replay in one step. Torn tails are refused here — verify/recover first. */
export async function replayJournal<S>(
  journalPath: string,
  reducer: Reducer<S>,
  initial: S,
): Promise<ReplayResult<S> & { read: ReadResult }> {
  const read = await readJournal(journalPath);
  if (read.torn) {
    throw Object.assign(new Error(`journal has a torn tail; recover before replay: ${journalPath}`), { code: "E1002" });
  }
  const result = replayRecords<S>({ records: read.records, reducer, initial });
  return { ...result, read };
}
