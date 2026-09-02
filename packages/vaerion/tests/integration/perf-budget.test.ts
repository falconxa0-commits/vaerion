/**
 * Performance budget law (ASCENSION XVIII Phase 7; constitution v1.4 A4).
 *
 * Matrix: shape/determinism (fixed op ids, order, iterations), budgets-of-record
 * pin (regression), rich-plain-JSON contract, fail-closed evaluation (failure
 * path), median unit law, real-harness integration with containment (security),
 * and the D-R gate-wiring pin (one verification entrypoint, no parallel gates).
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  PERF_BUDGETS,
  PERF_REPORT_SCHEMA,
  evaluatePerfReport,
  measureEnginePerf,
  median,
  type PerfMetric,
  type PerfReport,
} from "../../src/perf/perf.ts";
import { ENGINE_VERSION } from "../../src/journal/writer.ts";

const scratchRoot = await mkdtemp(join(tmpdir(), "vae-perf-test-"));

afterAll(async () => {
  await rm(scratchRoot, { recursive: true, force: true });
});

/* ─────────────────────────────  unit law  ───────────────────────────── */

describe("median — the robustness law", () => {
  test("odd sample: middle element", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  test("even sample: mean of the middle pair", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  test("unsorted input is handled; single sample is itself", () => {
    expect(median([9, 2])).toBe(5.5);
    expect(median([42])).toBe(42);
  });

  test("empty sample is a programmer error (never silently zero)", () => {
    expect(() => median([])).toThrow(RangeError);
  });
});

describe("evaluatePerfReport — fail-closed evaluation", () => {
  const metric = (over: Partial<PerfMetric>): PerfMetric => ({
    op: "op.x",
    budgetMs: 100,
    measuredMs: 10,
    iterations: 5,
    passed: true,
    honesty: "VERIFIED",
    ...over,
  });

  test("all green → passed with no breaches", () => {
    const report: PerfReport = {
      schema: PERF_REPORT_SCHEMA,
      engineVersion: ENGINE_VERSION,
      passed: true,
      metrics: [metric({ op: "a" }), metric({ op: "b" })],
    };
    const verdict = evaluatePerfReport(report);
    expect(verdict.passed).toBe(true);
    expect(verdict.breaches).toEqual([]);
  });

  test("a breach names the op, the measurement and the budget (actionable diagnostics)", () => {
    const report: PerfReport = {
      schema: PERF_REPORT_SCHEMA,
      engineVersion: ENGINE_VERSION,
      passed: false,
      metrics: [metric({ op: "journal.append", measuredMs: 123.456, budgetMs: 100, passed: false }), metric({ op: "blob.roundtrip" })],
    };
    const verdict = evaluatePerfReport(report);
    expect(verdict.passed).toBe(false);
    expect(verdict.breaches.length).toBe(1);
    expect(verdict.breaches[0]).toContain("journal.append");
    expect(verdict.breaches[0]).toContain("123.46ms");
    expect(verdict.breaches[0]).toContain("100ms");
  });
});

/* ────────────────────────  budgets of record (regression pin)  ──────────────────────── */

describe("PERF_BUDGETS — the typed budget contracts of record", () => {
  test("the seven engine-critical operations, in the fixed order, at the fixed iterations", () => {
    expect(PERF_BUDGETS.map((b) => b.op)).toEqual([
      "journal.append",
      "journal.verify",
      "journal.replay",
      "broker.evaluate",
      "receipt.compute",
      "blob.roundtrip",
      "gateway.metering",
    ]);
    expect(PERF_BUDGETS.map((b) => b.iterations)).toEqual([5, 5, 25, 25, 25, 5, 25]);
  });

  test("every budget is a positive finite ceiling (fail-open budgets are impossible)", () => {
    for (const b of PERF_BUDGETS) {
      expect(Number.isFinite(b.budgetMs)).toBe(true);
      expect(b.budgetMs).toBeGreaterThan(0);
      expect(Number.isInteger(b.iterations)).toBe(true);
      expect(b.iterations).toBeGreaterThan(0);
    }
  });
});

/* ─────────────────────────  the real harness (integration)  ───────────────────────── */

describe("measureEnginePerf — one deterministic harness over the real engine", () => {
  let report: PerfReport;

  test("measures all seven operations against the budgets of record and passes", async () => {
    report = await measureEnginePerf({ scratchRoot });
    expect(report.schema).toBe("vaerion.perf.v1");
    expect(report.engineVersion).toBe(ENGINE_VERSION);
    expect(report.metrics.length).toBe(PERF_BUDGETS.length);
    expect(report.passed).toBe(true);
    for (const m of report.metrics) {
      expect(m.measuredMs).toBeGreaterThan(0);
      const budget = PERF_BUDGETS.find((b) => b.op === m.op);
      if (!budget) throw new Error(`unexpected metric op: ${m.op}`);
      expect(m.iterations).toBe(budget.iterations);
      expect(m.honesty).toBe("VERIFIED");
      expect(m.passed).toBe(true);
    }
  });

  test("the metric SHAPE is deterministic across runs (values are honestly host-relative)", async () => {
    const second = await measureEnginePerf({ scratchRoot });
    expect(second.schema).toBe(report.schema);
    expect(second.engineVersion).toBe(report.engineVersion);
    expect(second.metrics.map((m) => m.op)).toEqual(report.metrics.map((m) => m.op));
    expect(second.metrics.map((m) => m.iterations)).toEqual(report.metrics.map((m) => m.iterations));
    for (let i = 0; i < second.metrics.length; i++) {
      expect(second.metrics[i]!.measuredMs).toBeGreaterThan(0);
    }
  });

  test("rich-plain-JSON contract: round-trips exactly; every number finite; no NaN/Infinity", () => {
    const round = JSON.parse(JSON.stringify(report)) as PerfReport;
    expect(round).toEqual(report);
    const walk = (v: unknown): void => {
      if (typeof v === "number") {
        expect(Number.isFinite(v)).toBe(true);
      } else if (Array.isArray(v)) {
        for (const x of v) walk(x);
      } else if (v !== null && typeof v === "object") {
        for (const x of Object.values(v)) walk(x);
      }
    };
    walk(report);
  });

  test("containment (security): the harness writes only inside its scratch root and cleans up", async () => {
    // A fresh harness run must leave NOTHING behind in its scratch root.
    const isolated = await mkdtemp(join(tmpdir(), "vae-perf-contain-"));
    try {
      await measureEnginePerf({ scratchRoot: isolated });
      expect(await readdir(isolated)).toEqual([]);
    } finally {
      await rm(isolated, { recursive: true, force: true });
    }
  });
});

/* ───────────────────────────  D-R gate wiring pin  ─────────────────────────── */

describe("the single verification authority (D-R)", () => {
  test("perf-budget runs as a verify.ts gate STEP — no second entrypoint exists", () => {
    const verify = readFileSync(join(import.meta.dir, "..", "..", "..", "..", "tools", "verify.ts"), "utf8");
    expect(verify).toContain('run("perf-budget"');
    expect(verify).toContain('"perf-gate.ts"');
    // The gate consumes the ONE harness module; it never re-implements measurement.
    const gate = readFileSync(join(import.meta.dir, "..", "..", "..", "..", "tools", "perf-gate.ts"), "utf8");
    expect(gate).toContain('from "../packages/vaerion/src/perf/perf.ts"');
    expect(gate).not.toMatch(/blake3|hashChain|JournalWriter/);
  });
});
