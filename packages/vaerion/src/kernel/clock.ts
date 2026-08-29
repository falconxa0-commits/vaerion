/**
 * Vaerion kernel — time & randomness ports.
 *
 * Law: no direct Date.now()/Math.random() outside these ports (hermeticity,
 * Blueprint §12.2; determinism over convenience). Everything injectable.
 */

export interface Clock {
  /** Current wall time in UTC milliseconds. */
  nowMs(): number;
  /** RFC3339 UTC timestamp with millisecond precision, `Z` suffix. */
  nowIso(): string;
}

export class SystemClock implements Clock {
  nowMs(): number {
    return Date.now();
  }
  nowIso(): string {
    return new Date().toISOString().replace(/\.\d{3}Z$/, (m) => m); // keep ms precision
  }
}

/** Fixed clock for deterministic tests and replay. */
export class FixedClock implements Clock {
  constructor(private ms: number) {}
  nowMs(): number {
    return this.ms;
  }
  nowIso(): string {
    return new Date(this.ms).toISOString();
  }
  advance(deltaMs: number): void {
    this.ms += deltaMs;
  }
}

export interface Rng {
  /** Fill-and-return `n` cryptographically- or deterministically-sourced bytes. */
  nextBytes(n: number): Uint8Array;
}

export class SystemRng implements Rng {
  nextBytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    crypto.getRandomValues(out);
    return out;
  }
}

/** Mulberry32 — small, fast, fully deterministic seeded PRNG (test/replay use). */
export class SeededRng implements Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  private nextUint32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  nextBytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = this.nextUint32() & 0xff;
    return out;
  }
}
