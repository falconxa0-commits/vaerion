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
  "broker.audit.appended",
  // research subsystem
  "research.capability.declared",
  "research.index.updated",
  "research.source.fetched",
  "research.evidence.recorded",
  "research.context.prepared",
  // tools (thin registry only in MS-1)
  "tool.call.requested",
  "tool.call.completed",
  "tool.call.denied",
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
