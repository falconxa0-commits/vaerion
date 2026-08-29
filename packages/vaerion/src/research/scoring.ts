/**
 * Vaerion — explainable source scoring.
 *
 * Law: ranking must be deterministic and EXPLAINABLE. No ML, no randomness,
 * no wall-clock reads: `nowMs` is injected. Each component lives in [0,1] and
 * the total is a fixed-weight blend rounded to 3 decimals, so the same inputs
 * always produce the same score and the components always justify it.
 */

import { VaerionError } from "../kernel/errors.ts";

export interface SourceScore {
  source_id: string;
  score: number;
  components: {
    declared: number;
    locality: number;
    freshness: number;
  };
}

export interface ScoreSourceInput {
  sourceId: string;
  declared: boolean;
  /** Depth of the source path below its declared root (0 = at the root). */
  pathDepth: number;
  /** Age in days, or null when unknown (unknown freshness is neutral-good). */
  lastModifiedDays: number | null;
  /** Injected clock reading (ms). Kept explicit so callers stay hermetic. */
  nowMs: number;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export function scoreSource(input: ScoreSourceInput): SourceScore {
  if (!input || typeof input !== "object") {
    throw new VaerionError("E1600", "scoreSource: input must be an object");
  }
  if (typeof input.sourceId !== "string" || input.sourceId.length === 0) {
    throw new VaerionError("E1600", "scoreSource: sourceId must be a non-empty string");
  }
  if (!Number.isInteger(input.pathDepth) || input.pathDepth < 0) {
    throw new VaerionError("E1600", `scoreSource: pathDepth must be a non-negative integer, got ${String(input.pathDepth)}`);
  }
  if (input.lastModifiedDays !== null && (typeof input.lastModifiedDays !== "number" || !Number.isFinite(input.lastModifiedDays))) {
    throw new VaerionError("E1600", "scoreSource: lastModifiedDays must be a finite number or null");
  }
  if (!Number.isInteger(input.nowMs) || input.nowMs < 0) {
    throw new VaerionError("E1600", "scoreSource: nowMs must be a non-negative integer (injected clock)");
  }

  const declared = input.declared ? 1 : 0;
  // Shallower paths are more local/canonical: 1, 1/2, 1/3, …
  const locality = 1 / (1 + input.pathDepth);
  // Freshness decays linearly over a year; unknown age is fully fresh-neutral.
  const freshness =
    input.lastModifiedDays === null
      ? 1
      : round3(Math.min(1, Math.max(0, 1 - input.lastModifiedDays / 365)));
  const score = Math.round((declared * 0.5 + locality * 0.3 + freshness * 0.2) * 1000) / 1000;
  return { source_id: input.sourceId, score, components: { declared, locality, freshness } };
}
