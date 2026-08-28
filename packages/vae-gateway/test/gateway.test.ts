import { describe, expect, it } from "bun:test";
import { CircuitBreaker } from "../src/breaker.ts";
import { resolveChain, DEFAULT_RECORDING_POSTURE } from "../src/provider.ts";
import { priceFor, SEED_PRICING, pricingFingerprint } from "../src/pricing.ts";

describe("circuit breaker (D13.4: 5 failures/30s → open 30s)", () => {
  it("stays closed below the threshold", () => {
    const b = new CircuitBreaker();
    for (let i = 0; i < 4; i++) b.failure(i * 100);
    expect(b.tryAcquire(500).allowed).toBeTrue();
  });

  it("opens on the fifth failure within the window", () => {
    const b = new CircuitBreaker();
    for (let i = 0; i < 5; i++) b.failure(i * 100);
    const { allowed, snapshot } = b.tryAcquire(500);
    expect(allowed).toBeFalse();
    expect(snapshot.state).toBe("open");
  });

  it("ignores failures that fall outside the 30s window", () => {
    const b = new CircuitBreaker();
    b.failure(0);
    // 31s later the first failure has aged out of the window.
    for (let i = 0; i < 4; i++) b.failure(31_000 + i);
    expect(b.tryAcquire(31_500).allowed).toBeTrue();
    // A fifth failure inside the window opens the breaker.
    b.failure(31_600);
    expect(b.tryAcquire(31_700).allowed).toBeFalse();
  });

  it("recovers through half-open and closes on success", () => {
    const b = new CircuitBreaker();
    for (let i = 0; i < 5; i++) b.failure(i);
    expect(b.tryAcquire(10_000).allowed).toBeFalse();
    // 30s after opening, a probe is allowed (half-open).
    const probe = b.tryAcquire(30_100);
    expect(probe.allowed).toBeTrue();
    expect(probe.snapshot.state).toBe("half-open");
    b.success(30_200);
    expect(b.tryAcquire(30_300).snapshot.state).toBe("closed");
  });

  it("re-opens when the half-open probe fails", () => {
    const b = new CircuitBreaker();
    for (let i = 0; i < 5; i++) b.failure(i);
    b.tryAcquire(30_100); // half-open
    b.failure(30_150);
    expect(b.tryAcquire(30_200).allowed).toBeFalse();
  });
});

describe("explicit fallback chains (D13.1)", () => {
  it("resolves a declared chain", () => {
    const chain = resolveChain([{ name: "main", providers: [{ provider: "mock", id: "m1" }] }], "main");
    expect(chain.providers.length).toBe(1);
  });

  it("refuses undeclared chains — no improvised fallback (E2009)", () => {
    expect(() => resolveChain([], "ghost")).toThrow(/No explicit fallback chain/);
  });
});

describe("recording postures (D13.2)", () => {
  it("defaults to full recording", () => {
    expect(DEFAULT_RECORDING_POSTURE).toBe("full");
  });
});

describe("versioned pricing (D13.3)", () => {
  it("prices are decimal strings and lookups are surfaced", () => {
    const price = priceFor(SEED_PRICING, "mock:free");
    expect(price.inputPerMTok).toBe("0.00");
    expect(() => priceFor(SEED_PRICING, "unknown:model")).toThrow(/no pricing entry/);
    expect(pricingFingerprint(SEED_PRICING)).toMatch(/^[0-9a-f]{64}$/);
  });
});
