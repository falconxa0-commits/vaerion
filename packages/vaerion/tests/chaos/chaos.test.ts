/**
 * Chaos suite — kill/resume correctness (NFR-Crash-safety, Stage 20 §12.4).
 *
 * The harness simulates crash artifacts directly at the byte level:
 * torn tails (partial final line), mid-file corruption, seq gaps, stale and
 * live locks. Every scenario asserts LOUD failure (P9) or exact recovery —
 * never silent loss.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, open, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixedClock, SeededRng } from "../../src/kernel/clock.ts";
import { SeededIdGen, crn } from "../../src/kernel/ids.ts";
import { RunHarness, initialRunState, runStateReducer, type RunState } from "../../src/runtime/run.ts";
import { verifyJournal } from "../../src/journal/verify.ts";
import { readJournal } from "../../src/journal/reader.ts";
import { recoverJournal } from "../../src/journal/recovery.ts";
import { replayRecords } from "../../src/journal/replay.ts";
import { VaerionError } from "../../src/kernel/errors.ts";

const ws = await mkdtemp(join(tmpdir(), "vae-chaos-"));
const clock = new FixedClock(1735689600000);
const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(1234));

afterAll(async () => {
  await rm(ws, { recursive: true, force: true });
});

async function makeRun(name: string, events: number): Promise<{ runId: string; path: string; state: RunState }> {
  const runId = crn("run", idGen.next());
  const path = RunHarness.journalPathFor(ws, runId);
  const h = await RunHarness.create({ workspaceDir: ws, runId, traceId: `t_chaos_${name}`, configFingerprint: "cfg_chaos", clock, idGen });
  for (let i = 0; i < events; i++) {
    await h.emit("run.state.changed", { step: i });
  }
  const read = await readJournal(path);
  const state = replayRecords<RunState>({ records: read.records, reducer: runStateReducer, initial: initialRunState(runId, `t_chaos_${name}`) }).state;
  await h.release(); // release WITHOUT closing (journal stays open for mutation)
  return { runId, path, state };
}

describe("chaos: torn tails (crash mid-append)", () => {
  test("random truncation points recover to exactly the pre-crash fold", async () => {
    const { runId, path, state } = await makeRun("torn", 8);
    const raw = await readFile(path, "utf8");
    const baselineVerify = await verifyJournal(path);
    expect(baselineVerify.ok).toBe(true);
    void runId;

    const rng = new SeededRng(77);
    // Simulate 12 distinct crash points inside the LAST record's bytes.
    const lastNewline = raw.lastIndexOf("\n", raw.length - 2);
    const lastRecordStart = lastNewline + 1;
    for (let i = 0; i < 12; i++) {
      const cut = lastRecordStart + 1 + Math.floor(rng.nextBytes(1)[0]! * 0.9 * (raw.length - lastRecordStart - 1));
      // reset to pristine, then crash-write
      await writeFile(path, raw, "utf8");
      const fh = await open(path, "r+");
      await fh.truncate(cut);
      await fh.close();
      expect((await verifyJournal(path)).ok).toBe(false);
      // recovery: engine version + config fingerprint mirror the harness defaults
      const report = await recoverJournal(path, state.runId, "cfg_chaos");
      expect(report.tornTailRemoved).toBe(true);
      const after = await verifyJournal(path);
      expect(after.ok).toBe(true);
      // replay equality: recovered journal folds to the SAME state as pre-crash
      const read = await readJournal(path);
      const recovered = replayRecords<RunState>({ records: read.records, reducer: runStateReducer, initial: initialRunState(state.runId, state.traceId) }).state;
      expect(recovered.eventsSeen).toBe(state.eventsSeen);
      expect(recovered.lastSeq).toBe(state.lastSeq);
      expect(recovered.status).toBe(state.status);
    }
  });

  test("partial JSON line (no newline) is a torn tail, not corruption", async () => {
    const { path, state } = await makeRun("partial", 3);
    const raw = await readFile(path, "utf8");
    await writeFile(path, raw + '{"k":"evt","i":99,"prev":"aa', "utf8");
    const v = await verifyJournal(path);
    expect(v.ok).toBe(false);
    expect(v.issues[0]?.code).toBe("E1002");
    await recoverJournal(path, state.runId, "cfg_chaos");
    expect((await verifyJournal(path)).ok).toBe(true);
  });
});

describe("chaos: corruption (tamper evidence)", () => {
  test("mid-file byte flip breaks the chain LOUDLY and recovery refuses", async () => {
    const { path, state } = await makeRun("tamper", 5);
    const raw = await readFile(path, "utf8");
    const lines = raw.split("\n");
    // tamper the record whose payload actually carries step:2 (same length)
    const idx2 = lines.findIndex((l) => l.includes('"step":2'));
    expect(idx2).toBeGreaterThan(0);
    lines[idx2] = (lines[idx2] as string).replace('"step":2', '"step":9');
    await writeFile(path, lines.join("\n"), "utf8");
    const v = await verifyJournal(path);
    expect(v.ok).toBe(false);
    expect(v.issues[0]?.code).toBe("E1001");
    // recovery must REFUSE: evidence, not a crash artifact
    await expect(recoverJournal(path, state.runId, "cfg_chaos")).rejects.toThrow(VaerionError);
  });

  test("seq gap (lost line) is detected (E1005) — never papered over", async () => {
    const { path, state } = await makeRun("gap", 5);
    const raw = await readFile(path, "utf8");
    const lines = raw.split("\n").filter((l) => l.length > 0);
    // drop the 3rd record entirely (header, run.opened, evt1, evt2, evt3…)
    const damaged = lines.filter((_, idx) => idx !== 3).join("\n") + "\n";
    await writeFile(path, damaged, "utf8");
    const v = await verifyJournal(path);
    expect(v.ok).toBe(false);
    // chain break surfaces first (prev linkage), then seq — both are loud
    expect(["E1001", "E1005"]).toContain(v.issues[0]!.code);
    void state;
  });
});

describe("chaos: locks (single-writer law)", () => {
  test("stale lock from a dead owner is cleared by recovery", async () => {
    const { path, state } = await makeRun("stale-lock", 2);
    // lock body pointing at a PID that cannot exist
    await writeFile(path + ".lock", JSON.stringify({ pid: 2_000_000_000, acquired_at: clock.nowIso() }) + "\n", "utf8");
    const report = await recoverJournal(path, state.runId, "cfg_chaos");
    expect(report.lockCleared).toBe(true);
  });

  test("live lock from a living owner blocks recovery (E1000)", async () => {
    const { path, state } = await makeRun("live-lock", 2);
    await writeFile(path + ".lock", JSON.stringify({ pid: process.pid, acquired_at: clock.nowIso() }) + "\n", "utf8");
    await expect(recoverJournal(path, state.runId, "cfg_chaos")).rejects.toThrow(VaerionError);
    const { unlink } = await import("node:fs/promises");
    await unlink(path + ".lock");
  });
});

describe("chaos: determinism under resume", () => {
  test("double replay from genesis and from snapshot yields identical state", async () => {
    const { runId, path } = await makeRun("snap-eq", 6);
    const h = await RunHarness.restore({ workspaceDir: ws, runId, traceId: `t_chaos_snap-eq`, configFingerprint: "cfg_chaos", clock, idGen });
    try {
      await h.harness.snapshot("chaos-snap");
      await h.harness.emit("run.state.changed", { step: "post" });
    } finally {
      await h.harness.release();
    }
    const read = await readJournal(path);
    const full = replayRecords<RunState>({ records: read.records, reducer: runStateReducer, initial: initialRunState(runId, "t_chaos_snap-eq"), snapshotValidator: () => false });
    const accel = replayRecords<RunState>({ records: read.records, reducer: runStateReducer, initial: initialRunState(runId, "t_chaos_snap-eq") });
    expect(accel.usedSnapshot).toBe(true);
    expect(accel.state).toEqual(full.state);
  });
});
