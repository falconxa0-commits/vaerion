/**
 * vae-foundation — Canonical JSON (D11.4, D12.1).
 *
 * Deterministic serialization: object keys sorted lexicographically,
 * arrays in order, no insignificant whitespace, integers preserved,
 * floats rejected unless round-trippable through their decimal form.
 * Everything that is hashed, journaled, or fingerprinted MUST pass
 * through `canonicalJson` so identical state always yields identical
 * bytes.
 */

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [k: string]: Json };

export class CanonicalJsonError extends Error {}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertJson(value: unknown, path: string): Json {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalJsonError(`non-finite number at ${path}`);
    }
    if (!Number.isInteger(value) && !Number.isFinite(Number(value.toString()))) {
      throw new CanonicalJsonError(`unrepresentable number at ${path}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => assertJson(v, `${path}[${i}]`));
  }
  if (value instanceof Uint8Array) {
    // Explicit, honest encoding for bytes where they must cross a JSON boundary.
    return { $bytes: Buffer.from(value).toString("base64") } as unknown as Json;
  }
  if (isPlainObject(value)) {
    const out: Record<string, Json> = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = assertJson(value[k], `${path}.${k}`);
    }
    return out;
  }
  throw new CanonicalJsonError(`unsupported type ${typeof value} at ${path}`);
}

/** Serialize to canonical form (sorted keys, compact). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(assertJson(value, "$"));
}

/** Canonical bytes — the unit of hashing. */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}
