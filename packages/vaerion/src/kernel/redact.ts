/**
 * Vaerion kernel — redaction.
 *
 * Law: no plaintext secret is ever printed, logged, cached, or serialized
 * (OBJ-Q7). Redaction is deterministic: identical input yields identical
 * output, so redacted exports remain replay-compatible and golden-testable.
 */

const SECRET_PATTERNS: ReadonlyArray<{ name: string; re: RegExp; maskGroup: number }> = [
  { name: "openai_key", re: /\bsk-[A-Za-z0-9_-]{16,}\b/g, maskGroup: 0 },
  { name: "github_token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, maskGroup: 0 },
  { name: "github_pat", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, maskGroup: 0 },
  { name: "aws_access_key", re: /\bAKIA[0-9A-Z]{16}\b/g, maskGroup: 0 },
  { name: "slack_token", re: /\bxox[bpors]-[A-Za-z0-9-]{10,}\b/g, maskGroup: 0 },
  { name: "bearer", re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g, maskGroup: 0 },
  { name: "private_key_block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, maskGroup: 0 },
];

/** JSON object keys whose values are always considered secret-bearing. */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "password", "passwd", "secret", "api_key", "apikey", "access_token",
  "refresh_token", "authorization", "private_key", "credential", "credentials",
]);

/** Redact every known secret pattern in a string. Deterministic. */
export function redactString(input: string): string {
  let out = input;
  for (const p of SECRET_PATTERNS) {
    out = out.replace(p.re, (match) => `[REDACTED len=${match.length}]`);
  }
  return out;
}

/**
 * Deeply redact a JSON-able value:
 *  - strings get pattern-redacted;
 *  - values under sensitive keys are replaced by `[REDACTED len=N]` where N is
 *    the JSON length of the original value;
 *  - arrays/objects recurse; no sorting or key reordering (structure preserved;
 *    canonicalization is a separate, explicit step).
 */
export function redactDeep<T>(value: T): T {
  return walk(value, new WeakSet()) as T;
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[REDACTED cyclic]";
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase()) && v !== null && v !== undefined) {
      const len = JSON.stringify(v)?.length ?? 0;
      out[k] = `[REDACTED len=${len}]`;
    } else {
      out[k] = walk(v, seen);
    }
  }
  return out;
}
