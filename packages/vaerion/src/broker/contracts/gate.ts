/**
 * Vaerion — broker contracts: durable human gates.
 *
 * A gate is a pause point that SURVIVES process death (R-A4). Open and
 * resolution are journal records; resolution is idempotent (double-resolve
 * is E1303, and the first resolution stays authoritative).
 */

export interface GateRecord {
  gate_id: string; // ULID
  run_id: string;
  trace_id: string;
  state: "open" | "resolved" | "cancelled";
  /** What the human is being asked. */
  question: string;
  /** Structured options for the answer (contract for SDK/API rendering). */
  options: ReadonlyArray<{ id: string; label: string }>;
  /** Resolution payload (journaled, redacted). */
  answer?: Record<string, unknown>;
  resolved_by?: "human";
  opened_at: string;
  resolved_at?: string;
}

export function assertGateRecordShape(value: unknown): asserts value is GateRecord {
  const g = value as Partial<GateRecord> | null;
  const fail: (m: string) => never = (m) => {
    throw Object.assign(new Error(m), { code: "E1302" });
  };
  if (!g || typeof g !== "object") fail("gate record missing");
  if (typeof g.gate_id !== "string" || g.gate_id.length === 0) fail("gate_id missing");
  if (typeof g.run_id !== "string" || g.run_id.length === 0) fail("run_id missing");
  if (typeof g.trace_id !== "string" || g.trace_id.length === 0) fail("trace_id missing");
  if (g.state !== "open" && g.state !== "resolved" && g.state !== "cancelled") fail(`gate.state invalid: ${String(g.state)}`);
  if (typeof g.question !== "string" || g.question.length === 0) fail("gate.question missing");
  if (!Array.isArray(g.options)) fail("gate.options must be an array");
  if (typeof g.opened_at !== "string") fail("gate.opened_at missing");
  if (g.state === "resolved") {
    if (typeof g.resolved_at !== "string") fail("resolved gate missing resolved_at");
    if (g.answer === undefined || g.answer === null) fail("resolved gate missing answer");
  }
}

/** Idempotency contract for resolution, enforced by the run harness (runtime). */
export function gateResolutionConflict(existing: GateRecord, incoming: GateRecord): boolean {
  return existing.state !== "open" && existing.gate_id === incoming.gate_id;
}
