import { describe, expect, it } from "bun:test";
import { canonicalJson, canonicalBytes } from "../src/canonical.ts";
import { blake3, blake3Text, BLAKE3_EMPTY } from "../src/hash.ts";
import { ulid, isUlid, ulidTime, compareUlid, systemRandom } from "../src/ulid.ts";
import { fixedClock, iso, steppedClock, systemClock } from "../src/clock.ts";
import { redactDeep, REDACTED } from "../src/redact.ts";
import { receipt, assertReceipt } from "../src/receipt.ts";
import { envelope, assertEnvelope, isKnownEventType } from "../src/envelope.ts";
import { addMoney, compareMoney, assertMoney, MoneyFormatError } from "../src/money.ts";
import { catalogEntry, CATALOG_SIZE } from "../src/error-catalog.ts";
import { EXIT_CODES } from "../src/exit-codes.ts";
import { usageError } from "../src/errors.ts";

describe("ulid (D11.2)", () => {
  it("emits 26-char Crockford base32 identifiers", () => {
    const id = ulid(1_700_000_000_000, systemRandom);
    expect(id).toHaveLength(26);
    expect(isUlid(id)).toBeTrue();
  });

  it("is monotonic within the same millisecond", () => {
    const t = 1_700_000_000_000;
    const a = ulid(t, systemRandom);
    const b = ulid(t, systemRandom);
    const c = ulid(t, systemRandom);
    expect(compareUlid(a, b)).toBe(-1);
    expect(compareUlid(b, c)).toBe(-1);
  });

  it("sorts chronologically across milliseconds", () => {
    const early = ulid(1_000, systemRandom);
    const late = ulid(2_000, systemRandom);
    expect(compareUlid(early, late)).toBe(-1);
    expect(ulidTime(late)).toBe(2_000);
  });

  it("rejects malformed identifiers", () => {
    expect(isUlid("not-a-ulid")).toBeFalse();
    expect(isUlid("0".repeat(26))).toBeTrue();
  });
});

describe("clock determinism boundary (D11.4)", () => {
  it("fixed clock never advances", () => {
    const c = fixedClock(1_700_000_000_000);
    expect(c.nowMs()).toBe(c.nowMs());
    expect(iso(c.nowMs())).toBe("2023-11-14T22:13:20.000Z");
  });

  it("stepped clock advances by the declared step", () => {
    const c = steppedClock(0, 5);
    expect(c.nowMs()).toBe(0);
    expect(c.nowMs()).toBe(5);
  });

  it("system clock is available for declared metadata", () => {
    expect(systemClock.nowMs()).toBeGreaterThan(0);
  });
});

describe("blake3 (D12.1)", () => {
  it("matches the official empty-input vector", () => {
    expect(blake3(new Uint8Array(0))).toBe(BLAKE3_EMPTY);
  });

  it("matches a known vector for 'abc'", () => {
    // Official blake3 test vector for input "abc".
    expect(blake3Text("abc")).toBe(
      "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85",
    );
  });

  it("is deterministic for identical input", () => {
    expect(blake3Text("vaerion")).toBe(blake3Text("vaerion"));
  });
});

describe("canonical JSON (D11.4)", () => {
  it("sorts keys so identical state yields identical bytes", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalJson({ x: Number.NaN })).toThrow();
    expect(() => canonicalJson({ x: Infinity })).toThrow();
  });

  it("encodes bytes explicitly", () => {
    expect(canonicalJson({ data: new Uint8Array([1, 2, 3]) })).toBe('{"data":{"$bytes":"AQID"}}');
    expect(canonicalBytes({ a: 1 })).toEqual(new TextEncoder().encode('{"a":1}'));
  });
});

describe("exit-code alphabet (Part IV, D18.6)", () => {
  it("is exactly the ratified alphabet", () => {
    expect(EXIT_CODES).toEqual({ OK: 0, USAGE: 2, REFUSAL: 3, RUN_FAILURE: 4, INTERNAL: 5 });
  });
});

describe("error catalog (D3.8)", () => {
  it("carries at least 20 seeded E-codes (M0 floor)", () => {
    expect(CATALOG_SIZE).toBeGreaterThanOrEqual(20);
  });

  it("resolves entries and maps classes to the exit alphabet", () => {
    const e = usageError("E1005", "This directory is not a Vaerion workspace.", "Run `vae init`.");
    expect(e.exitCode).toBe(EXIT_CODES.USAGE);
    expect(catalogEntry("E2001").class).toBe("refusal");
    expect(catalogEntry("E3001").class).toBe("run_failure");
    expect(catalogEntry("E5001").class).toBe("internal");
  });
});

describe("envelope v1 (D3.7, D9.3)", () => {
  const actor = { kind: "engine", id: "vae-core" } as const;
  const causeRef = { kind: "command", ref: "vae doctor" } as const;

  it("builds a schema-conformant envelope", () => {
    const env = envelope({ type: "doctor.check", seq: 1, ts: iso(0), actor, cause: causeRef, payload: { ok: true } });
    expect(env.v).toBe(1);
    expect(env.payload).toEqual({ ok: true });
  });

  it("fails closed on non-conformant envelopes (E5002)", () => {
    expect(() => assertEnvelope({ v: 2 })).toThrow();
    expect(() =>
      envelope({ type: "x", seq: 0, ts: iso(0), actor, cause: causeRef }),
    ).toThrow(); // seq must be >= 1
    expect(() =>
      envelope({ type: "x", seq: 1, ts: "not-a-date", actor, cause: causeRef }),
    ).toThrow();
  });

  it("knows the ratified registry and forwards unknown types", () => {
    expect(isKnownEventType("run.started")).toBeTrue();
    expect(isKnownEventType("brand.new.future.event")).toBeFalse();
  });
});

describe("redaction at the publication boundary (D9.4, D12.3)", () => {
  it("redacts sensitive keys", () => {
    const fakeKey = `sk-${"a".repeat(24)}`; // constructed, never embedded
    expect(redactDeep({ api_key: fakeKey })).toEqual({ api_key: REDACTED });
  });

  it("redacts credential-shaped values in place", () => {
    const fakeToken = `ghp_${"b".repeat(30)}`; // constructed, never embedded
    const out = redactDeep({ note: `token ${fakeToken} in text` });
    expect(JSON.stringify(out)).not.toContain("ghp_");
    expect((out as { note: string }).note).toContain(REDACTED);
  });

  it("walks arrays and nested objects", () => {
    const out = redactDeep({ list: [{ password: "hunter2" }], keep: 1 });
    expect(out).toEqual({ list: [{ password: REDACTED }], keep: 1 });
  });
});

describe("receipts (Sacred Invariant V)", () => {
  it("builds a conformant receipt", () => {
    const r = receipt({
      command: "vae init",
      ok: true,
      what_changed: [{ subject: "vaerion.yaml", action: "created" }],
      cost: { usd: "0.0000" },
      undo: ["rm -rf .vaerion vaerion.yaml"],
    });
    expect(r.receipt_version).toBe(1);
  });

  it("refuses float money in receipts (D8.3)", () => {
    expect(() =>
      assertReceipt({ receipt_version: 1, command: "x", ok: true, what_changed: [], cost: { usd: 0.1 }, undo: [], record: {} }),
    ).toThrow(/decimal string/);
  });
});

describe("money as decimal strings (D8.3)", () => {
  it("adds without float error", () => {
    expect(addMoney("0.1", "0.2")).toBe("0.3");
    expect(addMoney("1.005", "2.005")).toBe("3.010");
  });

  it("compares across scales", () => {
    expect(compareMoney("1.5", "1.50")).toBe(0);
    expect(compareMoney("1.49", "1.50")).toBe(-1);
  });

  it("rejects non-decimal forms", () => {
    expect(() => assertMoney("1e3")).toThrow(MoneyFormatError);
    expect(() => assertMoney("0.1f")).toThrow(MoneyFormatError);
  });
});
