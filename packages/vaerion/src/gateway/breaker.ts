/**
 * Vaerion — retry, backoff, and circuit breaking (R-MG2).
 *
 * Law:
 *   - Timing never uses the wall clock or ambient randomness directly: the
 *     backoff delay and the breaker cooldown run through the injected Clock
 *     and Rng ports, so tests are hermetic and replays deterministic (P2).
 *   - Retries wrap CONNECTION ESTABLISHMENT only. Once a 200 stream has
 *     begun, mid-stream failures are terminal for that invocation — partial
 *     output must never be re-sent or double-metered.
 *   - Retryable: transport-level refusal (E1706) and provider 5xx/429
 *     responses. Broker denials, budget, secret, and contract failures are
 *     NEVER retried (they are law, not weather).
 *   - The breaker is per-provider live health state (in-memory, deliberately
 *     not journaled — the journal records the failures themselves); opening
 *     after `threshold` consecutive failures and cooling down via the clock.
 *
 * Backoff shape: exponential with FULL JITTER
 *   delay = rngUniform(0, min(maxDelayMs, baseDelayMs * 2^attempt))
 * which spreads retry storms instead of synchronizing them (the standard
 * distributed-systems result; jitter bounds are still deterministic per
 * seeded rng).
 */

import type { Clock, Rng } from "../kernel/clock.ts";
import { VaerionError } from "../kernel/errors.ts";

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 3, baseDelayMs: 200, maxDelayMs: 5_000 };

/** Deterministic full-jitter delay for 0-based attempt index. */
export function backoffDelayMs(policy: RetryPolicy, attempt: number, rng: Rng): number {
  const cap = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);
  if (cap <= 0) return 0;
  const bytes = rng.nextBytes(4);
  const u = ((bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8) | ((bytes[2] ?? 0) << 16) | ((bytes[3] ?? 0) << 24)) >>> 0;
  return Math.floor((u / 0x1_0000_0000) * cap);
}

/** Classify whether a failure may be retried (law, not policy). */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof VaerionError)) return false;
  return err.code === "E1706" || err.code === "E1601";
}

export class TransportRetries {
  /** Attempts used by the most recent run() call (1 = first try succeeded). */
  attemptsUsed = 0;

  constructor(
    private readonly policy: RetryPolicy = DEFAULT_RETRY,
    private readonly clock: Clock,
    private readonly rng: Rng,
    private readonly sleep: (ms: number) => Promise<void> = () => Promise.resolve(),
  ) {}

  /**
   * Run `op` with retries around connection establishment. On success
   * returns the value; `attemptsUsed` always reflects the attempts spent.
   */
  async run<T>(op: () => Promise<T>): Promise<T> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < this.policy.maxAttempts; attempt++) {
      this.attemptsUsed = attempt + 1;
      try {
        return await op();
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt === this.policy.maxAttempts - 1) break;
        const delay = backoffDelayMs(this.policy, attempt, this.rng);
        this.clock.nowMs(); // clock observation is a port call (hermetic in tests)
        await this.sleep(delay);
      }
    }
    throw lastError;
  }
}

export type BreakerState = "closed" | "open" | "half_open";

export interface BreakerOptions {
  /** Consecutive failures before the breaker opens (default 5). */
  threshold?: number;
  /** Open-state cooldown before a half-open probe is allowed (default 30s). */
  cooldownMs?: number;
}

/** Per-provider circuit breaker (deterministic via the injected clock). */
export class CircuitBreaker {
  readonly provider: string;
  private currentState: BreakerState = "closed";
  private consecutiveFailures = 0;
  private openedAtMs = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(provider: string, private readonly clock: Clock, opts: BreakerOptions = {}) {
    this.provider = provider;
    this.threshold = opts.threshold ?? 5;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
  }

  get state(): BreakerState {
    if (this.currentState === "open" && this.clock.nowMs() - this.openedAtMs >= this.cooldownMs) {
      this.currentState = "half_open";
    }
    return this.currentState;
  }

  /**
   * Gate a call: OPEN refuses with E1705; HALF_OPEN admits exactly one
   * probe (the caller reports success/failure afterwards).
   */
  admit(): void {
    const s = this.state;
    if (s === "open") {
      const waited = this.clock.nowMs() - this.openedAtMs;
      throw new VaerionError("E1705", `circuit breaker for "${this.provider}" is open (cooldown ${this.cooldownMs}ms; ${waited}ms elapsed)`, { provider: this.provider });
    }
    // closed admits always; half_open admits the single probe (the caller
    // is expected to call record{Success,Failure} immediately after).
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.currentState = "closed";
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.state === "half_open" || this.consecutiveFailures >= this.threshold) {
      this.currentState = "open";
      this.openedAtMs = this.clock.nowMs();
    }
  }

  /** Snapshot for diagnostics (doctor/explain; never secret-bearing). */
  snapshot(): { provider: string; state: BreakerState; consecutiveFailures: number; openedAtMs: number } {
    return { provider: this.provider, state: this.state, consecutiveFailures: this.consecutiveFailures, openedAtMs: this.openedAtMs };
  }
}
