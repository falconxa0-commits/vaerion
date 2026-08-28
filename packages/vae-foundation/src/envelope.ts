/**
 * vae-foundation — Envelope v1 (D3.7, D9.2, D9.3, Article IX).
 *
 * One canonical envelope, three renderings (human/plain/json). The
 * shape is a constitutional promise: additive-only field additions
 * within v1; unknown `type`s are forwarded untouched by intermediaries
 * (forward-compat duty); `seq` is monotonic per stream; `actor` and
 * `cause` are mandatory on every event (D9.3) so every act is
 * attributable.
 */

import type { Json } from "./canonical.ts";
import { VaeError } from "./errors.ts";
import type { Cause, PrincipalRef } from "./principal.ts";

export const ENVELOPE_VERSION = 1 as const;

/** Reference to the run this event belongs to, when run-scoped. */
export type RunId = string;

export interface Envelope {
  /** Contract version — additive-only within 1 (Article VIII). */
  readonly v: typeof ENVELOPE_VERSION;
  /** Event type from the registry, or an unrecognized (forwarded) type. */
  readonly type: string;
  /** Monotonic sequence within this event's stream (per run, per channel). */
  readonly seq: number;
  /** ISO-8601 UTC timestamp (declared metadata non-determinism, D11.4). */
  readonly ts: string;
  /** Run binding, when the event belongs to a run. */
  readonly run_id?: RunId;
  /** Who acted — mandatory (D9.3). */
  readonly actor: PrincipalRef;
  /** Why the act happened — mandatory (D9.3). */
  readonly cause: Cause;
  /** Event payload; large content travels by `blob_ref`, never inline (D9.5). */
  readonly payload: Json;
}

/** The ratified event-type registry for v1 (spec/events.md). Additive-only. */
export const EVENT_TYPES = [
  "engine.version",
  "engine.error",
  "receipt.issued",
  "workspace.initialized",
  "config.validated",
  "config.snapshot.pinned",
  "run.started",
  "run.plan.fingerprinted",
  "run.step.decision",
  "run.step.started",
  "run.step.completed",
  "run.step.failed",
  "run.checkpoint.written",
  "run.budget.spent",
  "run.completed",
  "run.failed",
  "run.parked",
  "run.resumed",
  "journal.entry.appended",
  "journal.verified",
  "journal.tamper.detected",
  "broker.decision",
  "broker.denied",
  "broker.parked",
  "tool.invocation.completed",
  "tool.invocation.failed",
  "doctor.check",
  "research.requested",
  "research.refused",
  "research.evidence.recorded",
  "extension.manifest.validated",
  "extension.state.changed",
] as const;

export type KnownEventType = (typeof EVENT_TYPES)[number];

export function isKnownEventType(type: string): type is KnownEventType {
  return (EVENT_TYPES as readonly string[]).includes(type);
}

export interface EnvelopeInput {
  readonly type: string;
  readonly seq: number;
  readonly ts: string;
  readonly run_id?: RunId;
  readonly actor: PrincipalRef;
  readonly cause: Cause;
  readonly payload?: Json;
}

/** Build a schema-conformant envelope. Throws E5002 on violation. */
export function envelope(input: EnvelopeInput): Envelope {
  const env: Envelope = {
    v: ENVELOPE_VERSION,
    type: input.type,
    seq: input.seq,
    ts: input.ts,
    ...(input.run_id !== undefined ? { run_id: input.run_id } : {}),
    actor: input.actor,
    cause: input.cause,
    payload: input.payload ?? {},
  };
  assertEnvelope(env);
  return env;
}

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Schema conformance guard — fails closed before publication (E5002). */
export function assertEnvelope(value: unknown): asserts value is Envelope {
  const fail = (why: string): VaeError =>
    new VaeError({
      code: "E5002",
      message: `envelope invalid: ${why}`,
      fix: "This is an engine bug: the envelope contract is machine-checked (D3.7); report it.",
      class: "internal",
    });
  if (typeof value !== "object" || value === null) throw fail("not an object");
  const e = value as Record<string, unknown>;
  if (e["v"] !== ENVELOPE_VERSION) throw fail(`unsupported version ${String(e["v"])}`);
  if (typeof e["type"] !== "string" || e["type"].length === 0) throw fail("type missing");
  if (typeof e["seq"] !== "number" || !Number.isInteger(e["seq"]) || (e["seq"] as number) < 1) {
    throw fail("seq must be an integer >= 1");
  }
  if (typeof e["ts"] !== "string" || !ISO_LIKE.test(e["ts"])) throw fail("ts must be ISO-8601 UTC");
  if (e["run_id"] !== undefined && (typeof e["run_id"] !== "string" || e["run_id"].length === 0)) {
    throw fail("run_id must be a non-empty string");
  }
  if (typeof e["actor"] !== "object" || e["actor"] === null) throw fail("actor missing (D9.3)");
  if (typeof e["cause"] !== "object" || e["cause"] === null) throw fail("cause missing (D9.3)");
  const actor = e["actor"] as Record<string, unknown>;
  const cause = e["cause"] as Record<string, unknown>;
  if (typeof actor["kind"] !== "string" || typeof actor["id"] !== "string") throw fail("actor needs kind+id");
  if (typeof cause["kind"] !== "string" || typeof cause["ref"] !== "string") throw fail("cause needs kind+ref");
  if (typeof e["payload"] !== "object" || e["payload"] === null || Array.isArray(e["payload"])) {
    throw fail("payload must be an object (blobs travel by reference, D9.5)");
  }
}

