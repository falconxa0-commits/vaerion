/**
 * Vaerion MS-2 — broker integration.
 *
 * The full constitutional decision cycle over a real journal:
 *   deny → journaled + audited + refused (Refusal Log)
 *   prompt → durable gate (run NOT closed) → human review → resolution →
 *   elevation (audit "elevation" + broker.elevation.recorded) → receipt.
 * CLI parity: `vae run` pauses on prompt (exit 0, awaiting), `vae resume`
 * renders the review, `--answer` resolves, `vae explain` shows refusals,
 * `vae doctor` verifies the refusal log. SDK parity on the same workspace.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixedClock, SeededRng } from "../../src/kernel/clock.ts";
import { SeededIdGen, crn } from "../../src/kernel/ids.ts";
import { RunHarness, runCli, verifyJournal, verifyAuditLedger, verifyRefusalLog, readRefusals, type PolicyContract } from "../../src/index.ts";
import type { JournalRecord } from "../../src/journal/records.ts";

let ws: string;
const clock = new FixedClock(1735689600000);

const DENY_POLICY: PolicyContract = {
  policy_id: "p_deny",
  version: 1,
  rules: [{ id: "deny-all-index", principalKinds: ["research"], domain: "research.index", scope: "*", effect: "deny", rationale: "unit: research indexing is off" }],
};

const PROMPT_POLICY: PolicyContract = {
  policy_id: "p_prompt",
  version: 1,
  rules: [{ id: "prompt-net", principalKinds: ["agent"], domain: "net.connect", scope: "api.example.com", effect: "prompt", gateLabel: "Network access to api.example.com requires human approval", rationale: "human gates the network" }],
};

async function harnessFor(runId: string, seed: number): Promise<ReturnType<typeof RunHarness.create> extends Promise<infer T> ? T : never> {
  return RunHarness.create({
    workspaceDir: ws,
    runId,
    traceId: `t_${runId.slice(-6)}`,
    configFingerprint: "cfg_broker",
    clock,
    idGen: new SeededIdGen(() => clock.nowMs(), new SeededRng(seed)),
  });
}

function recordsOf(workspace: string, runId: string): Promise<JournalRecord[]> {
  return import("../../src/journal/reader.ts").then((m) => m.readJournal(join(workspace, ".vaerion", "journal", `${runId}.ndjson`))).then((r) => r.records);
}

beforeAll(async () => {
  ws = await mkdtemp(join(tmpdir(), "vae-broker-"));
  await mkdir(join(ws, ".vaerion", "journal"), { recursive: true });
  await mkdir(join(ws, "docs"), { recursive: true });
  await writeFile(join(ws, "docs", "note.md"), "hello vaerion\n", "utf8");
});

afterAll(async () => {
  await rm(ws, { recursive: true, force: true });
});

describe("broker lifecycle (harness)", () => {
  test("deny → decision journaled + audit entry + refusal record", async () => {
    const runId = crn("run", "01JGOLDENBROKER0001");
    const h = await harnessFor(runId, 11);
    const { decision, record } = await h.decide(
      { request_id: "rq1", principal: { kind: "research", id: "research:run", runId }, domain: "research.index", scope: "./docs", action: { target: "./docs" }, intent: "index docs" },
      DENY_POLICY,
    );
    expect(decision.kind).toBe("deny");
    const closed = await h.close("denied");
    expect(closed.verify.ok).toBe(true);

    const refusals = await readRefusals(join(ws, ".vaerion", "refusals.log"), { runId });
    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.decision_id).toBe(record.decision_id);
    expect(refusals[0]!.reason_code).toBe("E1300");
    expect((await verifyRefusalLog(join(ws, ".vaerion", "refusals.log"))).ok).toBe(true);

    const audit = await verifyAuditLedger(join(ws, ".vaerion", "audit.log"));
    expect(audit.ok).toBe(true);
    expect(audit.entries).toBeGreaterThanOrEqual(1);
  });

  test("prompt → durable gate (run stays open) → resolve → elevation recorded", async () => {
    const runId = crn("run", "01JGOLDENBROKER0002");
    const h = await harnessFor(runId, 22);
    const { decision, record, gate } = await h.decide(
      { request_id: "rq2", principal: { kind: "agent", id: "agent_1", runId }, domain: "net.connect", scope: "api.example.com", action: { host: "api.example.com" }, intent: "call the declared API" },
      PROMPT_POLICY,
    );
    expect(decision.kind).toBe("prompt");
    expect(gate).toBeDefined();
    expect(gate!.decision_id).toBe(record.decision_id);
    expect(gate!.state).toBe("open");

    // The run must NOT be closed while the gate is open (R-A4: gates survive).
    const verify1 = await verifyJournal(RunHarness.journalPathFor(ws, runId));
    expect(verify1.ok).toBe(true);

    // Human approves → resolution journaled + elevation audited + event emitted.
    await h.resolveGate(gate!, { approved: true, note: "the API call is fine" });
    const closed = await h.close("gate resolved, continuing");
    expect(closed.verify.ok).toBe(true);

    const recs = await recordsOf(ws, runId);
    const resolvedGate = recs.find((r): r is Extract<JournalRecord, { k: "gate" }> => r.k === "gate" && r.gate.state === "resolved");
    expect(resolvedGate).toBeDefined();
    const elevationEvt = recs.find((r): r is Extract<JournalRecord, { k: "evt" }> => r.k === "evt" && r.env.type === "broker.elevation.recorded");
    expect(elevationEvt).toBeDefined();
    expect((elevationEvt!.env.payload as Record<string, unknown>).approved).toBe(true);
    expect((elevationEvt!.env.payload as Record<string, unknown>).decision_id).toBe(record.decision_id);

    const audit = await verifyAuditLedger(join(ws, ".vaerion", "audit.log"));
    expect(audit.ok).toBe(true);

    // No refusals for the approved prompt run.
    const refusals = await readRefusals(join(ws, ".vaerion", "refusals.log"), { runId });
    expect(refusals).toHaveLength(0);
  });

  test("denied gate resolution: no elevation, answer journaled as human denial", async () => {
    const runId = crn("run", "01JGOLDENBROKER0003");
    const h = await harnessFor(runId, 33);
    const { gate, record } = await h.decide(
      { request_id: "rq3", principal: { kind: "agent", id: "agent_1", runId }, domain: "net.connect", scope: "api.example.com", action: {}, intent: "call the API again" },
      PROMPT_POLICY,
    );
    await h.resolveGate(gate!, { approved: false });
    await h.close("human denied the gate");

    const recs = await recordsOf(ws, runId);
    expect(recs.find((r) => r.k === "evt" && r.env.type === "broker.elevation.recorded")).toBeUndefined();
    const auditBody = await readFile(join(ws, ".vaerion", "audit.log"), "utf8");
    const lines = auditBody.split("\n").filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as { kind: string; ref: string });
    expect(lines.filter((l) => l.kind === "elevation" && l.ref === record.decision_id)).toHaveLength(0);
  });
});

describe("CLI review loop parity", () => {
  test("config policy deny → vae run exits 3 with a refusal; explain surfaces it", async () => {
    const project = await mkdtemp(join(tmpdir(), "vae-cli-deny-"));
    try {
      await mkdir(join(project, ".vaerion"), { recursive: true });
      await mkdir(join(project, "docs"), { recursive: true });
      await writeFile(join(project, "docs", "a.md"), "content a\n", "utf8");
      await writeFile(
        join(project, "vaerion.yaml"),
        `schemaVersion: "0.1"\nproject:\n  name: deny-demo\ntelemetry:\n  enabled: false\n`,
        "utf8",
      );
      // A workspace-level policy file is the MS-2 surface; write it as part of config:
      await writeFile(
        join(project, "vaerion.yaml"),
        `schemaVersion: "0.1"\nproject:\n  name: deny-demo\npolicy:\n  rules:\n    - id: no-research-index\n      principalKinds: [research]\n      domain: research.index\n      scope: "*"\n      effect: deny\n      rationale: "indexing is disabled in this project"\ntelemetry:\n  enabled: false\n`,
        "utf8",
      );
      const io = { out: () => undefined, err: () => undefined };
      const result = await runCli(["run", "demo", "--json"], io, project);
      expect(result.code).toBe(3); // broker-denied

      const refusals = await readRefusals(join(project, ".vaerion", "refusals.log"));
      expect(refusals.length).toBeGreaterThanOrEqual(1);
      expect(refusals[0]!.reason_code).toBe("E1300");
      expect(refusals[0]!.policy).toBe("no-research-index");

      // explain surfaces the refusal narrative.
      const lines: string[] = [];
      const runList = await import("../../src/journal/ls.ts").then((m) => m.listJournals(join(project, ".vaerion", "journal")));
      expect(runList).toHaveLength(1);
      const runId = runList[0]!.run_id;
      const codeExplain = await runCli(["explain", runId, "--json"], { out: (l) => lines.push(l), err: () => undefined }, project);
      expect(codeExplain.code).toBe(0);
      const payload = JSON.parse(lines[lines.length - 1]!) as { refusals: Array<{ reason_code: string; policy: string }>; narrative: string[] };
      expect(payload.refusals).toHaveLength(1);
      expect(payload.refusals[0]!.policy).toBe("no-research-index");
      expect(payload.narrative.some((n) => n.startsWith("refusal E1300"))).toBe(true);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  test("config policy prompt → run pauses (exit 0) → resume renders review → answer resolves with elevation", async () => {
    const project = await mkdtemp(join(tmpdir(), "vae-cli-prompt-"));
    try {
      await mkdir(join(project, ".vaerion"), { recursive: true });
      await mkdir(join(project, "docs"), { recursive: true });
      await writeFile(join(project, "docs", "b.md"), "content b\n", "utf8");
      await writeFile(
        join(project, "vaerion.yaml"),
        `schemaVersion: "0.1"\nproject:\n  name: prompt-demo\npolicy:\n  rules:\n    - id: gate-research-index\n      principalKinds: [research]\n      domain: research.index\n      scope: "*"\n      effect: prompt\n      gateLabel: "Indexing needs your approval"\n      rationale: "human approves every index build"\ntelemetry:\n  enabled: false\n`,
        "utf8",
      );
      const io = { out: () => undefined, err: () => undefined };
      const codeRun = await runCli(["run", "demo", "--json"], io, project);
      expect(codeRun.code).toBe(0); // paused, awaiting human authority — NOT denied

      const runList = await import("../../src/journal/ls.ts").then((m) => m.listJournals(join(project, ".vaerion", "journal")));
      const runId = runList[0]!.run_id;

      // 1. Review render (no --answer): the human review loop surface.
      const reviewLines: string[] = [];
      await runCli(["resume", runId, "--json"], { out: (l) => reviewLines.push(l), err: () => undefined }, project);
      const review = JSON.parse(reviewLines[reviewLines.length - 1]!) as { awaiting: boolean; gate: { question: string; decision_id: string | null }; decision: { intent: string } | null; hint: string };
      expect(review.awaiting).toBe(true);
      expect(review.gate.question).toBe("Indexing needs your approval");
      expect(review.gate.decision_id).not.toBeNull();
      expect(review.decision).not.toBeNull();
      expect(review.hint).toContain("--answer");

      // The run is still open (no receipt) — the gate survives process death.
      const recs1 = await recordsOf(project, runId);
      expect(recs1.find((r) => r.k === "receipt")).toBeUndefined();

      // 2. Resolve with approval: elevation recorded, run closed with receipt.
      const resolveLines: string[] = [];
      const codeResume = await runCli(["resume", runId, "--answer", JSON.stringify({ approved: true }), "--json"], { out: (l) => resolveLines.push(l), err: () => undefined }, project);
      expect(codeResume.code).toBe(0);
      const resolved = JSON.parse(resolveLines[resolveLines.length - 1]!) as { gate_resolved: { gate_id: string }; journal_verified: boolean };
      expect(resolved.journal_verified).toBe(true);

      const recs2 = await recordsOf(project, runId);
      expect(recs2.find((r) => r.k === "evt" && r.env.type === "broker.elevation.recorded")).toBeDefined();
      expect(recs2.find((r) => r.k === "receipt")).toBeDefined();

      const audit = await verifyAuditLedger(join(project, ".vaerion", "audit.log"));
      expect(audit.ok).toBe(true);
      const auditLines = audit.ok ? (await readFile(join(project, ".vaerion", "audit.log"), "utf8")).split("\n").filter((l) => l.trim()) : [];
      const kinds = auditLines.map((l) => (JSON.parse(l) as { kind: string }).kind);
      expect(kinds).toContain("elevation");
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  test("denied answer exits 3 and journals the human denial", async () => {
    const project = await mkdtemp(join(tmpdir(), "vae-cli-denyans-"));
    try {
      await mkdir(join(project, ".vaerion"), { recursive: true });
      await mkdir(join(project, "docs"), { recursive: true });
      await writeFile(join(project, "docs", "c.md"), "content c\n", "utf8");
      await writeFile(
        join(project, "vaerion.yaml"),
        `schemaVersion: "0.1"\nproject:\n  name: denyans\ntelemetry:\n  enabled: false\n`,
        "utf8",
      );
      // Force the prompt path by using a config policy prompt rule.
      await writeFile(
        join(project, "vaerion.yaml"),
        `schemaVersion: "0.1"\nproject:\n  name: denyans\npolicy:\n  rules:\n    - id: gate-all-index\n      principalKinds: [research]\n      domain: research.index\n      scope: "*"\n      effect: prompt\n      rationale: "approval required"\ntelemetry:\n  enabled: false\n`,
        "utf8",
      );
      const io = { out: () => undefined, err: () => undefined };
      await runCli(["run", "demo", "--json"], io, project);
      const runList = await import("../../src/journal/ls.ts").then((m) => m.listJournals(join(project, ".vaerion", "journal")));
      const runId = runList[0]!.run_id;
      const code = await runCli(["resume", runId, "--answer", JSON.stringify({ approved: false }), "--json"], io, project);
      expect(code.code).toBe(3); // the human said no — honest broker-denied exit
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});
