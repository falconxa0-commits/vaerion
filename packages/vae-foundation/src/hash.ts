/**
 * vae-foundation — blake3 hashing (D12.1, D8.2).
 *
 * The journal hash chain, document fingerprints, blob addresses, and
 * artifact pins are all blake3. Backend: @noble/hashes (pure TS,
 * audited) — verified in CI against the official empty-input vector
 * af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262.
 */

import { blake3 as nobleBlake3 } from "@noble/hashes/blake3.js";

export const BLAKE3_EMPTY = "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262";

/** Hash bytes → lowercase hex (64 chars). */
export function blake3(data: Uint8Array): string {
  return Buffer.from(nobleBlake3(data)).toString("hex");
}

/** Hash a UTF-8 string → lowercase hex. */
export function blake3Text(text: string): string {
  return blake3(new TextEncoder().encode(text));
}

/** `blake3:<hex>` reference form used by blob_ref and fingerprints (D9.5). */
export function blake3Ref(data: Uint8Array | string): string {
  const hex = typeof data === "string" ? blake3Text(data) : blake3(data);
  return `blake3:${hex}`;
}
