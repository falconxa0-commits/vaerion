/**
 * Vaerion — document fingerprints.
 *
 * Law: identity of external content is content-derived (blake3) and
 * byte-exact; provenance chains reference these fingerprints, so they must be
 * reproducible from the bytes alone. canonicalJson feeds every pack hash —
 * floats never survive it (E1901), which is why quantized counters, never
 * raw floats, enter hashed structures.
 */

import { blake3HexOf } from "../kernel/hash.ts";
import { canonicalJson } from "../kernel/canonical.ts";
import { VaerionError } from "../kernel/errors.ts";

export interface DocumentFingerprint {
  alg: "blake3";
  content_hash: string;
  size: number;
  doc_id: string;
}

/** Fingerprint document content (text or bytes). size is the UTF-8 byte length. */
export async function fingerprintDocument(content: string | Uint8Array, docId: string): Promise<DocumentFingerprint> {
  if (typeof docId !== "string" || docId.length === 0) {
    throw new VaerionError("E1600", "fingerprintDocument: docId must be a non-empty string");
  }
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const content_hash = await blake3HexOf(bytes);
  return { alg: "blake3", content_hash, size: bytes.byteLength, doc_id: docId };
}

/**
 * Hash an arbitrary pack with blake3 over its canonical JSON. Deterministic
 * across key order; rejects floats/unsupported values via canonicalJson.
 */
export async function fingerprintOfPack(pack: unknown): Promise<string> {
  return blake3HexOf(canonicalJson(pack));
}

const HASH64 = /^[0-9a-f]{64}$/;

export function assertDocumentFingerprintShape(value: unknown): asserts value is DocumentFingerprint {
  const f = value as Partial<DocumentFingerprint> | null;
  if (!f || typeof f !== "object") {
    throw new VaerionError("E1600", "document fingerprint: not an object");
  }
  if (f.alg !== "blake3") {
    throw new VaerionError("E1600", `document fingerprint: alg must be "blake3", got ${String(f.alg)}`);
  }
  if (typeof f.content_hash !== "string" || !HASH64.test(f.content_hash)) {
    throw new VaerionError("E1600", "document fingerprint: content_hash must be 64-char lowercase blake3 hex");
  }
  if (!Number.isInteger(f.size) || (f.size as number) < 0) {
    throw new VaerionError("E1600", "document fingerprint: size must be a non-negative integer");
  }
  if (typeof f.doc_id !== "string" || f.doc_id.length === 0) {
    throw new VaerionError("E1600", "document fingerprint: doc_id must be a non-empty string");
  }
}
