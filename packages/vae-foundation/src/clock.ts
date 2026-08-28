/**
 * vae-foundation — Clock abstraction.
 *
 * Wall-clock time is a declared non-determinism (Stage 11, D11.4): it may
 * appear in envelope `ts` metadata, never in decisions. Every component
 * that needs time takes a Clock so tests can pin it.
 */

/** Time source. `nowMs()` returns unix epoch milliseconds. */
export interface Clock {
  nowMs(): number;
}

/** Real wall-clock. */
export const systemClock: Clock = { nowMs: () => Date.now() };

/** Frozen clock — deterministic tests and replay (D20.3). */
export function fixedClock(atMs: number): Clock {
  return { nowMs: () => atMs };
}

/** Stepping clock — advances by `stepMs` on every read. */
export function steppedClock(startMs: number, stepMs: number): Clock {
  let t = startMs;
  return {
    nowMs: () => {
      const out = t;
      t += stepMs;
      return out;
    },
  };
}

/** ISO-8601 UTC rendering used by every envelope and journal entry. */
export function iso(ms: number): string {
  return new Date(ms).toISOString();
}
