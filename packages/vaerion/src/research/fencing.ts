/**
 * Vaerion — prompt-injection fencing for untrusted research content.
 *
 * Law (ratified): external content is UNTRUSTED. It enters the engine only
 * inside an explicit fence that carries its provenance, and it travels to a
 * trusted channel ONLY as the rendered fence string. Any trusted-context
 * function that receives unfenced external content fails with E1401 — there
 * is no code path that concatenates raw external content into instructions.
 *
 * Bounded excerpt: a fenced block's content is capped at maxChars (default
 * 400, the constitutional ceiling) INCLUDING the truncation marker, so an
 * excerpt is never larger than the bound.
 */

import { VaerionError } from "../kernel/errors.ts";
import { assertDocumentFingerprintShape, type DocumentFingerprint } from "./fingerprint.ts";

export interface FencedBlock {
  fence: "untrusted";
  source_id: string;
  source_path: string;
  capability: string;
  fingerprint: DocumentFingerprint;
  /** Bounded excerpt of the untrusted content (≤ maxChars characters). */
  content: string;
}

export const FENCE_MAX_CHARS_DEFAULT = 400;

export interface FenceUntrustedInput {
  sourceId: string;
  sourcePath: string;
  capability: string;
  fingerprint: DocumentFingerprint;
  content: string;
  maxChars?: number;
}

const isHighSurrogate = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLowSurrogate = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;

/**
 * Wrap untrusted content in a fence. Deterministic: same inputs ⇒ same block.
 * Truncation never splits a UTF-16 surrogate pair and appends "…" (counted
 * within maxChars) exactly when truncation happened.
 */
export function fenceUntrusted(input: FenceUntrustedInput): FencedBlock {
  if (!input || typeof input !== "object") {
    throw new VaerionError("E1600", "fenceUntrusted: input must be an object");
  }
  if (typeof input.sourceId !== "string" || input.sourceId.length === 0) {
    throw new VaerionError("E1600", "fenceUntrusted: sourceId must be a non-empty string");
  }
  if (typeof input.sourcePath !== "string" || input.sourcePath.length === 0) {
    throw new VaerionError("E1600", "fenceUntrusted: sourcePath must be a non-empty string");
  }
  if (typeof input.capability !== "string" || input.capability.length === 0) {
    throw new VaerionError("E1403", "fenceUntrusted: capability must be a declared (non-empty) capability name");
  }
  assertDocumentFingerprintShape(input.fingerprint);
  if (typeof input.content !== "string") {
    throw new VaerionError("E1600", "fenceUntrusted: content must be a string");
  }
  const maxChars = input.maxChars ?? FENCE_MAX_CHARS_DEFAULT;
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new VaerionError("E1600", `fenceUntrusted: maxChars must be an integer ≥ 1, got ${String(maxChars)}`);
  }

  let content = input.content;
  if (content.length > maxChars) {
    // Reserve one code unit for the ellipsis so the excerpt stays ≤ maxChars.
    let cut = maxChars - 1;
    // Walk back off a cut that would split a surrogate pair.
    while (cut > 0 && isHighSurrogate(content.charCodeAt(cut - 1)) && isLowSurrogate(content.charCodeAt(cut))) {
      cut--;
    }
    content = content.slice(0, cut) + "…";
  }

  return {
    fence: "untrusted",
    source_id: input.sourceId,
    source_path: input.sourcePath,
    capability: input.capability,
    fingerprint: input.fingerprint,
    content,
  };
}

/**
 * Gate for trusted channels: the value must BE a fence. Unfenced external
 * content ("trusted" posture, missing fence tag, missing provenance fields)
 * is a fencing violation — E1401 — and never passes.
 */
export function assertFencedOrTrusted(block: unknown): asserts block is FencedBlock {
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1401", `fencing violation: ${why}`);
  };
  const b = block as Partial<FencedBlock> | null;
  if (!b || typeof b !== "object") fail("block is not an object");
  if (b.fence !== "untrusted") fail(`fence tag must be "untrusted", got ${String(b.fence)}`);
  if (typeof b.source_id !== "string" || b.source_id.length === 0) fail("source_id missing");
  if (typeof b.source_path !== "string" || b.source_path.length === 0) fail("source_path missing");
  if (typeof b.capability !== "string" || b.capability.length === 0) fail("capability missing");
  if (typeof b.content !== "string") fail("content missing");
  try {
    assertDocumentFingerprintShape(b.fingerprint);
  } catch (err) {
    fail(`fingerprint invalid: ${(err as Error).message}`);
  }
}

/** Deterministic attribute escaping for the rendered fence. */
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The ONE channel untrusted content travels through: a deterministic,
 * self-describing fence string. Same block ⇒ byte-identical render.
 */
export function renderFence(block: FencedBlock): string {
  assertFencedOrTrusted(block);
  return (
    `<untrusted src="${escapeAttr(block.source_path)}"` +
    ` capability="${escapeAttr(block.capability)}"` +
    ` fingerprint="${block.fingerprint.content_hash}">` +
    `\n${block.content}\n` +
    `</untrusted>`
  );
}
