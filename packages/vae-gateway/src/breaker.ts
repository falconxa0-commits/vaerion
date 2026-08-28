/**
 * vae-gateway — circuit breaker state machine (D13.4).
 *
 * Five failures within 30 seconds opens the breaker for 30 seconds.
 * Pure, deterministic, clock-injected — no wall-clock reads, no
 * hidden state. Recovered half-open probes close on success.
 */

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerSnapshot {
  readonly state: BreakerState;
  readonly failuresInWindow: number;
  readonly openedAtMs?: number;
}

const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 30_000;
const OPEN_DURATION_MS = 30_000;

export class CircuitBreaker {
  private failures: number[] = [];
  private openedAtMs?: number;
  private state: BreakerState = "closed";

  constructor(
    private readonly threshold = FAILURE_THRESHOLD,
    private readonly windowMs = FAILURE_WINDOW_MS,
    private readonly openMs = OPEN_DURATION_MS,
  ) {}

  /** Record a failure at `nowMs`; may open the breaker. */
  failure(nowMs: number): BreakerSnapshot {
    this.failures = this.failures.filter((t) => nowMs - t < this.windowMs);
    this.failures.push(nowMs);
    // A failed half-open probe re-opens immediately (probe is not a grace).
    if (this.state === "half-open" || (this.state !== "open" && this.failures.length >= this.threshold)) {
      this.state = "open";
      this.openedAtMs = nowMs;
    }
    return this.snapshot(nowMs);
  }

  /** Record a success; closes a half-open breaker. */
  success(nowMs: number): BreakerSnapshot {
    if (this.state === "half-open") {
      this.state = "closed";
      this.failures = [];
      this.openedAtMs = undefined;
    }
    return this.snapshot(nowMs);
  }

  /** May a call be attempted at `nowMs`? Transitions open→half-open. */
  tryAcquire(nowMs: number): { allowed: boolean; snapshot: BreakerSnapshot } {
    if (this.state === "open" && this.openedAtMs !== undefined && nowMs - this.openedAtMs >= this.openMs) {
      this.state = "half-open";
    }
    if (this.state === "open") return { allowed: false, snapshot: this.snapshot(nowMs) };
    return { allowed: true, snapshot: this.snapshot(nowMs) };
  }

  snapshot(nowMs: number): BreakerSnapshot {
    return {
      state: this.state,
      failuresInWindow: this.failures.filter((t) => nowMs - t < this.windowMs).length,
      ...(this.openedAtMs !== undefined ? { openedAtMs: this.openedAtMs } : {}),
    };
  }
}
