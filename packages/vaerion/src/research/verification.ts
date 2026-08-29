/**
 * Vaerion — research evidence verification (triangulated).
 *
 * Law: evidence identity is content-derived. A provenance fingerprint claims
 * WHAT the content is; the blob store holds the bytes; the evidence record
 * links both. Verification triangulates the three — evidence ↔ blob bytes ↔
 * fingerprint — and refuses to declare trust on a partial check (E1007 for a
 * missing blob, E1008 for digest mismatch, E1600 for a shape lie).
 *
 * Doctor and the SDK both surface this check; nothing here trusts a caller's
 * claim without reading the bytes.
 */

import { BlobStore } from "../store/blob-cas.ts";
import { blake3HexOf } from "../kernel/hash.ts";
import { VaerionError } from "../kernel/errors.ts";
import { assertEvidenceShape, type EvidenceRecord } from "./evidence.ts";

export interface EvidenceVerificationItem {
  evidence_id: string;
  ok: boolean;
  code?: string;
  detail: string;
}

export interface EvidenceVerificationReport {
  checked: number;
  okCount: number;
  failedCount: number;
  items: EvidenceVerificationItem[];
  ok: boolean;
}

/**
 * Verify ONE evidence record against the blob store:
 *   1. blob exists (E1007 when missing);
 *   2. blob bytes hash to the blob_ref digest (E1008 on mismatch);
 *   3. the provenance fingerprint's content_hash matches the same bytes
 *      (E1600 when the fingerprint lies about the content — provenance and
 *      store must agree, or the evidence is not trustworthy).
 * The evidence excerpt must also appear inside the stored content (E1401:
 * an excerpt that is not a substring of the real content is a fencing/
 * integrity violation — the record claims bytes that do not exist).
 */
export async function verifyEvidence(evidence: EvidenceRecord, blobs: BlobStore): Promise<EvidenceVerificationItem> {
  assertEvidenceShape(evidence);
  const fail = (code: "E1007" | "E1008" | "E1401" | "E1600", detail: string): EvidenceVerificationItem => ({
    evidence_id: evidence.evidence_id,
    ok: false,
    code,
    detail,
  });

  let bytes: Uint8Array;
  try {
    bytes = await blobs.open(evidence.blob_ref);
  } catch (err) {
    const e = err as VaerionError;
    // The store's own diagnostics (E1007 missing, E1008 mismatch) pass
    // through untouched — relabeling them would blur the Fix: contract.
    if (e?.code === "E1007" || e?.code === "E1008") {
      return { evidence_id: evidence.evidence_id, ok: false, code: e.code, detail: e.message };
    }
    return fail("E1600", `blob open failed: ${(err as Error).message}`);
  }

  const digest = await blake3HexOf(bytes);
  if (digest !== evidence.blob_ref.hash) {
    return fail("E1008", `blob content digest mismatch (expected ${evidence.blob_ref.hash.slice(0, 12)}…, got ${digest.slice(0, 12)}…)`);
  }

  if (evidence.provenance.fingerprint.content_hash !== digest) {
    return fail("E1600", `provenance fingerprint does not match blob content (fingerprint ${evidence.provenance.fingerprint.content_hash.slice(0, 12)}… vs blob ${digest.slice(0, 12)}…)`);
  }

  const content = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!content.includes(evidence.excerpt)) {
    return fail("E1401", "evidence excerpt is not a substring of the stored content — record and bytes disagree");
  }

  return {
    evidence_id: evidence.evidence_id,
    ok: true,
    detail: `blob + fingerprint + excerpt verified (${bytes.byteLength} bytes)`,
  };
}

/** Verify a whole evidence set; never throws for per-item failures (reports them). */
export async function verifyEvidenceSet(evidence: EvidenceRecord[], blobs: BlobStore): Promise<EvidenceVerificationReport> {
  const items: EvidenceVerificationItem[] = [];
  for (const e of evidence) {
    items.push(await verifyEvidence(e, blobs));
  }
  const okCount = items.filter((i) => i.ok).length;
  return {
    checked: items.length,
    okCount,
    failedCount: items.length - okCount,
    items,
    ok: items.length === 0 || okCount === items.length,
  };
}
