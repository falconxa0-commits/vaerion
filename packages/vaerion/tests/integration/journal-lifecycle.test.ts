/**
 * Journal lifecycle integration — the MS-1 heart.
 * open → append → snapshot → gate → receipt → verify → replay → restore → export.
 * Deterministic: temp dirs + fixed clock + seeded ids.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixedClock, SeededRng } from "../../src/kernel/clock.ts";
import { SeededIdGen, crn } from "../../src/kernel/ids.ts";
import { JournalWriter } from "../../src/journal/writer.ts";
import { readJournal } from "../../src/journal/reader.ts";
import { verifyJournal } from "../../src/journal/verify.ts";
import { replayRecords } from "../../src/journal/replay.ts";
import { exportRedacted, readExportVerified } from "../../src/journal/export.ts";
import { RunHarness, initialRunState, runStateReducer, type RunState } from "../../src/runtime/run.ts";
import { BlobStore } from "../../src/store/blob-cas.ts";
import { type PolicyContract } from "../../src/broker/contracts/decision.ts";
import { VaerionError } from "../../src/kernel/errors.ts";

const ws = await mkdtemp(join(tmpdir(), "vae-journal-"));
const clock = new FixedClock(1735689600000);
const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(42));
const runId = crn("run", idGen.next());
const traceId = "t_journal_lifecycle";

afterAll(async () => {
  await rm(ws, { recursive: true, force: true });
});

const allowResearchPolicy: PolicyContract = {
  policy_id: "test-allow-research",
  version: 1,
  rules: [{ id: "allow-research-index", principalKinds: ["research"], domain: "research.index", scope: "*", effect: "allow", rationale: "test" }],
};

const denyNetPolicy: PolicyContract = {
  policy_id: "test-deny-net",
  version: 1,
  rules: [{ id: "deny-net", principalKinds: "all", domain: "net.connect", scope: "*", effect: "deny", rationale: "no egress in tests" }],
};

const promptPolicy: PolicyContract = {
  policy_id: "test-prompt",
  version: 1,
  rules: [{ id: "gate-writes", principalKinds: ["agent"], domain: "fs.write", scope: "*", effect: "prompt", gateLabel: "Allow the write?", rationale: "human authority" }],
};

describe("journal lifecycle", () => {
  let harness: RunHarness;

  test("create journals the run header and origin event", async () => {
    harness = await RunHarness.create({ workspaceDir: ws, runId, traceId, configFingerprint: "cfg_fp_test", clock, idGen });
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    expect(read.records.length).toBe(2); // meta header + run.opened
    expect(read.records[0]?.k).toBe("meta");
    expect((read.records[0] as { note?: string }).note).toBe("header");
  });

  test("seq is gapless, monotonic, writer-allocated (D-C)", async () => {
    const s1 = await harness.emit("run.state.changed", { to: "working" });
    const s2 = await harness.emit("run.state.changed", { to: "working-harder" });
    expect(s1).toBe(2); // run.opened was seq 1
    expect(s2).toBe(s1 + 1);
  });

  test("call sites cannot pre-assign seq (single-writer law)", async () => {
    const env = {
      v: 1 as const,
      type: "run.state.changed",
      seq: 99,
      ts: clock.nowIso(),
      trace_id: traceId,
      span_id: "s_bad",
      actor: { kind: "system" as const, id: "x" },
      cause: { kind: "origin" as const, ref: null },
      payload: {},
    };
    await expect(harness.journal.appendEvent(env)).rejects.toThrow(VaerionError);
  });

  test("blob put is journaled and ref-verified (D-E)", async () => {
    const blobs = new BlobStore(join(ws, ".vaerion", "blobs"));
    const ref = await blobs.put("journal-payload-bytes");
    await harness.emit("store.blob.put", { blob_ref: ref }, { kind: "tool", id: "t1" }, { kind: "envelope", ref: "1" });
    const opened = await blobs.open(ref);
    expect(new TextDecoder().decode(opened)).toBe("journal-payload-bytes");
  });

  test("decide → journal → act: allow lands in journal + audit (D-F)", async () => {
    const { record } = await harness.decide(
      { request_id: idGen.next(), principal: { kind: "research", id: "research:x", runId }, domain: "research.index", scope: "/ws/docs", action: {}, intent: "index local docs" },
      allowResearchPolicy,
    );
    expect(record.decision.kind).toBe("allow");
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    expect(read.records.some((r) => r.k === "decision")).toBe(true);
  });

  test("broker denial is journaled (Refusal Log law D-L)", async () => {
    const { decision } = await harness.decide(
      { request_id: idGen.next(), principal: { kind: "agent", id: "a1", runId }, domain: "net.connect", scope: "evil.example", action: {}, intent: "should be refused" },
      denyNetPolicy,
    );
    expect(decision.kind).toBe("deny");
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    const denials = read.records.filter((r) => r.k === "decision" && r.decision.decision.kind === "deny");
    expect(denials.length).toBe(1);
  });

  test("prompt decision opens a durable gate; resolve is journaled; double-resolve refused", async () => {
    const { gate } = await harness.decide(
      { request_id: idGen.next(), principal: { kind: "agent", id: "a1", runId }, domain: "fs.write", scope: "/ws/src/x.ts", action: {}, intent: "write a file" },
      promptPolicy,
    );
    expect(gate).toBeDefined();
    let state = await fold();
    expect(state.status).toBe("awaiting_gate");
    expect(state.openGates.length).toBe(1);

    const resolved = await harness.resolveGate(gate!, { approved: true });
    expect(resolved.state).toBe("resolved");
    state = await fold();
    expect(state.status).toBe("open");
    expect(state.openGates.length).toBe(0);
    expect(state.resolvedGates.length).toBe(1);

    await expect(harness.resolveGate(gate!, { approved: true })).rejects.toThrow(VaerionError);
  });

  test("snapshot is an accelerator: replay with snapshot equals replay without", async () => {
    await harness.snapshot("mid-run");
    await harness.emit("run.state.changed", { to: "post-snapshot" });
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    const withSnap = replayRecords<RunState>({ records: read.records, reducer: runStateReducer, initial: initialRunState(runId, traceId) });
    const withoutSnap = replayRecords<RunState>({ records: read.records, reducer: runStateReducer, initial: initialRunState(runId, traceId), snapshotValidator: () => false });
    expect(withSnap.usedSnapshot).toBe(true);
    expect(withSnap.state).toEqual(withoutSnap.state);
  });

  test("close writes terminal receipt; journal verifies green (receipt law)", async () => {
    const { receipt, verify } = await harness.close("lifecycle complete");
    expect(verify.ok).toBe(true);
    expect(receipt.counts.events).toBeGreaterThan(5);
    expect(receipt.counts.decisions_allow).toBe(1);
    expect(receipt.counts.decisions_deny).toBe(1);
    expect(receipt.counts.decisions_prompt).toBe(1);
    expect(receipt.counts.gates_resolved).toBe(1);
    expect(receipt.blob_refs.length).toBe(1);
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    const last = read.records[read.records.length - 1];
    expect(last?.k).toBe("receipt");
    expect(receipt.journal.head_hash).toBe(read.records[read.records.length - 2]!.hash);
  });

  test("restore reconstructs identical state (deterministic restoration)", async () => {
    const restored = await RunHarness.restore({
      workspaceDir: ws,
      runId,
      traceId,
      configFingerprint: "cfg_fp_test",
      clock,
      idGen,
    });
    try {
      expect(restored.state.status).toBe("closed"); // receipt is the terminal record
      expect(restored.state.decisions).toEqual({ allow: 1, deny: 1, prompt: 1 });
      expect(restored.state.resolvedGates.length).toBe(1);
      expect(restored.verify.ok).toBe(true);
    } finally {
      await restored.harness.release();
    }
  });

  test("redacted export: independently verifiable, seq-preserving, secret-free", async () => {
    const exportPath = join(ws, "exports", "lifecycle.redacted.ndjson");
    const report = await exportRedacted({
      sourceJournalPath: RunHarness.journalPathFor(ws, runId),
      exportPath,
      runId,
    });
    expect(report.verified).toBe(true);
    const exported = await readExportVerified(exportPath);
    const source = await readJournal(RunHarness.journalPathFor(ws, runId));
    expect(exported.length).toBe(source.records.length);
    // seq preserved for every evt record
    const srcSeq = source.records.filter((r) => r.k === "evt").map((r) => (r as { env: { seq: number } }).env.seq);
    const expSeq = exported.filter((r) => r.k === "evt").map((r) => (r as { env: { seq: number } }).env.seq);
    expect(expSeq).toEqual(srcSeq);
    // export derivation header present
    const meta = exported.find((r) => r.k === "meta") as { note?: string; detail?: Record<string, unknown> } | undefined;
    expect(meta?.note).toBe("export");
    expect((meta?.detail?.redaction as string)).toBe("v1");
  });

  test("append after close is refused (E1004)", async () => {
    await expect(harness.emit("run.state.changed", { to: "after-close" })).rejects.toThrow(VaerionError);
  });

  test("second writer is refused while lock held (single-writer law D-G)", async () => {
    const h2path = RunHarness.journalPathFor(ws, runId);
    await JournalWriter.open({ journalPath: h2path, runId, configFingerprint: "x", clock }).catch((err: unknown) => {
      expect((err as VaerionError).code).toBe("E1000");
      return null;
    }).then(async (w) => {
      if (w) {
        // if the harness lock was released by close(), a fresh writer is legal — verify + release
        await w.close();
      }
    });
    // and while a live writer holds it, open must fail:
    const h3 = await RunHarness.restore({ workspaceDir: ws, runId, traceId, configFingerprint: "cfg_fp_test", clock, idGen });
    await JournalWriter.open({ journalPath: h2path, runId, configFingerprint: "x", clock })
      .then(() => {
        throw new Error("expected E1000 — lock should have been held");
      })
      .catch((err: unknown) => {
        expect((err as VaerionError).code).toBe("E1000");
      });
    await h3.harness.release();
  });
});

async function fold(): Promise<RunState> {
  const read = await readJournal(RunHarness.journalPathFor(ws, runId));
  return replayRecords<RunState>({ records: read.records, reducer: runStateReducer, initial: initialRunState(runId, traceId) }).state;
}
