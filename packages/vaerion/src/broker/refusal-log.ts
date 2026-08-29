/**
 * Vaerion — broker: the durable Refusal Log (constitution MS-2, Sacred
 * Invariant #3 family: every refusal is a first-class record).
 *
 * Law: the broker refuses nothing silently. Every deny decision — explicit
 * (E1300) or fail-closed (E1301) — lands in a hash-chained, append-only
 * ledger at `.vaerion/refusals.log`, using the same chain primitive as the
 * journal and the audit ledger (blake3 over canonical JSON). The writer is
 * the ONLY write surface; readers verify continuity; the log is never
 * truncated except by the same recovery law as journals (never here —
 * corruption is reported loudly, never papered over).
 *
 * Entries reference the journaled decision (`decision_id`, `run_id`) so a
 * refusal can always be traced to the decision record that caused it.
 */

import { open, mkdir, readFile, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalJson } from "../kernel/canonical.ts";
import { blake3HexOf, GENESIS_HASH, type HashHex } from "../kernel/hash.ts";
import { SystemClock, type Clock } from "../kernel/clock.ts";
import type { Principal } from "./contracts/principal.ts";
import type { BrokerDecisionRecord } from "./contracts/decision.ts";

/** One refusal: the broker said no, and here is the receipt-shaped why. */
export interface RefusalEntry {
  k: "refusal";
  i: number;
  prev: HashHex;
  hash: HashHex;
  at: string;
  run_id: string;
  decision_id: string;
  request_id: string;
  principal: Principal;
  domain: string;
  scope: string;
  reason_code: "E1300" | "E1301";
  reason: string;
  /** Policy that produced (or defaulted to) the denial. */
  policy: string;
}

export interface RefusalAppendInput {
  runId: string;
  record: BrokerDecisionRecord;
  /** Precondition: record.decision.kind === "deny". Enforced loudly. */
}

const HASH64 = /^[0-9a-f]{64}$/;

/** Build the canonical refusal body from a journaled deny decision. */
export function refusalFromBody(input: RefusalAppendInput): Omit<RefusalEntry, "k" | "i" | "prev" | "hash" | "at"> {
  const rec = input.record;
  const fail: (why: string) => never = (why) => {
    throw Object.assign(new Error(`refusal log: ${why}`), { code: "E1304" });
  };
  if (!rec || typeof rec !== "object") fail("decision record missing");
  if (rec.decision.kind !== "deny") {
    fail(`only deny decisions are refusals, got "${rec.decision.kind}" for decision ${rec.decision_id}`);
  }
  const denial = rec.decision as Extract<BrokerDecisionRecord["decision"], { kind: "deny" }>;
  return {
    run_id: rec.run_id,
    decision_id: rec.decision_id,
    request_id: rec.request_id,
    principal: rec.principal,
    domain: rec.domain,
    scope: rec.scope,
    reason_code: denial.reason_code,
    reason: denial.reason,
    policy: denial.policy,
  };
}

export class RefusalLogWriter {
  private i = 0;
  private prev: HashHex = GENESIS_HASH;
  private closed = false;
  private readonly path: string;
  private readonly clock: Clock;

  private constructor(path: string, clock: Clock) {
    this.path = path;
    this.clock = clock;
  }

  /** Open (creating if absent) and chain onto the existing head when present. */
  static async open(path: string, existing?: { i: number; head: HashHex } | null, clock?: Clock): Promise<RefusalLogWriter> {
    await mkdir(dirname(path), { recursive: true });
    const w = new RefusalLogWriter(path, clock ?? new SystemClock());
    if (existing) {
      w.i = existing.i;
      w.prev = existing.head;
    }
    return w;
  }

  async append(input: RefusalAppendInput): Promise<number> {
    if (this.closed) throw Object.assign(new Error("refusal log writer closed"), { code: "E1004" });
    const body = refusalFromBody(input);
    const i = this.i + 1;
    const at = this.clock.nowIso();
    const unsealed = { k: "refusal", i, prev: this.prev, at, ...body } as Omit<RefusalEntry, "hash">;
    const hash = await blake3HexOf(canonicalJson(unsealed));
    const entry: RefusalEntry = { ...(unsealed as RefusalEntry), hash };
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

/** Read the ledger head for cross-session chaining (null when absent/empty). */
export async function readRefusalHead(path: string): Promise<{ i: number; head: HashHex } | null> {
  const raw = await readFile(path, "utf8").catch(() => null);
  if (!raw) return null;
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;
  try {
    const last = JSON.parse(lines[lines.length - 1] as string) as { i: number; hash: string };
    return { i: last.i, head: last.hash };
  } catch {
    throw Object.assign(new Error("refusal log tail is corrupt"), { code: "E1003" });
  }
}

export interface RefusalVerifyReport {
  ok: boolean;
  entries: number;
  head: HashHex | null;
  firstBrokenIndex: number | null;
  message: string | null;
}

/** Validate one parsed refusal entry's structure (loud, chain-law adjacent). */
function entryShapeProblem(entry: RefusalEntry, idx: number): string | null {
  if (entry.k !== "refusal") return `line ${idx + 1}: not a refusal record`;
  if (typeof entry.at !== "string" || entry.at.length === 0) return `line ${idx + 1}: missing timestamp`;
  if (typeof entry.run_id !== "string" || entry.run_id.length === 0) return `line ${idx + 1}: missing run_id`;
  if (typeof entry.decision_id !== "string" || entry.decision_id.length === 0) return `line ${idx + 1}: missing decision_id`;
  if (entry.reason_code !== "E1300" && entry.reason_code !== "E1301") return `line ${idx + 1}: reason_code must be E1300|E1301`;
  if (typeof entry.reason !== "string" || entry.reason.length === 0) return `line ${idx + 1}: missing reason`;
  if (!entry.principal || typeof entry.principal !== "object") return `line ${idx + 1}: missing principal`;
  return null;
}

/**
 * Verify refusal-log continuity (same chain law as journal/audit).
 * Corruption is reported, never silently ignored (P9 — no silent loss).
 */
export async function verifyRefusalLog(path: string): Promise<RefusalVerifyReport> {
  const raw = await readFile(path, "utf8").catch(() => null);
  if (raw === null) {
    return { ok: true, entries: 0, head: null, firstBrokenIndex: null, message: "no refusal log yet (clean)" };
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  let prev: HashHex = GENESIS_HASH;
  for (let idx = 0; idx < lines.length; idx++) {
    let entry: RefusalEntry;
    try {
      entry = JSON.parse(lines[idx] as string) as RefusalEntry;
    } catch {
      return { ok: false, entries: idx, head: prev === GENESIS_HASH ? null : prev, firstBrokenIndex: idx + 1, message: `unparseable refusal line ${idx + 1}` };
    }
    if (entry.i !== idx + 1 || entry.prev !== prev) {
      return { ok: false, entries: idx, head: prev === GENESIS_HASH ? null : prev, firstBrokenIndex: idx + 1, message: `refusal chain discontinuity at line ${idx + 1}` };
    }
    const shape = entryShapeProblem(entry, idx);
    if (shape !== null) {
      return { ok: false, entries: idx, head: prev === GENESIS_HASH ? null : prev, firstBrokenIndex: idx + 1, message: shape };
    }
    const computed = await blake3HexOf(canonicalJson({ k: entry.k, i: entry.i, prev: entry.prev, at: entry.at, run_id: entry.run_id, decision_id: entry.decision_id, request_id: entry.request_id, principal: entry.principal, domain: entry.domain, scope: entry.scope, reason_code: entry.reason_code, reason: entry.reason, policy: entry.policy }));
    if (computed !== entry.hash || !HASH64.test(entry.hash)) {
      return { ok: false, entries: idx, head: prev === GENESIS_HASH ? null : prev, firstBrokenIndex: idx + 1, message: `refusal hash mismatch at line ${idx + 1}` };
    }
    prev = entry.hash;
  }
  return { ok: true, entries: lines.length, head: lines.length > 0 ? prev : null, firstBrokenIndex: null, message: null };
}

export interface RefusalFilter {
  runId?: string;
  limit?: number;
}

/** Read refusal entries (newest last). Loud on corruption — use verifyRefusalLog first for reports. */
export async function readRefusals(path: string, filter: RefusalFilter = {}): Promise<RefusalEntry[]> {
  const raw = await readFile(path, "utf8").catch(() => null);
  if (raw === null) return [];
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const out: RefusalEntry[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    let entry: RefusalEntry;
    try {
      entry = JSON.parse(lines[idx] as string) as RefusalEntry;
    } catch {
      throw Object.assign(new Error(`unparseable refusal line ${idx + 1}`), { code: "E1003" });
    }
    if (filter.runId && entry.run_id !== filter.runId) continue;
    out.push(entry);
  }
  return filter.limit !== undefined ? out.slice(-filter.limit) : out;
}
