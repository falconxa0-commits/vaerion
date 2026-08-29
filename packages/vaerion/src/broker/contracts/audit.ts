/**
 * Vaerion — broker contracts: audit ledger.
 *
 * Every broker decision — allow, deny, or prompt — lands in a hash-chained
 * audit ledger (`.vaerion/audit.log`), same chain primitive as the journal.
 * The AuditWriter is the ONLY write surface; readers verify continuity.
 */

import { open, mkdir, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJson } from "../../kernel/canonical.ts";
import { blake3HexOf, GENESIS_HASH, type HashHex } from "../../kernel/hash.ts";
import { SystemClock, type Clock } from "../../kernel/clock.ts";
import type { BrokerDecisionRecord } from "./decision.ts";

export type AuditEntryKind = "decision" | "elevation" | "extension_load" | "lock_change";

export interface AuditEntry {
  k: "audit";
  i: number;
  prev: HashHex;
  hash: HashHex;
  kind: AuditEntryKind;
  ref: string;
  at: string;
  /** Redacted entry body (decision records arrive pre-redacted). */
  body: Record<string, unknown>;
}

export interface AuditWriter {
  /** Append one entry; returns its chain index. */
  append(kind: AuditEntryKind, ref: string, body: Record<string, unknown>): Promise<number>;
  chainLength(): number;
  headHash(): HashHex;
  close(): Promise<void>;
}

export class ChainedAuditWriter implements AuditWriter {
  private i = 0;
  private prev: HashHex = GENESIS_HASH;
  private closed = false;
  private readonly path: string;
  private readonly clock: Clock;

  private constructor(auditPath: string, clock: Clock) {
    this.path = auditPath;
    this.clock = clock;
  }

  static async open(auditPath: string, existing?: { i: number; head: HashHex } | null, clock?: Clock): Promise<ChainedAuditWriter> {
    await mkdir(dirname(auditPath), { recursive: true });
    const w = new ChainedAuditWriter(auditPath, clock ?? new SystemClock());
    if (existing) {
      w.i = existing.i;
      w.prev = existing.head;
    }
    return w;
  }

  async append(kind: AuditEntryKind, ref: string, body: Record<string, unknown>): Promise<number> {
    if (this.closed) throw Object.assign(new Error("audit writer closed"), { code: "E1004" });
    const i = this.i + 1;
    const at = this.clock.nowIso();
    const unsealed = { k: "audit", i, prev: this.prev, kind, ref, at, body } as Omit<AuditEntry, "hash">;
    const hash = await blake3HexOf(canonicalJson(unsealed));
    const entry: AuditEntry = { ...(unsealed as AuditEntry), hash };
    const fh: FileHandle = await open(this.path, "a");
    try {
      await fh.write(JSON.stringify(entry) + "\n", 0, "utf8");
      await fh.sync();
    } finally {
      await fh.close();
    }
    this.i = i;
    this.prev = hash;
    return i;
  }

  chainLength(): number {
    return this.i;
  }
  headHash(): HashHex {
    return this.prev;
  }
  async close(): Promise<void> {
    this.closed = true;
  }
}

/** The one law for decision→audit: every decision kind is audit-worthy. */
export function decisionToAuditBody(rec: BrokerDecisionRecord): Record<string, unknown> {
  return {
    decision_id: rec.decision_id,
    request_id: rec.request_id,
    run_id: rec.run_id,
    trace_id: rec.trace_id,
    principal: rec.principal,
    domain: rec.domain,
    scope: rec.scope,
    intent: rec.intent,
    kind: rec.decision.kind,
    policy: rec.decision.policy,
    reason: rec.decision.kind === "deny" ? rec.decision.reason : null,
    decided_at: rec.decided_at,
  };
}

export interface AuditVerifyReport {
  ok: boolean;
  entries: number;
  head: HashHex | null;
  firstBrokenIndex: number | null;
  message: string | null;
}

/**
 * Verify audit ledger continuity (same chain law as the journal).
 * A corrupt tail is reported, never silently ignored (P9 — no silent loss).
 */
export async function verifyAuditLedger(auditPath: string): Promise<AuditVerifyReport> {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(auditPath, "utf8").catch(() => null);
  if (raw === null) {
    return { ok: true, entries: 0, head: null, firstBrokenIndex: null, message: "no audit ledger yet (clean)" };
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  let prev: HashHex = GENESIS_HASH;
  for (let idx = 0; idx < lines.length; idx++) {
    let entry: AuditEntry;
    try {
      entry = JSON.parse(lines[idx] as string) as AuditEntry;
    } catch {
      return { ok: false, entries: idx, head: prev === GENESIS_HASH ? null : prev, firstBrokenIndex: idx + 1, message: `unparseable audit line ${idx + 1}` };
    }
    if (entry.k !== "audit" || entry.i !== idx + 1 || entry.prev !== prev) {
      return { ok: false, entries: idx, head: prev === GENESIS_HASH ? null : prev, firstBrokenIndex: idx + 1, message: `audit chain discontinuity at line ${idx + 1}` };
    }
    const computed = await blake3HexOf(canonicalJson({ k: entry.k, i: entry.i, prev: entry.prev, kind: entry.kind, ref: entry.ref, at: entry.at, body: entry.body }));
    if (computed !== entry.hash) {
      return { ok: false, entries: idx, head: prev === GENESIS_HASH ? null : prev, firstBrokenIndex: idx + 1, message: `audit hash mismatch at line ${idx + 1}` };
    }
    prev = entry.hash;
  }
  return { ok: true, entries: lines.length, head: lines.length > 0 ? prev : null, firstBrokenIndex: null, message: null };
}
