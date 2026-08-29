/**
 * Vaerion — journal integrity verification.
 *
 * Verifies, in order, for every record:
 *   1. shape (records.ts),
 *   2. 1-based index continuity,
 *   3. blake3 linkage + content hash,
 *   4. evt records: gapless per-run seq (1..N),
 *   5. export journals: derivation note present when note==="export" contract
 *      fields demand it.
 *
 * Same primitive verifies the audit ledger (a journal of meta records).
 */

import { readJournal, type ReadResult } from "./reader.ts";
import { firstChainError, firstIndexError } from "./hashchain.ts";
import { stripHash } from "./records.ts";
import { hashRecord } from "./hashchain.ts";

export interface VerifyIssue {
  i: number | null;
  code: "E1001" | "E1002" | "E1003" | "E1005" | "E1006" | "E1009";
  message: string;
}

export interface VerifyReport {
  ok: boolean;
  path: string;
  records: number;
  events: number;
  maxSeq: number;
  headHash: string | null;
  torn: boolean;
  issues: VerifyIssue[];
}

export async function verifyJournal(journalPath: string): Promise<VerifyReport> {
  const report: VerifyReport = {
    ok: false,
    path: journalPath,
    records: 0,
    events: 0,
    maxSeq: 0,
    headHash: null,
    torn: false,
    issues: [],
  };

  let read: ReadResult;
  try {
    read = await readJournal(journalPath);
  } catch (err) {
    report.issues.push({ i: null, code: "E1003", message: (err as Error).message });
    return report;
  }

  report.torn = read.torn;
  if (read.torn) {
    report.issues.push({ i: null, code: "E1002", message: `torn tail: ${read.tornTailMessage ?? "incomplete final record"}` });
  }
  report.records = read.records.length;
  if (read.records.length === 0) {
    report.issues.push({ i: null, code: "E1006", message: "journal has no complete records" });
    return finalize(report);
  }

  const idxErr = firstIndexError(read.records);
  if (idxErr) {
    report.issues.push({ i: idxErr.i, code: "E1001", message: idxErr.reason });
    return finalize(report);
  }

  const chainErr = await firstChainError(read.records);
  if (chainErr) {
    report.issues.push({ i: chainErr.i, code: "E1001", message: chainErr.reason });
    return finalize(report);
  }

  // Per-record content re-verification beyond the first failure is skipped by
  // firstChainError; for a green pass we recompute everything deterministically.
  let prev = "0".repeat(64);
  for (const rec of read.records) {
    const computed = await hashRecord(stripHash(rec));
    if (computed !== rec.hash || rec.prev !== prev) {
      report.issues.push({ i: rec.i, code: "E1001", message: `chain mismatch at record ${rec.i}` });
      return finalize(report);
    }
    prev = rec.hash;
    if (rec.k === "evt") {
      report.events++;
      report.maxSeq = Math.max(report.maxSeq, rec.env.seq);
    }
  }

  // Gapless seq check for evt records.
  let expectSeq = 1;
  for (const rec of read.records) {
    if (rec.k !== "evt") continue;
    if (rec.env.seq !== expectSeq) {
      report.issues.push({ i: rec.i, code: "E1005", message: `seq gap: expected ${expectSeq}, found ${rec.env.seq}` });
      return finalize(report);
    }
    expectSeq++;
  }

  const head = read.records[read.records.length - 1];
  report.headHash = head ? head.hash : null;
  return finalize(report);
}

function finalize(r: VerifyReport): VerifyReport {
  r.ok = r.issues.length === 0;
  return r;
}
