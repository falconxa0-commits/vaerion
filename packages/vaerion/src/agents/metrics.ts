/**
 * Vaerion — agent metrics (MS-4).
 *
 * A pure fold over journal records — the ONLY accounting there is. Latency,
 * cost, tokens, success, failures, retries, and tool activity all come from
 * the spine events the runtime already journaled (R-RT2: state is a fold of
 * the journal; no counters live anywhere else). Integer micro-USD throughout.
 */

import type { JournalRecord } from "../journal/records.ts";

export interface AgentMetrics {
  run: {
    started: boolean;
    outcome: "goal" | "step_limit" | "failed" | "awaiting_gate" | null;
    steps: number;
    failures: number;
    retries: number;
  };
  model: {
    invocations: number;
    inputTokens: number;
    outputTokens: number;
    costMicroUsd: number;
    latencyMs: number;
    attempts: number;
  };
  tools: {
    requested: number;
    completed: number;
    denied: number;
    failed: number;
  };
  context: {
    packs: number;
    notes: number;
    folds: number;
  };
  gates: {
    opened: number;
    resolved: number;
  };
}

/** Fold agent metrics from journal records (order-free, deterministic). */
export function agentMetricsFromRecords(records: ReadonlyArray<JournalRecord>): AgentMetrics {
  const m: AgentMetrics = {
    run: { started: false, outcome: null, steps: 0, failures: 0, retries: 0 },
    model: { invocations: 0, inputTokens: 0, outputTokens: 0, costMicroUsd: 0, latencyMs: 0, attempts: 0 },
    tools: { requested: 0, completed: 0, denied: 0, failed: 0 },
    context: { packs: 0, notes: 0, folds: 0 },
    gates: { opened: 0, resolved: 0 },
  };
  for (const rec of records) {
    if (rec.k !== "evt") {
      if (rec.k === "gate") {
        if (rec.gate.state === "open") m.gates.opened++;
        else if (rec.gate.state === "resolved") m.gates.resolved++;
      }
      continue;
    }
    const p = rec.env.payload as Record<string, unknown>;
    const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
    switch (rec.env.type) {
      case "agent.run.started":
        m.run.started = true;
        break;
      case "agent.run.completed":
        m.run.outcome = (typeof p.outcome === "string" ? p.outcome : null) as AgentMetrics["run"]["outcome"];
        break;
      case "agent.step.recorded": {
        m.run.steps++;
        if (typeof p.attempt === "number" && p.attempt > 1) m.run.retries += p.attempt - 1;
        break;
      }
      case "agent.step.failed": {
        m.run.failures++;
        const attempts = int(p.attempts);
        if (attempts > 1) m.run.retries += attempts - 1;
        break;
      }
      case "gateway.invoke.recorded": {
        // THE metering truth: every model invocation crosses the single gate,
        // so tokens/cost/latency fold from ITS records only (never from step
        // events — that would double-count planner + step spend).
        const usage = p.usage as { inputTokens?: unknown; outputTokens?: unknown } | null | undefined;
        const cost = p.cost as { totalMicroUsd?: unknown } | null | undefined;
        m.model.invocations++;
        m.model.inputTokens += int(usage?.inputTokens);
        m.model.outputTokens += int(usage?.outputTokens);
        m.model.costMicroUsd += int(cost?.totalMicroUsd);
        m.model.latencyMs += int(p.latency_ms);
        m.model.attempts += int(p.attempts);
        break;
      }
      case "gateway.invoke.failed":
        m.model.invocations++;
        m.model.attempts += int(p.attempts);
        break;
      case "tool.call.requested":
        m.tools.requested++;
        break;
      case "tool.call.completed": {
        m.tools.completed++;
        if (p.ok === false) m.tools.failed++;
        break;
      }
      case "tool.call.denied":
        m.tools.denied++;
        break;
      case "research.context.prepared":
        m.context.packs++;
        break;
      case "reasoning.note.recorded":
        m.context.notes++;
        break;
      case "reasoning.folded":
        m.context.folds++;
        break;
      default:
        break;
    }
  }
  return m;
}
