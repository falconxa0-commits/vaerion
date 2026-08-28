/**
 * vae-workflow — declared run plans and deterministic DAG law (Stage 11, D11.2, D11.3).
 *
 * Work is executed only as DECLARED. A plan is a DAG of steps; the
 * schedule is a scheduled fact (ULID-ordered, D11.2), never a race.
 * Parallelism is a workflow-node concern, never an emergent one
 * (D11.3) — the MS-0 executor is strictly sequential.
 */

import type { Json } from "vae-foundation";
import { canonicalJson, blake3Text, usageError } from "vae-foundation";

export interface PlanStep {
  readonly id: string;
  /** Registered tool name (D16.1) — e.g. "journal.verify". */
  readonly tool: string;
  readonly input?: Json;
  /** Step ids this step depends on (implicit linear edges otherwise). */
  readonly needs?: readonly string[];
  /** retry(N) declared per step; the engine never improvises (D16.10). */
  readonly failurePolicy?: "fail" | "retry" | "skip";
}

export interface RunPlan {
  readonly name: string;
  readonly description?: string;
  readonly steps: readonly PlanStep[];
}

/** Structural validation: unique ids, known refs, acyclic graph (E1008). */
export function validatePlan(plan: RunPlan): void {
  const ids = new Set<string>();
  for (const step of plan.steps) {
    if (ids.has(step.id)) {
      throw usageError("E1008", `Run plan '${plan.name}' declares duplicate step id '${step.id}'.`, "Step ids must be unique; repair the plan against spec/schemas/run-plan.schema.json.");
    }
    ids.add(step.id);
  }
  for (const step of plan.steps) {
    for (const dep of step.needs ?? []) {
      if (!ids.has(dep)) {
        throw usageError("E1008", `Run plan '${plan.name}' step '${step.id}' depends on unknown step '${dep}'.`, "Reference only declared step ids; repair the plan against spec/schemas/run-plan.schema.json.");
      }
    }
  }
  assertAcyclic(plan);
}

function assertAcyclic(plan: RunPlan): void {
  const byId = new Map(plan.steps.map((s) => [s.id, s]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string, stack: string[]): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw usageError("E1008", `Run plan '${plan.name}' contains a dependency cycle: ${[...stack, id].join(" → ")}.`, "Break the cycle; run plans are acyclic directed graphs.");
    }
    visiting.add(id);
    for (const dep of byId.get(id)?.needs ?? []) visit(dep, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  };

  for (const step of plan.steps) visit(step.id, []);
}

/**
 * Deterministic execution order: dependencies first, ties broken by
 * declaration order (a stable, scheduled fact — D11.2). The result is
 * identical on every machine for the same plan.
 */
export function executionOrder(plan: RunPlan): PlanStep[] {
  validatePlan(plan);
  const byId = new Map(plan.steps.map((s) => [s.id, s]));
  const order: PlanStep[] = [];
  const done = new Set<string>();
  const remaining = [...plan.steps];

  while (remaining.length > 0) {
    const readyIndex = remaining.findIndex((s) => (s.needs ?? []).every((d) => done.has(d)));
    if (readyIndex === -1) {
      // validatePlan already excludes cycles; this is a law-guard.
      throw usageError("E1008", `Run plan '${plan.name}' could not be scheduled.`, "This is an engine bug; report it with the plan file.");
    }
    const [step] = remaining.splice(readyIndex, 1);
    order.push(step!);
    done.add(step!.id);
    void byId;
  }
  return order;
}

/** Plan fingerprint — pins the declared work (drift detection, D12.4/D19.7 posture). */
export function planFingerprint(plan: RunPlan): string {
  return blake3Text(canonicalJson({ name: plan.name, steps: plan.steps }));
}
