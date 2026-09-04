/**
 * Vaerion — event type registry (runtime mirror of spec/events/registry.json).
 *
 * Law: every event type is declared here BEFORE it can be emitted (no ambient
 * events); evolution is additive-only within envelope v1 (ADR-0002). Unknown
 * types are an error at emit time (E1101) and forwarded untouched by
 * intermediaries at read time (forward-compat duty).
 */

/** Event names, grouped by subsystem prefix. */
export const EVENT_TYPES = [
  // run lifecycle
  "run.opened",
  "run.state.changed",
  "run.snapshot.taken",
  "run.restored",
  "run.closed",
  // spine / journal
  "journal.record.appended",
  "journal.recovered",
  "journal.verified",
  // receipts
  "receipt.issued",
  // broker (contracts; full broker lands MS-2)
  "broker.decision.recorded",
  "broker.gate.opened",
  "broker.gate.resolved",
  "broker.elevation.recorded",
  "broker.audit.appended",
  // research subsystem
  "research.capability.declared",
  "research.index.updated",
  "research.source.fetched",
  "research.evidence.recorded",
  "research.context.prepared",
  // model gateway (MS-3 — the single gate, D-J)
  "gateway.invoke.recorded",
  "gateway.invoke.failed",
  // tools (thin registry only in MS-1)
  "tool.call.requested",
  "tool.call.completed",
  "tool.call.denied",
  // agents (MS-4 — the supervised agent loop over journaled decisions)
  "agent.run.started",
  "agent.step.recorded",
  "agent.step.failed",
  "agent.run.completed",
  // workflow DAG engine (MS-4 — deterministic, resumable, journal-backed)
  "workflow.started",
  "workflow.node.started",
  "workflow.node.completed",
  "workflow.node.failed",
  "workflow.completed",
  // reasoning sessions (MS-4 — persistent scratchpads with deterministic folding)
  "reasoning.note.recorded",
  "reasoning.folded",
  "extension.spawned",
  "extension.exited",
  // packaging (MS-6 — reproducible .vxn bundles, ADR-0016)
  "package.built",
  "package.verified",
  "package.imported",
  // release readiness (ASCENSION XVIII Phase 8)
  "release.readiness.evaluated",
  // store
  "store.blob.put",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

export function isKnownEventType(t: string): t is EventType {
  return EVENT_TYPE_SET.has(t);
}

export function assertKnownEventType(t: string): EventType {
  if (!isKnownEventType(t)) {
    throw Object.assign(new Error(`event type not in registry: ${t}`), { code: "E1101" });
  }
  return t;
}
