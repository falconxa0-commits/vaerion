/**
 * Vaerion — evidence records.
 *
 * Law: document BYTES live in the BlobStore (content-addressed); the evidence
 * record carries only the blob_ref plus a bounded fenced excerpt. An evidence
 * record is always built FROM a fenced block — buildEvidenceRecord refuses
 * anything else (E1401), so unfenced external content has no path into a
 * record, and thus no path into the journal.
 */

import { VaerionError } from "../kernel/errors.ts";
import { assertFencedOrTrusted, type FencedBlock } from "./fencing.ts";
import { assertProvenanceShape, type ProvenanceRecord } from "./provenance.ts";

export interface EvidenceBlobRef {
  alg: "blake3";
  hash: string;
  size: number;
}

export interface EvidenceRecord {
  evidence_id: string;
  run_id: string;
  trace_id: string;
  capability: string;
  fencing: "untrusted" | "trusted";
  source_id: string;
  blob_ref: EvidenceBlobRef;
  excerpt: string;
  provenance: ProvenanceRecord;
  recorded_at: string;
}

export interface BuildEvidenceRecordInput {
  evidenceId: string;
  runId: string;
  traceId: string;
  capability: string;
  sourceId: string;
  blobRef: EvidenceBlobRef;
  fenced: FencedBlock;
  provenance: ProvenanceRecord;
  recordedAt: string;
}

function assertBlobRefShape(ref: unknown): asserts ref is EvidenceBlobRef {
  const r = ref as Partial<EvidenceBlobRef> | null;
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1600", `evidence blob_ref invalid: ${why}`);
  };
  if (!r || typeof r !== "object") fail("not an object");
  if (r.alg !== "blake3") fail(`alg must be "blake3", got ${String(r.alg)}`);
  if (typeof r.hash !== "string" || !/^[0-9a-f]{64}$/.test(r.hash)) fail("hash must be 64-char lowercase blake3 hex");
  if (!Number.isInteger(r.size) || (r.size as number) < 0) fail("size must be a non-negative integer");
}

export function buildEvidenceRecord(input: BuildEvidenceRecordInput): EvidenceRecord {
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1600", `buildEvidenceRecord: ${why}`);
  };
  if (!input || typeof input !== "object") fail("input must be an object");
  // Constitutional gate: only a genuine fence may become evidence.
  assertFencedOrTrusted(input.fenced);
  assertProvenanceShape(input.provenance);
  assertBlobRefShape(input.blobRef);
  if (typeof input.evidenceId !== "string" || input.evidenceId.length === 0) fail("evidenceId must be a non-empty string");
  if (typeof input.runId !== "string" || input.runId.length === 0) fail("runId must be a non-empty string");
  if (typeof input.traceId !== "string" || input.traceId.length === 0) fail("traceId must be a non-empty string");
  if (typeof input.capability !== "string" || input.capability.length === 0) {
    throw new VaerionError("E1403", "buildEvidenceRecord: capability must be a declared (non-empty) capability name");
  }
  if (typeof input.sourceId !== "string" || input.sourceId.length === 0) fail("sourceId must be a non-empty string");
  if (typeof input.recordedAt !== "string" || input.recordedAt.length === 0) fail("recordedAt must be a non-empty string");
  // Coherence: the fence, the provenance, and the record must describe the
  // SAME evidence — a mismatch is a provenance break, never papered over.
  if (input.sourceId !== input.fenced.source_id) {
    fail(`sourceId ${input.sourceId} does not match fenced source_id ${input.fenced.source_id}`);
  }
  if (input.capability !== input.fenced.capability) {
    fail(`capability ${input.capability} does not match fenced capability ${input.fenced.capability}`);
  }
  if (input.provenance.evidence_id !== input.evidenceId) {
    fail(`provenance.evidence_id ${input.provenance.evidence_id} does not match evidenceId ${input.evidenceId}`);
  }
  if (input.provenance.source_id !== input.sourceId) {
    fail(`provenance.source_id ${input.provenance.source_id} does not match sourceId ${input.sourceId}`);
  }
  if (input.provenance.source_path !== input.fenced.source_path) {
    fail(`provenance.source_path ${input.provenance.source_path} does not match fenced source_path ${input.fenced.source_path}`);
  }
  return {
    evidence_id: input.evidenceId,
    run_id: input.runId,
    trace_id: input.traceId,
    capability: input.capability,
    fencing: "untrusted",
    source_id: input.sourceId,
    blob_ref: { alg: "blake3", hash: input.blobRef.hash, size: input.blobRef.size },
    excerpt: input.fenced.content,
    provenance: input.provenance,
    recorded_at: input.recordedAt,
  };
}

export function assertEvidenceShape(value: unknown): asserts value is EvidenceRecord {
  const e = value as Partial<EvidenceRecord> | null;
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1600", `evidence record invalid: ${why}`);
  };
  if (!e || typeof e !== "object") fail("not an object");
  if (typeof e.evidence_id !== "string" || e.evidence_id.length === 0) fail("evidence_id missing");
  if (typeof e.run_id !== "string" || e.run_id.length === 0) fail("run_id missing");
  if (typeof e.trace_id !== "string" || e.trace_id.length === 0) fail("trace_id missing");
  if (typeof e.capability !== "string" || e.capability.length === 0) fail("capability missing");
  if (e.fencing !== "untrusted" && e.fencing !== "trusted") fail(`fencing must be "untrusted"|"trusted", got ${String(e.fencing)}`);
  if (typeof e.source_id !== "string" || e.source_id.length === 0) fail("source_id missing");
  assertBlobRefShape(e.blob_ref);
  if (typeof e.excerpt !== "string") fail("excerpt missing");
  if (typeof e.recorded_at !== "string" || e.recorded_at.length === 0) fail("recorded_at missing");
  assertProvenanceShape(e.provenance);
}
