/**
 * vae-foundation — Receipt contract (Sacred Invariant V, D3.3, D18.9).
 *
 * After every change: what changed · cost · undo · record. Evidence
 * over promises. `--dry-run` prints the prospective receipt without
 * effect. Receipts are schema-checked before emission (E5003).
 */

import { VaeError } from "./errors.ts";

export const RECEIPT_VERSION = 1 as const;

export type ChangeAction = "created" | "modified" | "removed" | "executed" | "none";

export interface ChangeEntry {
  readonly subject: string;
  readonly action: ChangeAction;
  readonly detail?: string;
}

/**
 * Cost accounting. Money is a decimal string, never a float (D8.3).
 */
export interface ReceiptCost {
  readonly steps?: number;
  readonly journal_entries?: number;
  readonly bytes_written?: number;
  readonly wall_ms?: number;
  /** Decimal-string money, e.g. "0.0000". */
  readonly usd?: string;
}

export interface ReceiptRecord {
  readonly run_id?: string;
  readonly journal?: string;
  readonly chain_head?: string;
  readonly refusal_log?: string;
  readonly audit_chain?: string;
}

export interface Receipt {
  readonly receipt_version: typeof RECEIPT_VERSION;
  readonly command: string;
  readonly ok: boolean;
  readonly what_changed: ChangeEntry[];
  readonly cost: ReceiptCost;
  readonly undo: string[];
  readonly record: ReceiptRecord;
}

export interface ReceiptInput {
  readonly command: string;
  readonly ok: boolean;
  readonly what_changed: ChangeEntry[];
  readonly cost?: ReceiptCost;
  readonly undo?: string[];
  readonly record?: ReceiptRecord;
}

/** Build a schema-conformant receipt (throws E5003 on violation). */
export function receipt(input: ReceiptInput): Receipt {
  const r: Receipt = {
    receipt_version: RECEIPT_VERSION,
    command: input.command,
    ok: input.ok,
    what_changed: input.what_changed,
    cost: input.cost ?? {},
    undo: input.undo ?? [],
    record: input.record ?? {},
  };
  assertReceipt(r);
  return r;
}

const MONEY_RE = /^-?\d+(\.\d+)?$/;

export function assertReceipt(value: unknown): asserts value is Receipt {
  const fail = (why: string): VaeError =>
    new VaeError({
      code: "E5003",
      message: `receipt invalid: ${why}`,
      fix: "This is an engine bug: receipts are constitutional evidence (Sacred Invariant V); report it.",
      class: "internal",
    });
  if (typeof value !== "object" || value === null) throw fail("not an object");
  const r = value as Record<string, unknown>;
  if (r["receipt_version"] !== RECEIPT_VERSION) throw fail("unsupported receipt_version");
  if (typeof r["command"] !== "string" || r["command"].length === 0) throw fail("command missing");
  if (typeof r["ok"] !== "boolean") throw fail("ok must be boolean");
  if (!Array.isArray(r["what_changed"])) throw fail("what_changed must be an array");
  if (typeof r["cost"] !== "object" || r["cost"] === null) throw fail("cost missing");
  const cost = r["cost"] as Record<string, unknown>;
  if (cost["usd"] !== undefined && (typeof cost["usd"] !== "string" || !MONEY_RE.test(cost["usd"] as string))) {
    throw fail("cost.usd must be a decimal string, never a float (D8.3)");
  }
  if (!Array.isArray(r["undo"])) throw fail("undo must be an array");
  if (typeof r["record"] !== "object" || r["record"] === null) throw fail("record missing");
}
