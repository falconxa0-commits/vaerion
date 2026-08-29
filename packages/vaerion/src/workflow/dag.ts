/**
 * Vaerion — workflow DAG validation (MS-4).
 *
 * A workflow is a directed acyclic graph of steps. Validation is total and
 * fail-closed (E1803): duplicate ids, missing dependencies, cycles, and
 * malformed nodes are all refused BEFORE anything executes or journals.
 *
 * Determinism law: the execution order is Kahn's topological sort with a
 * lexicographic tie-break — the same DAG always yields the same order, so
 * journal replay and crash resume see identical scheduling. The engine runs
 * the ready set SEQUENTIALLY in that order: parallel scheduling needs a
 * ratified ADR first, because concurrent ordering would break replay
 * byte-stability.
 */

import { VaerionError } from "../kernel/errors.ts";
import type { PlanStep } from "../agents/planner.ts";
import { assertPlanStep } from "../agents/planner.ts";

export interface WorkflowNode {
  id: string;
  /** Node ids that must complete before this node runs. */
  deps: string[];
  /** The work this node performs (executed through the StepExecutor law). */
  step: PlanStep;
  /** Per-node retry attempts (default 1; broker refusals are never retried). */
  maxAttempts?: number;
}

export interface WorkflowDag {
  id: string;
  nodes: WorkflowNode[];
}

const NODE_ID_RE = /^[a-z][a-z0-9._-]{0,62}$/;

/** Validate a DAG definition. Throws E1803 with the first structural defect. */
export function assertWorkflowDag(value: unknown): asserts value is WorkflowDag {
  const dag = value as Partial<WorkflowDag> | null;
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1803", `workflow DAG invalid: ${why}`, { workflow: String(dag?.id ?? "?") });
  };
  if (!dag || typeof dag !== "object") fail("definition must be an object");
  if (typeof dag.id !== "string" || !NODE_ID_RE.test(dag.id)) fail(`id must match ${NODE_ID_RE.source}, got: ${String(dag.id)}`);
  if (!Array.isArray(dag.nodes) || dag.nodes.length === 0) fail("nodes must be a non-empty array");
  const seen = new Set<string>();
  for (const node of dag.nodes) {
    const n = node as Partial<WorkflowNode> | null;
    if (!n || typeof n !== "object") fail("node must be an object");
    if (typeof n.id !== "string" || !NODE_ID_RE.test(n.id)) fail(`node id must match ${NODE_ID_RE.source}, got: ${String(n.id)}`);
    if (seen.has(n.id)) fail(`duplicate node id: ${n.id}`);
    seen.add(n.id);
    if (!Array.isArray(n.deps)) fail(`node ${n.id}: deps must be an array`);
    if (n.maxAttempts !== undefined && (!Number.isInteger(n.maxAttempts) || (n.maxAttempts as number) < 1)) {
      fail(`node ${n.id}: maxAttempts must be a positive integer`);
    }
    try {
      assertPlanStep(n.step, 0);
    } catch (err) {
      fail(`node ${n.id}: ${(err as Error).message}`);
    }
  }
  for (const node of dag.nodes) {
    for (const dep of node.deps) {
      if (!seen.has(dep)) fail(`node ${node.id}: dependency "${dep}" does not exist`);
      if (dep === node.id) fail(`node ${node.id}: self-dependency`);
    }
  }
  // Cycle detection: Kahn's algorithm must consume every node.
  const order = topoOrder(dag as WorkflowDag, { throwOnCycle: false });
  if (order.length !== dag.nodes.length) {
    const stuck = dag.nodes.map((n) => n.id).filter((id) => !order.includes(id));
    fail(`cycle detected among nodes: ${stuck.join(", ")}`);
  }
}

/**
 * Deterministic topological order (Kahn's with lexicographic tie-break):
 * the ready set is always taken smallest-first, so the same DAG always
 * yields the same order — replay and crash resume see identical scheduling.
 */
export function topoOrder(dag: WorkflowDag, opts: { throwOnCycle?: boolean } = {}): string[] {
  const throwOnCycle = opts.throwOnCycle ?? true;
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of dag.nodes) {
    indegree.set(node.id, node.deps.length);
    for (const dep of node.deps) {
      dependents.set(dep, [...(dependents.get(dep) ?? []), node.id]);
    }
  }
  let ready = dag.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!; // lexicographically smallest ready node
    order.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        ready.push(dependent);
        ready.sort(); // keep the tie-break deterministic
      }
    }
  }
  if (throwOnCycle && order.length !== dag.nodes.length) {
    const stuck = dag.nodes.map((n) => n.id).filter((id) => !order.includes(id));
    throw new VaerionError("E1803", `workflow DAG invalid: cycle detected among nodes: ${stuck.join(", ")}`, { workflow: dag.id });
  }
  return order;
}
