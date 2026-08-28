/**
 * vae-store — append-only NDJSON journals with blake3 hash chains (D12.1).
 *
 * The journal is the truth of what happened (Sacred Invariant IV):
 * write once, verify anywhere. The run journal and the audit journal
 * share one format (D12.2). Appends are gapless per journal (D9.2);
 * every entry chains to its predecessor; any mutation is detectable.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { iso, VaeError, runFailureError, type Clock, systemClock } from "vae-foundation";
import { chainEntry, GENESIS, type JournalEntry, type JournalEntryInput } from "./entry.ts";

export class JournalWriter {
  private prevHash: string = GENESIS;
  private nextSeq: number = 1;
  private readonly clock: Clock;

  constructor(
    private readonly file: string,
    options?: { clock?: Clock },
  ) {
    this.clock = options?.clock ?? systemClock;
    if (existsSync(file)) {
      // Resume the chain from journaled truth (recovery per D21.7).
      const entries = readEntries(file);
      const last = entries[entries.length - 1];
      if (last !== undefined) {
        this.prevHash = last.hash;
        this.nextSeq = last.seq + 1;
      }
    } else {
      mkdirSync(dirname(file), { recursive: true });
    }
  }

  /** Append one entry; returns the chained entry as durable truth. */
  append(input: Omit<JournalEntryInput, "seq" | "ts">, atMs?: number): JournalEntry {
    const entry = chainEntry(
      { ...input, seq: this.nextSeq, ts: iso(atMs ?? this.clock.nowMs()) },
      this.prevHash,
    );
    appendFileSync(this.file, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
    this.prevHash = entry.hash;
    this.nextSeq = entry.seq + 1;
    return entry;
  }

  /** Current chain head hash. */
  head(): string {
    return this.prevHash;
  }

  /** Next sequence number (gapless per-run sequencing, D9.2). */
  peekSeq(): number {
    return this.nextSeq;
  }
}

/** Parse a journal file into entries. Malformed lines fail closed. */
export function readEntries(file: string): JournalEntry[] {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  const out: JournalEntry[] = [];
  for (const [i, line] of text.split("\n").entries()) {
    if (line.trim().length === 0) continue;
    try {
      out.push(JSON.parse(line) as JournalEntry);
    } catch {
      throw journalBroken(`line ${i + 1} is not valid JSON`);
    }
  }
  return out;
}

export interface VerificationReport {
  readonly ok: boolean;
  readonly entries: number;
  readonly head?: string;
  readonly brokenAt?: { seq: number; line: number; why: string };
}

function journalBroken(why: string): VaeError {
  return runFailureError("E3001", `Journal hash-chain verification failed: ${why}.`, "Inspect the reported entry; the journal is append-only truth and tampering is detectable (D12.1).");
}

/**
 * Walk the full chain and verify: genesis linkage, hash integrity,
 * prev linkage, gapless sequencing. Any single mutation breaks
 * verification (tamper detection, D12.1).
 */
export function verifyJournal(file: string): VerificationReport {
  const entries = readEntries(file);
  let prevHash = GENESIS;
  let expectedSeq = 1;
  for (const [idx, entry] of entries.entries()) {
    const lineNo = idx + 1;
    if (entry.seq !== expectedSeq) {
      return { ok: false, entries: entries.length, brokenAt: { seq: entry.seq, line: lineNo, why: `gapless sequence violated: expected ${expectedSeq}` } };
    }
    if (entry.prev !== prevHash) {
      return { ok: false, entries: entries.length, brokenAt: { seq: entry.seq, line: lineNo, why: "prev-link mismatch (chain rewritten or reordered)" } };
    }
    const { hash, ...rest } = entry;
    const recomputed = chainEntry(rest as JournalEntryInput, entry.prev).hash;
    if (recomputed !== hash) {
      return { ok: false, entries: entries.length, brokenAt: { seq: entry.seq, line: lineNo, why: "hash mismatch (content mutated)" } };
    }
    prevHash = hash;
    expectedSeq++;
  }
  return { ok: true, entries: entries.length, head: entries.length > 0 ? prevHash : undefined };
}

/** Assert verification; throws E3001 on any break. */
export function assertJournalVerified(file: string): VerificationReport {
  const report = verifyJournal(file);
  if (!report.ok) {
    throw journalBroken(`${report.brokenAt?.why} at line ${report.brokenAt?.line}`);
  }
  return report;
}
