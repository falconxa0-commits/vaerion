/**
 * Vaerion — gateway metering rollups (R-MG3).
 *
 * Token and cost accounting is event-sourced: every invocation journals a
 * `gateway.invoke.recorded` event carrying its usage and integer micro-USD
 * cost, and every terminal failure journals `gateway.invoke.failed`. The
 * rollup is a PURE FOLD over journal records — restorable on any machine,
 * replay-compatible by construction (R-RT2), with no side ledger to drift.
 */

import type { JournalRecord } from "../journal/records.ts";
import type { UsageCost } from "./types.ts";

export interface PerModelMetering {
  invocations: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  /** Sum of known costs; unpriced calls are counted, never faked as 0-cost. */
  totalMicroUsd: number;
}

export interface GatewayMeteringRollup {
  invocations: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  totalMicroUsd: number;
  /** Invocations whose model had no price-table entry (cost journaled as null). */
  unpriced: number;
  byModel: Record<string, PerModelMetering>;
}

function emptyPerModel(): PerModelMetering {
  return { invocations: 0, failed: 0, inputTokens: 0, outputTokens: 0, totalMicroUsd: 0 };
}

/**
 * Fold journal records into the metering rollup. Order-free (integer
 * addition is associative): replaying yields identical numbers by law.
 */
export function meteringFromRecords(records: readonly JournalRecord[]): GatewayMeteringRollup {
  const rollup: GatewayMeteringRollup = {
    invocations: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalMicroUsd: 0,
    unpriced: 0,
    byModel: {},
  };
  for (const rec of records) {
    if (rec.k !== "evt") continue;
    const payload = rec.env.payload as Record<string, unknown>;
    if (rec.env.type === "gateway.invoke.recorded") {
      const model = typeof payload.model === "string" ? payload.model : "unknown";
      const usage = payload.usage as { inputTokens?: unknown; outputTokens?: unknown } | undefined;
      const cost = (payload.cost ?? null) as Partial<UsageCost> | null;
      const per = rollup.byModel[model] ?? emptyPerModel();
      per.invocations++;
      rollup.invocations++;
      if (usage && Number.isInteger(usage.inputTokens) && Number.isInteger(usage.outputTokens)) {
        per.inputTokens += usage.inputTokens as number;
        rollup.inputTokens += usage.inputTokens as number;
        per.outputTokens += usage.outputTokens as number;
        rollup.outputTokens += usage.outputTokens as number;
      }
      if (cost && Number.isInteger(cost.totalMicroUsd)) {
        per.totalMicroUsd += cost.totalMicroUsd as number;
        rollup.totalMicroUsd += cost.totalMicroUsd as number;
      } else {
        rollup.unpriced++;
      }
      rollup.byModel[model] = per;
    } else if (rec.env.type === "gateway.invoke.failed") {
      const model = typeof payload.model === "string" ? payload.model : "unknown";
      const per = rollup.byModel[model] ?? emptyPerModel();
      per.failed++;
      rollup.failed++;
      rollup.byModel[model] = per;
    }
  }
  return rollup;
}
