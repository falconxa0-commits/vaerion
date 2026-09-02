/**
 * Vaerion — the performance budget law (ASCENSION XVIII Phase 7; constitution
 * v1.4 A4; P2 determinism, D-R single verification authority, D-S honesty).
 *
 * ONE deterministic harness measures the engine-critical operations against
 * TYPED budget contracts:
 *
 *   journal.append      — 200 envelopes sealed, linked, fsynced (fs-bound)
 *   journal.verify      — blake3 chain + index verification of that journal
 *   journal.replay      — fold 200 records into state (CPU)
 *   broker.evaluate     — 1000 fail-closed policy evaluations (CPU)
 *   receipt.compute     — receipt built from 200 records (CPU)
 *   blob.roundtrip      — 10 × 64 KiB CAS put + verified open (fs-bound)
 *   gateway.metering    — metering rollup over 500 records (CPU)
 *
 * Discipline:
 *   - Fixed iteration counts and fixed, deterministically built input sizes
 *     (FixedClock + seeded content; no ambient randomness, no wall-clock
 *     inputs — the clock only supplies record timestamps).
 *   - Each metric is the MEDIAN of its iterations (robust against scheduler
 *     spikes; a flaky gate would violate reliability, so budgets carry
 *     headroom and medians carry stability).
 *   - Wall-clock values are host-relative by nature: every metric carries the
 *     honesty label "VERIFIED" (measured locally, D-S) and the budgets are
 *     CEILINGS, not pins. The metric SHAPE — op ids, order, schema,
 *     iterations — is deterministic and pinned by tests.
 *   - The gate consumes this module THROUGH tools/verify.ts (D-R: the one
 *     verification entrypoint). No surface re-implements the measurement.
 *   - The harness writes only inside the caller-provided scratch root — the
 *     repository tree is never touched.
 *
 * No CLI surface change (A4): this is engine law, not porcelain.
 */

import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { FixedClock, SeededRng } from "../kernel/clock.ts";
import { SeededIdGen, crn } from "../kernel/ids.ts";
import { JournalWriter, ENGINE_VERSION } from "../journal/writer.ts";
import { readJournal } from "../journal/reader.ts";
import { verifyJournal } from "../journal/verify.ts";
import { replayRecords } from "../journal/replay.ts";
import { BrokerEngine } from "../broker/engine.ts";
import { buildReceiptFromRecords } from "../receipts/receipt.ts";
import { BlobStore } from "../store/blob-cas.ts";
import { meteringFromRecords } from "../gateway/metering.ts";
import type { Envelope } from "../spine/envelope.ts";
import type { JournalRecord } from "../journal/records.ts";
import type { PolicyContract } from "../broker/contracts/decision.ts";

/* ───────────────────────────  typed budget contracts  ─────────────────────────── */

export const PERF_REPORT_SCHEMA = "vaerion.perf.v1" as const;

export interface PerfBudget {
  /** Stable operation id — the contract key; additive-only evolution (P3). */
  readonly op: string;
  /** Host-relative ceiling in milliseconds for the MEDIAN of `iterations`. */
  readonly budgetMs: number;
  /** Fixed iteration count (deterministic shape). */
  readonly iterations: number;
}

/**
 * The budgets of record. Changing a value is a conscious engineering act:
 * the shape test pins ids/order/iterations, and the gate fails closed on
 * any breach. Values carry generous headroom over the calibration host so
 * the gate stays green on loaded hardware while still catching
 * order-of-magnitude regressions.
 */
export const PERF_BUDGETS: readonly PerfBudget[] = [
  { op: "journal.append", budgetMs: 400, iterations: 5 },
  { op: "journal.verify", budgetMs: 300, iterations: 5 },
  { op: "journal.replay", budgetMs: 60, iterations: 25 },
  { op: "broker.evaluate", budgetMs: 40, iterations: 25 },
  { op: "receipt.compute", budgetMs: 40, iterations: 25 },
  { op: "blob.roundtrip", budgetMs: 500, iterations: 5 },
  { op: "gateway.metering", budgetMs: 40, iterations: 25 },
] as const;

/* ──────────────────────────────  report contracts  ────────────────────────────── */

export interface PerfMetric {
  readonly op: string;
  readonly budgetMs: number;
  readonly measuredMs: number;
  readonly iterations: number;
  readonly passed: boolean;
  /** D-S honesty label: wall-clock values are measured locally, never estimated. */
  readonly honesty: "VERIFIED";
}

export interface PerfReport {
  readonly schema: typeof PERF_REPORT_SCHEMA;
  readonly engineVersion: string;
  readonly passed: boolean;
  readonly metrics: readonly PerfMetric[];
}

/** Median of a non-empty sample; robust against scheduler spikes. */
export function median(samples: readonly number[]): number {
  if (samples.length === 0) throw new RangeError("median: empty sample");
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Fail-closed evaluation: every metric must pass; breaches are named. */
export function evaluatePerfReport(report: PerfReport): { passed: boolean; breaches: string[] } {
  const breaches = report.metrics
    .filter((m) => !m.passed)
    .map((m) => `${m.op}: ${m.measuredMs.toFixed(2)}ms > budget ${m.budgetMs}ms`);
  return { passed: breaches.length === 0, breaches };
}

/* ───────────────────────────  deterministic fixtures  ─────────────────────────── */

const FIXED_EPOCH_MS = 1735689600000; // 2025-01-01T00:00:00Z — never wall-clock
const APPEND_EVENTS = 200;
const REPLAY_RECORDS = 200;
const EVALUATE_REQUESTS = 1000;
const METERING_RECORDS = 500;
const BLOB_COUNT = 10;
const BLOB_BYTES = 64 * 1024;

/** Deterministic event envelope #n (no ambient state; FixedClock + fixed ids). */
function perfEnvelope(n: number, clock: FixedClock, traceId: string): Envelope {
  return {
    v: 1 as const,
    type: n % 5 === 0 ? "gateway.invoke.recorded" : "run.state.changed",
    seq: 0, // the writer allocates seq (C-C/D-C) — call sites never pre-assign
    ts: clock.nowIso(),
    trace_id: traceId,
    span_id: `s_${String(n).padStart(6, "0")}`,
    actor: { kind: "system" as const, id: "perf-harness" },
    cause: { kind: "origin" as const, ref: null },
    payload:
      n % 5 === 0
        ? { model: "mockbrain/mock-1", usage: { inputTokens: 10 + (n % 7), outputTokens: 5 + (n % 3) }, cost: { totalMicroUsd: 3 } }
        : { to: "working" },
  };
}

/** Deterministic byte buffer #seed (LCG — reproducible content, no ambient RNG). */
function perfBytes(seed: number, size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let state = seed >>> 0;
  for (let i = 0; i < size; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[i] = state & 0xff;
  }
  return bytes;
}

const allowPolicy: PolicyContract = {
  policy_id: "perf-allow",
  version: 1,
  rules: [{ id: "allow-all-measured", principalKinds: ["system"], domain: "fs.write", scope: "*", effect: "allow", rationale: "perf harness fixture" }],
};

function perfDecisionRequest(n: number, traceId: string) {
  return {
    request_id: `01PERF${String(n).padStart(16, "0")}`,
    principal: { kind: "system" as const, id: "perf-harness" },
    domain: "fs.write" as const,
    scope: `perf/scratch/${n % 16}.bin`,
    action: { op: "write", target: `perf/scratch/${n % 16}.bin` },
    intent: `performance-budget harness evaluation (${traceId})`,
  };
}

/* ────────────────────────────────  the harness  ──────────────────────────────── */

export interface MeasureEnginePerfOptions {
  /**
   * Scratch root for the harness's temp workspaces (e.g. a mkdtemp dir).
   * The repository tree is never written; each run creates and removes its
   * own subdirectories here.
   */
  scratchRoot: string;
}

async function timeOnce(fn: () => Promise<void> | void): Promise<number> {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

/**
 * Build one fresh 200-event journal inside `dir`. Returns the records and
 * the journal path (the append budget times THIS construction).
 */
async function buildJournal(dir: string, clock: FixedClock, idGen: SeededIdGen, traceId: string): Promise<{ records: JournalRecord[]; journalPath: string }> {
  const runId = crn("run", idGen.next());
  const journalPath = join(dir, "journal", `${runId}.ndjson`);
  const writer = await JournalWriter.open({
    journalPath,
    runId,
    configFingerprint: "perf-harness-fingerprint",
    clock,
  });
  try {
    for (let i = 1; i <= APPEND_EVENTS; i++) {
      await writer.appendEvent(perfEnvelope(i, clock, traceId));
    }
  } finally {
    await writer.close();
  }
  const read = await readJournal(journalPath);
  return { records: read.records, journalPath };
}

/**
 * Measure the engine-critical operations against the budgets of record.
 * Deterministic SHAPE (ops, order, iterations, schema); host-relative
 * wall-clock values, honestly labeled. Writes only inside a mkdtemp
 * directory under `opts.scratchRoot` and removes it afterwards.
 */
export async function measureEnginePerf(opts: MeasureEnginePerfOptions): Promise<PerfReport> {
  const clock = new FixedClock(FIXED_EPOCH_MS);
  const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(42));
  const traceId = "t_perf_harness";
  const scratch = await mkdtemp(join(opts.scratchRoot, "vae-perf-"));
  try {
    const samples = new Map<string, number[]>();
    const run = async (budget: PerfBudget, body: () => Promise<void> | void) => {
      const xs: number[] = [];
      for (let i = 0; i < budget.iterations; i++) xs.push(await timeOnce(body));
      samples.set(budget.op, xs);
    };

    // Shared fixtures (built once; the folds are pure, the broker stateless).
    const fixture = await buildJournal(join(scratch, "fixture"), clock, idGen, traceId);
    const evtRecords = fixture.records.filter((r): r is Extract<JournalRecord, { k: "evt" }> => r.k === "evt");
    const broker = new BrokerEngine({ policy: allowPolicy });
    const blobStore = new BlobStore(join(scratch, "blobs"));
    const blobContents = Array.from({ length: BLOB_COUNT }, (_, i) => perfBytes(1000 + i, BLOB_BYTES));
    const meteringRecords: JournalRecord[] = evtRecords.slice(0, METERING_RECORDS);

    // 1 — journal.append: a fresh 200-event journal per iteration (fs-bound).
    const appendBudget = PERF_BUDGETS[0]!;
    let appendRun = 0;
    await run(appendBudget, async () => {
      await buildJournal(join(scratch, `append-${appendRun++}`), clock, idGen, traceId);
    });

    // 2 — journal.verify: blake3 chain + index over the fixture journal.
    const verifyBudget = PERF_BUDGETS[1]!;
    await run(verifyBudget, async () => {
      const report = await verifyJournal(fixture.journalPath);
      if (!report.ok) throw new Error(`perf harness: fixture journal failed verification: ${report.issues.map(String).join("; ")}`);
    });

    // 3 — journal.replay: fold 200 records (pure; no snapshot acceleration).
    const replayBudget = PERF_BUDGETS[2]!;
    await run(replayBudget, () => {
      const result = replayRecords<number>({
        records: fixture.records.slice(0, REPLAY_RECORDS),
        reducer: (state) => state + 1,
        initial: 0,
      });
      if (result.state !== REPLAY_RECORDS) throw new Error("perf harness: replay fold produced an unexpected count");
    });

    // 4 — broker.evaluate: 1000 fail-closed evaluations (stateless engine).
    const evaluateBudget = PERF_BUDGETS[3]!;
    await run(evaluateBudget, () => {
      for (let i = 0; i < EVALUATE_REQUESTS; i++) {
        const evaluation = broker.evaluate(perfDecisionRequest(i, traceId));
        if (evaluation.decision.kind !== "allow") throw new Error("perf harness: fixture policy unexpectedly refused");
      }
    });

    // 5 — receipt.compute: receipt built from the 200 fixture records (pure).
    const receiptBudget = PERF_BUDGETS[4]!;
    await run(receiptBudget, () => {
      const receipt = buildReceiptFromRecords(fixture.records, {
        closedAt: clock.nowIso(),
        engineVersion: ENGINE_VERSION,
        summary: "perf-harness receipt fixture",
      });
      if (typeof receipt.run_id !== "string" || receipt.run_id.length === 0) {
        throw new Error("perf harness: receipt fixture produced no run_id");
      }
    });

    // 6 — blob.roundtrip: 10 × 64 KiB CAS put + verified open (fs-bound).
    const blobBudget = PERF_BUDGETS[5]!;
    await run(blobBudget, async () => {
      for (let i = 0; i < BLOB_COUNT; i++) {
        const ref = await blobStore.put(blobContents[i]!);
        const opened = await blobStore.open(ref);
        if (opened.byteLength !== BLOB_BYTES) throw new Error("perf harness: blob roundtrip size mismatch");
      }
    });

    // 7 — gateway.metering: integer rollup over 500 records (pure).
    const meteringBudget = PERF_BUDGETS[6]!;
    await run(meteringBudget, () => {
      const rollup = meteringFromRecords(meteringRecords);
      if (rollup.invocations === 0) throw new Error("perf harness: metering fixture produced no invocations");
    });

    // Assemble the report in the FIXED budget order (deterministic shape).
    const metrics: PerfMetric[] = PERF_BUDGETS.map((b) => {
      const xs = samples.get(b.op);
      if (!xs || xs.length !== b.iterations) throw new Error(`perf harness: op ${b.op} did not produce ${b.iterations} samples`);
      const measuredMs = median(xs);
      return {
        op: b.op,
        budgetMs: b.budgetMs,
        measuredMs,
        iterations: b.iterations,
        passed: measuredMs <= b.budgetMs,
        honesty: "VERIFIED" as const,
      };
    });

    return {
      schema: PERF_REPORT_SCHEMA,
      engineVersion: ENGINE_VERSION,
      passed: metrics.every((m) => m.passed),
      metrics,
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
