/**
 * vae-foundation — Redaction at the publication boundary (D9.4, D12.3).
 *
 * Secrets are inputs, never configuration; they never appear in
 * envelopes, journals, or receipts in clear. Redaction is applied
 * BEFORE content crosses a trust boundary — not after.
 */

import type { Json } from "./canonical.ts";

export const REDACTED = "[REDACTED]";

/** Key names whose values are always redacted, whatever the content. */
const SENSITIVE_KEY = /(secret|token|password|passwd|credential|api[-_]?key|authorization|auth|private[-_]?key|cookie|session[-_]?id)/i;

/** Value shapes that look like credentials and are redacted in place. */
const SENSITIVE_VALUE: RegExp[] = [
  /\bghp_[A-Za-z0-9]{20,}\b/g, // GitHub personal access token
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, // GitHub fine-grained token
  /\bsk-[A-Za-z0-9_-]{20,}\b/g, // OpenAI-style key
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // Slack token
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, // PEM private keys
  /\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, // bearer credentials
];

function redactString(value: string): string {
  let out = value;
  for (const re of SENSITIVE_VALUE) out = out.replace(re, REDACTED);
  return out;
}

/** Deep, key-and-value aware redaction of arbitrary JSON-compatible data. */
export function redactDeep<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(walk);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k) && v !== null && typeof v !== "object") {
        out[k] = REDACTED;
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  }
  return value;
}

/** Redact a payload at the publication boundary; returns JSON-safe data. */
export function redactPayload(payload: Json): Json {
  return redactDeep(payload) as Json;
}
