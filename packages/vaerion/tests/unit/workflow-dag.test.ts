/**
 * Vaerion workflow DAG engine — unit tests (MS-4).
 *
 * Law under test: fail-closed validation (E1803), deterministic topological
 * scheduling, content-addressed node outputs, node failure stops dependents,
 * and crash-safe resume that skips completed nodes with the chain preserved.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixedClock, SeededRng } from "../../src/kernel/clock.ts";
import { SeededIdGen } from "../../src/kernel/ids.ts";
import { RunHarness } from "../../src/runtime/run.ts";
import { readJournal } from "../../src/journal/reader.ts";
import { verifyJournal } from "../../src/journal/verify.ts";
import { validateConfig, type VaerionConfig } from "../../src/config/config.ts";
import type { JournalRecord } from "../../src/journal/records.ts";
import type { PlanStep } from "../../src/agents/planner.ts";
import type { WorkflowDag } from "../../src/workflow/index.ts";
import { graphFromConfig } from "../../src/broker/engine.ts";
import { assertWorkflowDag, topoOrder, WorkflowEngine, workflowStateFromRecords } from "../../src/workflow/index.ts";
import { ToolRegistry, ToolInvocationService, echoTool, type ToolExecutor } from "../../src/agents/tools.ts";
import { agentGrants } from "../../src/agents/grants.ts";
import type { PolicyContract } from "../../src/broker/contracts/decision.ts";

const TRACE_ID = "t_wf_test";
const T0 = 1735689600000;
const workspaces: string[] = [];
afterAll(async () => {
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
});

function configFor(): VaerionConfig {
  return validateConfig({
    schemaVersion: "0.1",
    project: { name: "wf-it", description: "unit" },
    tools: [{ name: "echo" }],
    policy: { rules: [{ id: "agent-tools-allow", principalKinds: ["agent"], domain: "tool.call", scope: "echo", effect: "allow", rationale: "unit allow" }] },
    telemetry: { enabled: false },
  });
}

const policy: PolicyContract = {
  policy_id: "wf-unit",
  version: 1,
  rules: [{ id: "tool-allow", principalKinds: ["agent"], domain: "tool.call", scope: "echo", effect: "allow", rationale: "unit" }],
};

async function makeFixture(seed = 42, executors?: Map<string, ToolExecutor>) {
  const clock = new FixedClock(T0);
  const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(seed));
  const runId = `crn_run_${idGen.next()}`;
  const ws = await mkdtemp(join(tmpdir(), "vaerion-wf-"));
  workspaces.push(ws);
  const config = configFor();
  const graph = graphFromConfig(config, `graph_${runId.slice(-8)}`, agentGrants(config, policy, { kind: "agent", id: "agent:wf" }));
  const harness = await RunHarness.create({ workspaceDir: ws, runId, traceId: TRACE_ID, configFingerprint: "cfg_wf_test", clock, idGen, permissionGraph: graph });
  const tools = new ToolInvocationService({
    clock,
    idGen,
    registry: ToolRegistry.fromConfig(config.tools ?? []),
    executors: executors ?? new Map([["echo", echoTool]]),
  });
  return { clock, idGen, ws, runId, harness, tools, config };
}

const note = (text: string): PlanStep => ({ kind: "note", text });

describe("DAG validation (E1803, fail-closed)", () => {
  const ok: WorkflowDag = { id: "wf", nodes: [{ id: "a", deps: [], step: note("x") }, { id: "b", deps: ["a"], step: note("y") }] };

  test("valid DAGs pass and schedule deterministically (lexicographic tie-break)", () => {
    expect(() => assertWorkflowDag(ok)).not.toThrow();
    expect(topoOrder(ok)).toEqual(["a", "b"]);
    const diamond: WorkflowDag = {
      id: "wf",
      nodes: [
        { id: "s", deps: [], step: note("s") },
        { id: "l", deps: ["s"], step: note("l") },
        { id: "r", deps: ["s"], step: note("r") },
        { id: "t", deps: ["r", "l"], step: note("t") },
      ],
    };
    expect(topoOrder(diamond)).toEqual(["s", "l", "r", "t"]);
  });

  test("cycles, missing deps, duplicates, and malformed nodes are refused", () => {
    expect(() => assertWorkflowDag({ id: "wf", nodes: [
      { id: "a", deps: ["b"], step: note("x") },
      { id: "b", deps: ["a"], step: note("y") },
    ] })).toThrow(/cycle/);
    expect(() => assertWorkflowDag({ id: "wf", nodes: [{ id: "a", deps: ["ghost"], step: note("x") }] })).toThrow(/dependency/);
    expect(() => assertWorkflowDag({ id: "wf", nodes: [
      { id: "a", deps: [], step: note("x") },
      { id: "a", deps: [], step: note("y") },
    ] })).toThrow(/duplicate/);
    expect(() => assertWorkflowDag({ id: "wf", nodes: [{ id: "a", deps: [], step: { kind: "nope" } as unknown as PlanStep }] })).toThrow();
    expect(() => assertWorkflowDag({ id: "Bad_ID", nodes: [{ id: "a", deps: [], step: note("x") }] })).toThrow();
    expect(() => assertWorkflowDag({ id: "wf", nodes: [{ id: "a", deps: ["a"], step: note("x") }] })).toThrow(/self-dependency/);
    expect(() => topoOrder({ id: "wf", nodes: [
      { id: "a", deps: ["b"], step: note("x") },
      { id: "b", deps: ["a"], step: note("y") },
    ] })).toThrow();
  });
});

describe("workflow engine (journal-backed DAG execution)", () => {
  test("nodes run in topo order; outputs are content-addressed; chain verifies", async () => {
    const { ws, runId, harness, tools } = await makeFixture();
    const engine = new WorkflowEngine({ harness, clock: new FixedClock(T0), idGen: new SeededIdGen(() => T0, new SeededRng(1)), blobRoot: join(ws, ".vaerion", "blobs"), gateway: null, tools, research: null });
    const dag: WorkflowDag = {
      id: "pipeline",
      nodes: [
        { id: "fetch", deps: [], step: { kind: "tool", tool: "echo", args: { value: "doc" } } },
        { id: "transform", deps: ["fetch"], step: note("transformed") },
        { id: "index", deps: ["transform", "fetch"], step: note("indexed") },
      ],
    };
    const result = await engine.run({ dag, principal: { kind: "agent", id: "agent:wf" }, policy, budget: { tokensUsed: 0, microUsdUsed: 0 } });
    expect(result.outcome).toBe("completed");
    expect(result.completedNodes).toEqual(["fetch", "transform", "index"]);
    expect(Object.values(result.outputs).every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
    const recs = (await readJournal(RunHarness.journalPathFor(ws, runId))).records;
    const started = recs.filter((r) => r.k === "evt" && r.env.type === "workflow.node.started") as Array<Extract<JournalRecord, { k: "evt" }>>;
    expect(started.map((e) => e.env.payload.node)).toEqual(["fetch", "transform", "index"]);
    const completed = recs.filter((r) => r.k === "evt" && r.env.type === "workflow.node.completed") as Array<Extract<JournalRecord, { k: "evt" }>>;
    expect(completed.every((e) => typeof e.env.payload.blob_ref === "object")).toBe(true);
    expect(recs.some((r) => r.k === "evt" && r.env.type === "store.blob.put")).toBe(true);
    const verify = await verifyJournal(RunHarness.journalPathFor(ws, runId));
    expect(verify.ok).toBe(true);
    await harness.release();
  });

  test("node failure stops dependents; failed nodes journaled; outcome failed", async () => {
    const { ws, runId, harness } = await makeFixture(7, new Map([
      ["echo", { args: { value: "any" }, execute: async () => { throw new Error("node exploded"); } } as ToolExecutor],
    ]));
    const tools = new ToolInvocationService({ clock: new FixedClock(T0), idGen: new SeededIdGen(() => T0, new SeededRng(7)), registry: ToolRegistry.fromConfig([{ name: "echo" }]), executors: new Map([
      ["echo", { args: { value: "any" }, execute: async () => { throw new Error("node exploded"); } }],
    ]) });
    const engine = new WorkflowEngine({ harness, clock: new FixedClock(T0), idGen: new SeededIdGen(() => T0, new SeededRng(7)), blobRoot: join(ws, ".vaerion", "blobs"), gateway: null, tools, research: null });
    const dag: WorkflowDag = {
      id: "failing",
      nodes: [
        { id: "boom", deps: [], step: { kind: "tool", tool: "echo", args: { value: 1 } } },
        { id: "after", deps: ["boom"], step: note("never runs") },
      ],
    };
    const result = await engine.run({ dag, principal: { kind: "agent", id: "agent:wf" }, policy, budget: { tokensUsed: 0, microUsdUsed: 0 } });
    expect(result.outcome).toBe("failed");
    expect(result.failedNodes).toEqual([{ node: "boom", error_code: "E1900" }]);
    expect(result.completedNodes).toEqual([]);
    const recs = (await readJournal(RunHarness.journalPathFor(ws, runId))).records;
    expect(recs.some((r) => r.k === "evt" && r.env.type === "workflow.node.started" && (r as Extract<JournalRecord, { k: "evt" }>).env.payload.node === "after")).toBe(false);
    await harness.release();
  });

  test("crash-safe resume: completed nodes are skipped; chain preserved", async () => {
    const { ws, runId, harness, tools } = await makeFixture(9);
    const clock = new FixedClock(T0);
    const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(9));
    const dag: WorkflowDag = {
      id: "resumable",
      nodes: [
        { id: "one", deps: [], step: note("one") },
        { id: "two", deps: ["one"], step: note("two") },
        { id: "three", deps: ["two"], step: note("three") },
      ],
    };
    // Phase 1: execute only the first node (simulate crash after it).
    const engine1 = new WorkflowEngine({ harness, clock, idGen, blobRoot: join(ws, ".vaerion", "blobs"), gateway: null, tools, research: null });
    const partialDag: WorkflowDag = { ...dag, nodes: [dag.nodes[0]!] };
    await engine1.run({ dag: partialDag, principal: { kind: "agent", id: "agent:wf" }, policy, budget: { tokensUsed: 0, microUsdUsed: 0 } });
    await harness.release();

    // Phase 2: resume with the FULL dag — completed nodes are skipped.
    const resumed = await RunHarness.restore({ workspaceDir: ws, runId, traceId: TRACE_ID, configFingerprint: "cfg", clock, idGen });
    const engine2 = new WorkflowEngine({ harness: resumed.harness, clock, idGen, blobRoot: join(ws, ".vaerion", "blobs"), gateway: null, tools, research: null });
    const state = workflowStateFromRecords(dag.id, resumed.read.records);
    expect(state.completedNodes).toEqual(["one"]);
    const result = await engine2.run({ dag, principal: { kind: "agent", id: "agent:wf" }, policy, budget: { tokensUsed: 0, microUsdUsed: 0 } }, { resumeState: state });
    expect(result.outcome).toBe("completed");
    expect(result.completedNodes).toEqual(["one", "two", "three"]);
    const recs = (await readJournal(RunHarness.journalPathFor(ws, runId))).records;
    const started = recs.filter((r) => r.k === "evt" && r.env.type === "workflow.node.started") as Array<Extract<JournalRecord, { k: "evt" }>>;
    // Node "one" started exactly once across both phases (skip law).
    expect(started.filter((e) => e.env.payload.node === "one")).toHaveLength(1);
    expect(started.filter((e) => e.env.payload.node === "two")).toHaveLength(1);
    const verify = await verifyJournal(RunHarness.journalPathFor(ws, runId));
    expect(verify.ok).toBe(true);
    await resumed.harness.release();
  });
});
