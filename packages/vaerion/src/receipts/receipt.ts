/**
 * Vaerion — receipts.
 *
 * A run is not finished until it has a receipt: a verifiable, journaled
 * summary of what happened (guarantee #4 of the Five Guarantees). The
 * receipt is computed FROM the journal, so it can never disagree with it —
 * construction is a fold, not an assertion.
 */

import type { JournalRecord } from "../journal/records.ts";
import type { HashHex } from "../kernel/hash.ts";

export interface RunReceipt {
  run_id: string;
  trace_id: string;
  engine_version: string;
  config_fingerprint: string;
  opened_at: string | null;
  closed_at: string;
  counts: {
    records: number;
    events: number;
    decisions_allow: number;
    decisions_deny: number;
    decisions_prompt: number;
    gates_opened: number;
    gates_resolved: number;
    snapshots: number;
    recovery_notes: number;
  };
  blob_refs: Array<{ alg: "blake3"; hash: string; size: number }>;
  journal: {
    records: number;
    head_hash: HashHex;
  };
  /** Human summary of what the run did (bounded length). */
  summary: string;
}

export function assertReceiptShape(value: unknown): asserts value is RunReceipt {
  const r = value as Partial<RunReceipt> | null;
  const fail: (m: string) => never = (m) => {
    throw Object.assign(new Error(m), { code: "E1003" });
  };
  if (!r || typeof r !== "object") fail("receipt missing");
  if (typeof r.run_id !== "string" || r.run_id.length === 0) fail("receipt.run_id missing");
  if (typeof r.trace_id !== "string" || r.trace_id.length === 0) fail("receipt.trace_id missing");
  if (!r.counts || typeof r.counts !== "object") fail("receipt.counts missing");
  if (!r.journal || typeof r.journal.head_hash !== "string") fail("receipt.journal.head_hash missing");
}

/**
 * Fold the journal into a receipt. This is the authoritative construction:
 * counts and head hash come from the records themselves.
 */
export function buildReceiptFromRecords(records: JournalRecord[], opts: { closedAt: string; engineVersion: string; summary: string }): RunReceipt {
  const counts = {
    records: records.length,
    events: 0,
    decisions_allow: 0,
    decisions_deny: 0,
    decisions_prompt: 0,
    gates_opened: 0,
    gates_resolved: 0,
    snapshots: 0,
    recovery_notes: 0,
  };
  let runId = "";
  let traceId = "";
  let engineVersion = opts.engineVersion;
  let configFingerprint = "";
  let openedAt: string | null = null;
  const blobRefs = new Map<string, { alg: "blake3"; hash: string; size: number }>();
  const collectBlob = (ref: unknown): void => {
    const b = ref as { alg?: string; hash?: string; size?: number } | null;
    if (b && b.alg === "blake3" && typeof b.hash === "string" && typeof b.size === "number") {
      blobRefs.set(b.hash, { alg: "blake3", hash: b.hash, size: b.size });
    }
  };

  for (const rec of records) {
    if (rec.k === "meta") {
      if (rec.note === "header") {
        runId = rec.run_id;
        engineVersion = rec.engine_version ?? engineVersion;
        configFingerprint = rec.config_fingerprint ?? configFingerprint;
        openedAt = rec.opened_at ?? null;
      }
      if (rec.note === "recovery") counts.recovery_notes++;
    } else if (rec.k === "evt") {
      counts.events++;
      if (!traceId) traceId = rec.env.trace_id;
      const payload = rec.env.payload as Record<string, unknown>;
      if (rec.env.type === "store.blob.put") collectBlob(payload.blob_ref);
    } else if (rec.k === "decision") {
      const kind = rec.decision.decision.kind;
      if (kind === "allow") counts.decisions_allow++;
      else if (kind === "deny") counts.decisions_deny++;
      else counts.decisions_prompt++;
    } else if (rec.k === "gate") {
      if (rec.gate.state === "open") counts.gates_opened++;
      else if (rec.gate.state === "resolved") counts.gates_resolved++;
    } else if (rec.k === "snapshot") {
      counts.snapshots++;
    }
  }

  const head = records[records.length - 1];
  return {
    run_id: runId,
    trace_id: traceId,
    engine_version: engineVersion,
    config_fingerprint: configFingerprint,
    opened_at: openedAt,
    closed_at: opts.closedAt,
    counts,
    blob_refs: Array.from(blobRefs.values()),
    journal: { records: counts.records, head_hash: head ? head.hash : "" },
    summary: opts.summary,
  };
}

/** Extract blob refs mentioned in envelope payloads of any event type. */
export function collectBlobRefs(records: JournalRecord[]): Array<{ alg: "blake3"; hash: string; size: number }> {
  const out = new Map<string, { alg: "blake3"; hash: string; size: number }>();
  const visit = (v: unknown): void => {
    if (v === null || typeof v !== "object") return;
    const obj = v as Record<string, unknown>;
    if (obj.alg === "blake3" && typeof obj.hash === "string" && /^[0-9a-f]{64}$/.test(obj.hash) && typeof obj.size === "number") {
      out.set(obj.hash, { alg: "blake3", hash: obj.hash, size: obj.size });
      return;
    }
    for (const val of Object.values(obj)) visit(val);
  };
  for (const rec of records) {
    if (rec.k === "evt") visit(rec.env.payload);
    if (rec.k === "snapshot") visit(rec.state);
  }
  return Array.from(out.values());
}
