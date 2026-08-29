/**
 * Vaerion — journal record model.
 *
 * A journal is an append-only NDJSON file of hash-chained records
 * (`.vaerion/journal/<run_id>.ndjson`, R-RT2). Every record:
 *   { k, i, prev, hash, ...body }
 * where `i` is the 1-based chain index, `prev` the previous record's hash
 * (genesis = 64 zeros), and `hash = blake3(canonicalJson(record without hash))`.
 *
 * Record kinds and the single-writer law:
 *   meta     — journal header / recovery / export derivation notes
 *   evt      — one spine envelope (per-run seq allocated by the writer)
 *   decision — a journaled broker decision (decide → journal → act)
 *   gate     — a durable human gate (open / resolve records)
 *   snapshot — a checkpoint state bag (accelerator for restore, never truth)
 *   receipt  — the run's closing receipt
 */

import type { Envelope } from "../spine/envelope.ts";
import type { HashHex } from "../kernel/hash.ts";
import type { BrokerDecisionRecord } from "../broker/contracts/decision.ts";
import type { GateRecord } from "../broker/contracts/gate.ts";
import type { RunReceipt } from "../receipts/receipt.ts";

export const RECORD_KINDS = ["meta", "evt", "decision", "gate", "snapshot", "receipt"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export interface JournalRecordBase {
  k: RecordKind;
  /** 1-based chain index. */
  i: number;
  prev: HashHex;
  hash: HashHex;
}

export interface MetaRecord extends JournalRecordBase {
  k: "meta";
  note: "header" | "recovery" | "export";
  run_id: string;
  opened_at?: string;
  engine_version?: string;
  config_fingerprint?: string;
  /** recovery/export details */
  detail?: Record<string, unknown>;
}

export interface EvtRecord extends JournalRecordBase {
  k: "evt";
  env: Envelope;
}

export interface DecisionRecord extends JournalRecordBase {
  k: "decision";
  decision: BrokerDecisionRecord;
}

export interface GateRecordWrap extends JournalRecordBase {
  k: "gate";
  gate: GateRecord;
}

export interface SnapshotRecord extends JournalRecordBase {
  k: "snapshot";
  seq_at: number;
  label: string;
  state: Record<string, unknown>;
}

export interface ReceiptRecord extends JournalRecordBase {
  k: "receipt";
  receipt: RunReceipt;
}

export type JournalRecord =
  | MetaRecord
  | EvtRecord
  | DecisionRecord
  | GateRecordWrap
  | SnapshotRecord
  | ReceiptRecord;

/** The record exactly as it enters the chain — before `hash` is stamped. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type UnsealedRecord = DistributiveOmit<JournalRecord, "hash">;
/** A record body pre-chain-stamp (no i/prev/hash yet — the writer adds those). */
export type RecordInput = DistributiveOmit<JournalRecord, "hash" | "i" | "prev">;

export function stripHash(rec: JournalRecord): UnsealedRecord {
  const { hash: _hash, ...rest } = rec;
  return rest as UnsealedRecord;
}

export interface RecordShapeIssue {
  i: number | null;
  code: "E1003";
  message: string;
}

/** Structural validation (hash/chain verified separately). */
export function assertRecordShape(value: unknown): asserts value is JournalRecord {
  const rec = value as Partial<JournalRecord> | null;
  const fail: (msg: string) => never = (msg) => {
    throw Object.assign(new Error(msg), { code: "E1003" });
  };
  if (rec === null || typeof rec !== "object") fail("record is not an object");
  if (!RECORD_KINDS.includes(rec.k as RecordKind)) fail(`unknown record kind: ${String(rec.k)}`);
  if (!Number.isInteger(rec.i) || (rec.i as number) < 1) fail(`chain index invalid: ${String(rec.i)}`);
  if (typeof rec.prev !== "string" || !/^[0-9a-f]{64}$/.test(rec.prev as string)) fail("prev is not a hash hex");
  if (typeof rec.hash !== "string" || !/^[0-9a-f]{64}$/.test(rec.hash as string)) fail("hash is not a hash hex");
  switch (rec.k) {
    case "meta":
      if (rec.note !== "header" && rec.note !== "recovery" && rec.note !== "export") fail(`bad meta note: ${String(rec.note)}`);
      if (typeof rec.run_id !== "string" || rec.run_id.length === 0) fail("meta.run_id missing");
      break;
    case "evt": {
      const env = rec.env as Partial<Envelope> | undefined;
      if (!env || typeof env !== "object") fail("evt.env missing");
      if (!Number.isInteger(env?.seq) || (env?.seq as number) < 1) fail(`evt.env.seq unassigned: ${String(env?.seq)}`);
      break;
    }
    case "decision":
      if (!rec.decision || typeof rec.decision !== "object") fail("decision body missing");
      if (typeof (rec.decision as BrokerDecisionRecord).decision_id !== "string") fail("decision.decision_id missing");
      break;
    case "gate":
      if (!rec.gate || typeof rec.gate !== "object") fail("gate body missing");
      if (typeof (rec.gate as GateRecord).gate_id !== "string") fail("gate.gate_id missing");
      break;
    case "snapshot":
      if (!Number.isInteger(rec.seq_at) || (rec.seq_at as number) < 0) fail("snapshot.seq_at invalid");
      if (typeof rec.label !== "string") fail("snapshot.label missing");
      if (rec.state === null || typeof rec.state !== "object" || Array.isArray(rec.state)) fail("snapshot.state must be an object");
      break;
    case "receipt":
      if (!rec.receipt || typeof rec.receipt !== "object") fail("receipt body missing");
      if (typeof (rec.receipt as RunReceipt).run_id !== "string") fail("receipt.run_id missing");
      break;
  }
}
