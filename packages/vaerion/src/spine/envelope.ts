/**
 * Vaerion — canonical event envelope (v1).
 *
 * Law (ratified): every meaningful action is an envelope on one spine; every
 * envelope carries actor + cause attribution (nothing happens without a who
 * and a why); seq is allocated by the run's single journal writer and is
 * monotonically increasing per run (per-run seq). Shape is normative in
 * spec/schemas/envelope.schema.json; this module is the runtime mirror.
 */

import { VaerionError } from "../kernel/errors.ts";
import type { Clock } from "../kernel/clock.ts";
import type { EventType } from "./event-types.ts";
import { isKnownEventType } from "./event-types.ts";

export const ENVELOPE_VERSION = 1;

/** Who caused this event. Never optional. */
export interface Actor {
  kind: "human" | "agent" | "tool" | "extension" | "research" | "system";
  /** CRN or stable identifier of the acting principal. */
  id: string;
}

/** Why this event exists — the causal pointer (journaled decisions are causes). */
export interface Cause {
  kind: "envelope" | "decision" | "gate" | "external" | "origin";
  /** seq of the causing envelope, decision id, gate id, or null for run origin. */
  ref: string | null;
}

export interface Envelope {
  v: 1;
  type: EventType | (string & {});
  seq: number; // per-run, monotonic, gapless; allocated by JournalWriter
  ts: string; // RFC3339 UTC, ms precision
  trace_id: string;
  span_id: string;
  actor: Actor;
  cause: Cause;
  payload: Record<string, unknown>;
}

export interface NewEnvelopeInput {
  type: EventType | (string & {});
  traceId: string;
  spanId: string;
  actor: Actor;
  cause: Cause;
  payload: Record<string, unknown>;
  clock: Clock;
}

/**
 * Build an envelope. seq is NOT set here — the journal writer stamps it
 * (single writer, per-run seq). Until journaled, seq is 0 (unassigned).
 */
export function draftEnvelope(input: NewEnvelopeInput): Envelope {
  const env: Envelope = {
    v: ENVELOPE_VERSION,
    type: input.type,
    seq: 0,
    ts: input.clock.nowIso(),
    trace_id: input.traceId,
    span_id: input.spanId,
    actor: input.actor,
    cause: input.cause,
    payload: input.payload,
  };
  assertValidEnvelopeShape(env, { seqMustBeAssigned: false });
  return env;
}

export interface ValidateOptions {
  /** When true (journal-read path), seq must be >= 1. */
  seqMustBeAssigned?: boolean;
}

/** Structural validation shared by emit and journal-read paths. */
export function assertValidEnvelopeShape(value: unknown, opts: ValidateOptions = {}): asserts value is Envelope {
  const e = value as Partial<Envelope> | null;
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1100", `envelope invalid: ${why}`);
  };
  if (e === null || typeof e !== "object") fail("not an object");
  if (e.v !== ENVELOPE_VERSION) fail(`unsupported envelope version ${String(e.v)}`);
  if (typeof e.type !== "string" || e.type.length === 0) fail("type missing");
  if (typeof e.seq !== "number" || !Number.isInteger(e.seq)) fail("seq not an integer");
  if (opts.seqMustBeAssigned && (e.seq as number) < 1) fail("seq unassigned on journaled envelope");
  if (!opts.seqMustBeAssigned && (e.seq as number) !== 0 && (e.seq as number) < 1) fail("seq must be 0 (unassigned) or >= 1");
  if (typeof e.ts !== "string" || !isRfc3339Ms(e.ts)) fail(`ts not RFC3339-ms: ${String(e.ts)}`);
  if (typeof e.trace_id !== "string" || e.trace_id.length === 0) fail("trace_id missing");
  if (typeof e.span_id !== "string" || e.span_id.length === 0) fail("span_id missing");
  const actor = e.actor as Partial<Actor> | undefined;
  if (!actor || typeof actor !== "object") fail("actor missing");
  if (!isActorKind(actor?.kind)) fail(`actor.kind invalid: ${String(actor?.kind)}`);
  if (typeof actor?.id !== "string" || actor.id.length === 0) fail("actor.id missing");
  const cause = e.cause as Partial<Cause> | undefined;
  if (!cause || typeof cause !== "object") fail("cause missing");
  if (!isCauseKind(cause?.kind)) fail(`cause.kind invalid: ${String(cause?.kind)}`);
  if (cause?.ref !== null && cause?.ref !== undefined && typeof cause.ref !== "string") fail("cause.ref must be string or null");
  if (e.payload === null || typeof e.payload !== "object" || Array.isArray(e.payload)) fail("payload must be an object");
}

function isActorKind(k: unknown): k is Actor["kind"] {
  return k === "human" || k === "agent" || k === "tool" || k === "extension" || k === "research" || k === "system";
}
function isCauseKind(k: unknown): k is Cause["kind"] {
  return k === "envelope" || k === "decision" || k === "gate" || k === "external" || k === "origin";
}

export function isRfc3339Ms(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s);
}

/**
 * Emit-path gate: type must be registered (no ambient events).
 * Forward-compat duty applies at READ time, not write time.
 */
export function assertEmittable(env: Envelope): void {
  if (!isKnownEventType(env.type)) {
    throw new VaerionError("E1101", `event type not in registry: ${env.type}`);
  }
}
