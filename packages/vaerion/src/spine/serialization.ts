/**
 * Vaerion — envelope serialization.
 *
 * Encoding is canonical JSON of the envelope (sorted keys, integers only).
 * Decoding validates the full envelope shape; unknown event types decode fine
 * (forward-compat duty: intermediaries forward untouched) but cannot be
 * re-emitted through the spine.
 */

import { canonicalJson } from "../kernel/canonical.ts";
import { assertValidEnvelopeShape, type Envelope } from "./envelope.ts";

export function encodeEnvelope(env: Envelope): string {
  return canonicalJson(env);
}

export function decodeEnvelope(line: string): Envelope {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (err) {
    throw Object.assign(new Error(`envelope line is not JSON: ${(err as Error).message}`), { code: "E1100" });
  }
  assertValidEnvelopeShape(value, { seqMustBeAssigned: true });
  return value as Envelope;
}
