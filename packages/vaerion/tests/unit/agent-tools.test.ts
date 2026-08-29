/**
 * Vaerion agent tools — unit tests (MS-4).
 *
 * Law under test: declared-before-used (E1801), typed args (E1802), and the
 * broker pipeline (requested → decide → journal → completed | denied).
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
import { readRefusals } from "../../src/broker/refusal-log.ts";
import { validateConfig, policyFromConfig, type VaerionConfig } from "../../src/config/config.ts";
import { graphFromConfig } from "../../src/broker/engine.ts";
import { ToolRegistry, ToolInvocationService, ToolGatePrompt, echoTool, clockReadTool, researchSearchTool, type SearchableIndex } from "../../src/agents/tools.ts";
import { agentGrants } from "../../src/agents/grants.ts";
import type { JournalRecord } from "../../src/journal/records.ts";
import type { PolicyContract } from "../../src/broker/contracts/decision.ts";

const TRACE_ID = "t_tools_test";
const T0 = 1735689600000;
const workspaces: string[] = [];
afterAll(async () => {
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
});

function configWithTools(overrides: Partial<VaerionConfig> = {}): VaerionConfig {
  return validateConfig({
    schemaVersion: "0.1",
    project: { name: "tools-it", description: "unit" },
    tools: [{ name: "echo" }, { name: "clock.read" }, { name: "research.search" }],
    policy: {
      rules: [
        { id: "agent-tools-allow", principalKinds: ["agent"], domain: "tool.call", scope: "*", effect: "allow", rationale: "unit test allow" },
      ],
    },
    telemetry: { enabled: false },
    ...overrides,
  });
}

const denyToolPolicy: PolicyContract = {
  policy_id: "deny-tools",
  version: 1,
  rules: [{ id: "deny-tool", principalKinds: ["agent"], domain: "tool.call", scope: "*", effect: "deny", rationale: "no tool may run" }],
};

const promptToolPolicy: PolicyContract = {
  policy_id: "prompt-tools",
  version: 1,
  rules: [{ id: "prompt-tool", principalKinds: ["agent"], domain: "tool.call", scope: "*", effect: "prompt", gateLabel: "Tool needs human approval", rationale: "unit test prompt" }],
};

const agentPrincipal = { kind: "agent" as const, id: "agent:tools-test" };

async function makeFixture(policy: PolicyContract, config: VaerionConfig) {
  const clock = new FixedClock(T0);
  const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(42));
  const runId = crn2(idGen);
  const ws = await mkdtemp(join(tmpdir(), "vaerion-tools-"));
  workspaces.push(ws);
  const graph = graphFromConfig(config, `graph_${runId.slice(-8)}`, agentGrants(config, policy, agentPrincipal));
  const harness = await RunHarness.create({ workspaceDir: ws, runId, traceId: TRACE_ID, configFingerprint: "cfg_tools_test", clock, idGen, permissionGraph: graph });
  const registry = ToolRegistry.fromConfig(config.tools ?? []);
  const index: SearchableIndex = {
    query: (text, limit) => [{ doc_id: `doc:${text.slice(0, 8)}`, score: 0.9876, matched_terms: ["journal", "spine"] }].slice(0, limit ?? 10),
  };
  const tools = new ToolInvocationService({
    clock,
    idGen,
    registry,
    executors: new Map([
      ["echo", echoTool],
      ["clock.read", clockReadTool],
      ["research.search", researchSearchTool(index)],
    ]),
  });
  return { clock, idGen, ws, runId, harness, tools };
}

function crn2(idGen: { next(): string }): string {
  return `crn_run_${idGen.next()}`;
}

async function records(ws: string, runId: string): Promise<JournalRecord[]> {
  return (await readJournal(RunHarness.journalPathFor(ws, runId))).records;
}

describe("tool registry (declared-before-used)", () => {
  test("undeclared tools are refused E1801 BEFORE any journaling", async () => {
    const { ws, runId, harness, tools } = await makeFixture(denyToolPolicy, configWithTools());
    try {
      await tools.invoke(harness, { tool: "ghost", args: {}, principal: agentPrincipal, policy: denyToolPolicy, requestId: "req_01GhostToolTestId0000", intent: "unknown tool" });
      expect.unreachable();
    } catch (err) {
      expect((err as { code?: string }).code).toBe("E1801");
    }
    const recs = await records(ws, runId);
    expect(recs.some((r) => r.k === "evt" && r.env.type === "tool.call.requested")).toBe(false);
    await harness.release();
  });

  test("invalid args are refused E1802 (wrong type, unknown key)", async () => {
    const { harness, tools } = await makeFixture(denyToolPolicy, configWithTools());
    for (const bad of [
      { tool: "research.search", args: {} },
      { tool: "research.search", args: { query: 42 } },
      { tool: "research.search", args: { query: "x", mystery: true } },
      { tool: "clock.read", args: { extra: 1 } },
    ]) {
      try {
        await tools.invoke(harness, { tool: bad.tool, args: bad.args, principal: agentPrincipal, policy: denyToolPolicy, requestId: "req_01BadArgsTestId000000", intent: "bad args" });
        expect.unreachable();
      } catch (err) {
        expect((err as { code?: string }).code).toBe("E1802");
      }
    }
    await harness.release();
  });

  test("duplicate declarations and malformed names are construction errors", () => {
    expect(() => ToolRegistry.fromConfig([{ name: "echo" }, { name: "echo" }])).toThrow();
    expect(() => ToolRegistry.fromConfig([{ name: "BadName" }])).toThrow();
    expect(ToolRegistry.fromConfig([{ name: "echo" }]).declaration("echo")?.scope).toBe("echo");
    expect(ToolRegistry.fromConfig([{ name: "echo", scope: "tools/echo" }]).declaration("echo")?.scope).toBe("tools/echo");
  });
});

describe("tool pipeline (broker → journal → execute → receipt)", () => {
  test("allow flow: requested → decision → completed with hash + result", async () => {
    const allowPolicy = policyFromConfig(configWithTools());
    const { ws, runId, harness, tools } = await makeFixture(allowPolicy, configWithTools());
    const result = await tools.invoke(harness, {
      tool: "echo",
      args: { value: "hello tools" },
      principal: agentPrincipal,
      policy: allowPolicy,
      requestId: "req_01AllowToolFlowTestId00",
      intent: "unit: echo through the broker pipeline",
    });
    expect(result.ok).toBe(true);
    expect(result.resultHash).toMatch(/^[0-9a-f]{64}$/);
    expect((result.result as { echoed: unknown }).echoed).toBe("hello tools");
    const recs = await records(ws, runId);
    const types = recs.filter((r) => r.k === "evt").map((r) => (r.k === "evt" ? r.env.type : ""));
    expect(types).toContain("tool.call.requested");
    expect(types).toContain("tool.call.completed");
    const completed = recs.find((r) => r.k === "evt" && r.env.type === "tool.call.completed")!;
    expect((completed as Extract<JournalRecord, { k: "evt" }>).env.payload.ok).toBe(true);
    expect(typeof (completed as Extract<JournalRecord, { k: "evt" }>).env.payload.result_hash).toBe("string");
    const verify = await verifyJournal(RunHarness.journalPathFor(ws, runId));
    expect(verify.ok).toBe(true);
    await harness.release();
  });

  test("deny flow: requested → denied journaled + refusal logged, E1300 thrown", async () => {
    const { ws, runId, harness, tools } = await makeFixture(denyToolPolicy, configWithTools());
    try {
      await tools.invoke(harness, { tool: "echo", args: { value: 1 }, principal: agentPrincipal, policy: denyToolPolicy, requestId: "req_01DenyToolFlowTestId000", intent: "unit: denied tool" });
      expect.unreachable();
    } catch (err) {
      expect((err as { code?: string }).code).toBe("E1300");
    }
    const recs = await records(ws, runId);
    expect(recs.some((r) => r.k === "evt" && r.env.type === "tool.call.denied")).toBe(true);
    const refusals = await readRefusals(join(ws, ".vaerion", "refusals.log"), { runId });
    expect(refusals.length).toBe(1);
    expect(refusals[0]!.domain).toBe("tool.call");
    await harness.release();
  });

  test("prompt flow: durable gate opens; ToolGatePrompt carries it", async () => {
    const { ws, runId, harness, tools } = await makeFixture(promptToolPolicy, configWithTools());
    try {
      await tools.invoke(harness, { tool: "echo", args: { value: 1 }, principal: agentPrincipal, policy: promptToolPolicy, requestId: "req_01PromptToolFlowTestId0", intent: "unit: prompted tool" });
      expect.unreachable();
    } catch (err) {
      expect(err instanceof ToolGatePrompt).toBe(true);
      const gate = (err as ToolGatePrompt).gate;
      expect(gate.state).toBe("open");
      expect(gate.decision_id).toBe((err as ToolGatePrompt).record.decision_id);
    }
    const recs = await records(ws, runId);
    expect(recs.some((r) => r.k === "gate" && r.gate.state === "open")).toBe(true);
    await harness.release();
  });

  test("builtin research.search returns journal-safe integer milli-scores", async () => {
    const { harness, tools } = await makeFixture(denyToolPolicy, configWithTools());
    const result = await tools.invoke(harness, {
      tool: "research.search",
      args: { query: "journal spine" },
      principal: agentPrincipal,
      policy: policyFromConfig(configWithTools()),
      requestId: "req_01SearchToolFlowTestId000",
      intent: "unit: deterministic search",
    });
    const hits = (result.result as { hits: Array<{ score_milli: number }> }).hits;
    expect(hits[0]!.score_milli).toBe(988); // 0.9876 → 988 (integer, journal-safe)
    await harness.release();
  });
  test("executor failure after authorization journals completed-with-failure", async () => {
    const { ws, runId, harness } = await makeFixture(denyToolPolicy, configWithTools());
    const clock = new FixedClock(T0);
    const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(7));
    const boom = new ToolInvocationService({
      clock,
      idGen,
      registry: ToolRegistry.fromConfig([{ name: "echo" }]),
      executors: new Map([["echo", { args: { value: "any" }, execute: async () => { throw new Error("executor exploded"); } }]]),
    });
    await boom
      .invoke(harness, { tool: "echo", args: { value: 1 }, principal: agentPrincipal, policy: policyFromConfig(configWithTools()), requestId: "req_01BoomToolFlowTestId000", intent: "unit: failing executor" })
      .catch(() => undefined);
    const recs = await records(ws, runId);
    const completed = recs.find((r) => r.k === "evt" && r.env.type === "tool.call.completed") as Extract<JournalRecord, { k: "evt" }> | undefined;
    expect(completed).toBeDefined();
    expect(completed!.env.payload.ok).toBe(false);
    expect(completed!.env.payload.message).toContain("executor exploded");
    await harness.release();
  });
});
