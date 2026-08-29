/**
 * Vaerion — provenance for research evidence.
 *
 * Law: evidence without provenance is hearsay and must never exist. Every
 * evidence record pins the exact source (id + path), the content fingerprint,
 * the retrieval timestamp, a locator, and the transformation chain that
 * produced the stored form (fencing is itself a transformation and is always
 * the chain's base).
 */

import { VaerionError } from "../kernel/errors.ts";
import { assertDocumentFingerprintShape, type DocumentFingerprint } from "./fingerprint.ts";

export interface ProvenanceRecord {
  evidence_id: string;
  source_id: string;
  source_path: string;
  fingerprint: DocumentFingerprint;
  retrieved_at: string;
  locator: string;
  transformation_chain: string[];
}

const DEFAULT_CHAIN = "fence:untrusted";

export interface ProvenanceOfInput {
  evidenceId: string;
  sourceId: string;
  sourcePath: string;
  fingerprint: DocumentFingerprint;
  retrievedAt: string;
  locator: string;
  transformations?: string[];
}

export function provenanceOf(input: ProvenanceOfInput): ProvenanceRecord {
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1600", `provenanceOf: ${why}`);
  };
  if (!input || typeof input !== "object") fail("input must be an object");
  if (typeof input.evidenceId !== "string" || input.evidenceId.length === 0) fail("evidenceId must be a non-empty string");
  if (typeof input.sourceId !== "string" || input.sourceId.length === 0) fail("sourceId must be a non-empty string");
  if (typeof input.sourcePath !== "string" || input.sourcePath.length === 0) fail("sourcePath must be a non-empty string");
  assertDocumentFingerprintShape(input.fingerprint);
  if (typeof input.retrievedAt !== "string" || input.retrievedAt.length === 0) fail("retrievedAt must be a non-empty string");
  if (typeof input.locator !== "string" || input.locator.length === 0) fail("locator must be a non-empty string");
  const chain = input.transformations === undefined ? [DEFAULT_CHAIN] : [...input.transformations];
  if (chain.length === 0) fail("transformation chain must not be empty");
  for (const step of chain) {
    if (typeof step !== "string" || step.length === 0) fail("transformation chain entries must be non-empty strings");
  }
  return {
    evidence_id: input.evidenceId,
    source_id: input.sourceId,
    source_path: input.sourcePath,
    fingerprint: input.fingerprint,
    retrieved_at: input.retrievedAt,
    locator: input.locator,
    transformation_chain: chain,
  };
}

export function assertProvenanceShape(value: unknown): asserts value is ProvenanceRecord {
  const p = value as Partial<ProvenanceRecord> | null;
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1600", `provenance record invalid: ${why}`);
  };
  if (!p || typeof p !== "object") fail("not an object");
  if (typeof p.evidence_id !== "string" || p.evidence_id.length === 0) fail("evidence_id missing");
  if (typeof p.source_id !== "string" || p.source_id.length === 0) fail("source_id missing");
  if (typeof p.source_path !== "string" || p.source_path.length === 0) fail("source_path missing");
  try {
    assertDocumentFingerprintShape(p.fingerprint);
  } catch (err) {
    fail(`fingerprint invalid: ${(err as Error).message}`);
  }
  if (typeof p.retrieved_at !== "string" || p.retrieved_at.length === 0) fail("retrieved_at missing");
  if (typeof p.locator !== "string" || p.locator.length === 0) fail("locator missing");
  if (!Array.isArray(p.transformation_chain) || p.transformation_chain.length === 0) {
    fail("transformation_chain must be a non-empty array");
  }
  for (const step of p.transformation_chain) {
    if (typeof step !== "string" || step.length === 0) fail("transformation_chain entries must be non-empty strings");
  }
}
