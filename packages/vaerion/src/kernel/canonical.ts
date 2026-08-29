/**
 * Vaerion kernel — canonical JSON.
 *
 * Law: anything that enters a hash chain must serialize byte-stably. Rules:
 *   - object keys sorted lexicographically (by UTF-16 code unit), applied recursively;
 *   - no whitespace; UTF-8; strings escaped per JSON.stringify (deterministic);
 *   - integers and strings/bools/null/arrays/objects only;
 *   - floats, NaN, Infinity, undefined, functions, symbols, bigint are REJECTED
 *     (E1901) — hashed content must be byte-stable, and float repr is not.
 */

import { VaerionError } from "./errors.ts";

export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value as string);
  if (t === "boolean") return (value as boolean) ? "true" : "false";
  if (t === "number") {
    const n = value as number;
    if (!Number.isFinite(n)) {
      throw new VaerionError("E1901", `canonical JSON: non-finite number ${String(n)}`);
    }
    if (!Number.isInteger(n)) {
      throw new VaerionError("E1901", `canonical JSON: float ${String(n)} is not byte-stable; encode as string or integer`);
    }
    return String(n);
  }
  if (t === "bigint") {
    return JSON.stringify((value as bigint).toString() + "n");
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => stringify(v)).join(",") + "]";
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined) continue; // undefined fields are absent, deterministically
      parts.push(JSON.stringify(k) + ":" + stringify(v));
    }
    return "{" + parts.join(",") + "}";
  }
  throw new VaerionError("E1901", `canonical JSON: unsupported value of type ${t}`);
}

/** Convenience: canonical JSON bytes (UTF-8). */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}
