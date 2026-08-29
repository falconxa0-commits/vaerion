/**
 * Vaerion — crash recovery.
 *
 * A crash mid-append can leave a torn tail (partial final line). Recovery:
 *   1. reads the journal and locates the last complete record;
 *   2. truncates the torn tail bytes (the ONLY sanctioned tail mutation);
 *   3. appends a `meta note="recovery"` record through the normal sealing
 *      path — so the chain stays intact and the recovery itself is auditable;
 *   4. refuses to touch mid-file corruption (E1003/E1001) — that is evidence,
 *      not a crash artifact, and must be investigated.
 *
 * A stale single-writer lock whose owner is provably dead may be cleared here
 * only, with the check in lock.ts.
 */

import { truncate, unlink } from "node:fs/promises";
import { readJournal } from "./reader.ts";
import { firstIndexError, firstChainError } from "./hashchain.ts";
import { acquireJournalLock, lockOwnerDead, readLockBody } from "./lock.ts";
import { JournalWriter, ENGINE_VERSION } from "./writer.ts";
import { SystemClock, type Clock } from "../kernel/clock.ts";
import { VaerionError } from "../kernel/errors.ts";

export interface RecoveryReport {
  journalPath: string;
  tornTailRemoved: boolean;
  bytesRemoved: number;
  recordsRecovered: number;
  recoveryRecordIndex: number | null;
  lockCleared: boolean;
}

export async function recoverJournal(journalPath: string, runId: string, configFingerprint: string, clock: Clock = new SystemClock()): Promise<RecoveryReport> {
  const report: RecoveryReport = {
    journalPath,
    tornTailRemoved: false,
    bytesRemoved: 0,
    recordsRecovered: 0,
    recoveryRecordIndex: null,
    lockCleared: false,
  };

  // 1. Stale lock handling.
  const lockPath = journalPath + ".lock";
  const lockBody = await readLockBody(lockPath);
  if (lockBody) {
    if (await lockOwnerDead(lockPath)) {
      await unlink(lockPath);
      report.lockCleared = true;
    } else {
      throw new VaerionError("E1000", "live writer holds the journal lock; recovery refused", { lock_path: lockPath });
    }
  }

  const read = await readJournal(journalPath);

  if (read.torn) {
    // 2. Truncate the torn tail.
    await truncate(journalPath, read.completeByteLength);
    report.tornTailRemoved = true;
    report.bytesRemoved = read.tornTailBytes?.byteLength ?? 0;
  }

  // 3. Chain sanity after truncation — if still broken mid-file, stop loudly.
  const post = await readJournal(journalPath);
  if (post.records.length > 0) {
    const idxErr = firstIndexError(post.records);
    if (idxErr) throw new VaerionError("E1001", `recovery refused, index corruption: ${idxErr.reason}`, { i: idxErr.i });
    const chainErr = await firstChainError(post.records);
    if (chainErr) throw new VaerionError("E1001", `recovery refused, chain corruption: ${chainErr.reason}`, { i: chainErr.i });
    report.recordsRecovered = post.records.length;
  } else {
    throw new VaerionError("E1006", "recovery refused: no complete records survive (journal unusable)", { journal_path: journalPath });
  }

  // 4. Re-seal with an auditable recovery note (writer verifies chain on open).
  const writer = await JournalWriter.open({ journalPath, runId, configFingerprint, clock });
  try {
    await writer.appendMeta({
      k: "meta",
      note: "recovery",
      run_id: runId,
      engine_version: ENGINE_VERSION,
      detail: {
        torn_tail_removed: report.tornTailRemoved,
        bytes_removed: report.bytesRemoved,
        records_before_recovery_note: report.recordsRecovered,
      },
    });
    report.recoveryRecordIndex = writer.chainLength;
  } finally {
    await writer.close();
  }

  return report;
}
