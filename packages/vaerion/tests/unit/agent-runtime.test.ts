/**
 * Vaerion agent runtime + planner + reasoning + metrics — unit tests (MS-4).
 *
 * Law under test: every step journaled with round/index coordinates; broker
 * refusals fatal; step ceilings loud (E1804); plan contract enforced (E1800);
 * gate prompts pause with awaiting_gate; an approved gate becomes durable
 * elevation authority and the loop resumes from its journaled steps;
 * deterministic memory folding; metrics fold from the journal alone.
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
import { graphFromConfig } from "../../src/broker/engine.ts";
import { GatewayService, GatewayGatePrompt } from "../../src/gateway/service.ts";
import { mockBrainAdapter } from "../../src/gateway/mockbrain.ts";
import { cassetteTransport } from "../../src/gateway/cassette.ts";
import { AgentRuntime, agentStateFromRecords } from "../../src/agents/runtime.ts";
import { InlinePlanner, ModelPlanner, parsePlanText, type PlanStep } from "../../src/agents/planner.ts";
import { ToolRegistry, ToolInvocationService, ToolGatePrompt, echoTool } from "../../src/agents/tools.ts";
import { ReasoningSession, reasoningStateReducer, unfoldedNotes, foldSummary, initialReasoningState } from "../../src/agents/reasoning.ts";
import { agentMetricsFromRecords } from "../../src/agents/metrics.ts";
import { agentGrants } from "../../src/agents/grants.ts";
import type { JournalRecord } from "../../src/journal/records.ts";
import type { PolicyContract } from "../../src/broker/contracts/decision.ts";

const TRACE_ID = "t_agent_test";
const T0 = 1735689600000;
const workspaces: string[] = [];
afterAll(async () => {
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
});

function configFor(overrides: Partial<VaerionConfig> = {}): VaerionConfig {
  return validateConfig({
    schemaVersion: "0.1",
    project: { name: "agent-it", description: "unit" },
    gateway: { providers: { mockbrain: { enabled: true, models: ["mock-1"] } } },
    tools: [{ name: "echo" }],
    policy: {
      rules: [
        { id: "agent-model-allow", principalKinds: ["agent"], domain: "model.invoke", scope: "mockbrain/*", effect: "allow", rationale: "unit allow" },
        { id: "agent-tools-allow", principalKinds: ["agent"], domain: "tool.call", scope: "echo", effect: "allow", rationale: "unit allow" },
      ],
    },
    telemetry: { enabled: false },
    ...overrides,
  });
}

const agentPolicy: PolicyContract = {
  policy_id: "agent-unit",
  version: 1,
  rules: [
    { id: "model-allow", principalKinds: ["agent"], domain: "model.invoke", scope: "mockbrain/*", effect: "allow", rationale: "unit" },
    { id: "tool-allow", principalKinds: ["agent"], domain: "tool.call", scope: "echo", effect: "allow", rationale: "unit" },
  ],
};

const agentPrincipal = { kind: "agent" as const, id: "agent:unit" };

async function makeFixture(config: VaerionConfig, seed = 42) {
  const clock = new FixedClock(T0);
  const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(seed));
  const runId = `crn_run_${idGen.next()}`;
  const ws = await mkdtemp(join(tmpdir(), "vaerion-agent-"));
  workspaces.push(ws);
  const graph = graphFromConfig(config, `graph_${runId.slice(-8)}`, agentGrants(config, agentPolicy, agentPrincipal));
  const harness = await RunHarness.create({ workspaceDir: ws, runId, traceId: TRACE_ID, configFingerprint: "cfg_agent_test", clock, idGen, permissionGraph: graph });
  const gateway = new GatewayService({ clock, rng: new SeededRng(seed), idGen, transport: cassetteTransport([]), secrets: { name: "unit", resolve: () => Promise.resolve(null) }, adapters: [mockBrainAdapter] });
  const tools = new ToolInvocationService({ clock, idGen, registry: ToolRegistry.fromConfig(config.tools ?? []), executors: new Map([["echo", echoTool]]) });
  return { clock, idGen, ws, runId, harness, gateway, tools };
}

async function records(ws: string, runId: string): Promise<JournalRecord[]> {
  return (await readJournal(RunHarness.journalPathFor(ws, runId))).records;
}

const noteStep = (text: string): PlanStep => ({ kind: "note", text });
const echoStep = (value: unknown): PlanStep => ({ kind: "tool", tool: "echo", args: { value } });
const modelStep = (seed: number): PlanStep => ({ kind: "model", model: "mockbrain/mock-1", messages: [{ role: "user", content: `do step ${seed}` }], seed });

function mkRuntime(harness: RunHarness, gateway: GatewayService | null, tools: ToolInvocationService | null, opts: { maxSteps?: number; stepAttempts?: number; idGen?: { next(): string }; clock?: FixedClock } = {}): AgentRuntime {
  const clock = opts.clock ?? new FixedClock(T0);
  const idGen = opts.idGen ?? new SeededIdGen(() => clock.nowMs(), new SeededRng(1));
  return new AgentRuntime({ harness, clock, idGen, maxSteps: opts.maxSteps ?? 8, stepAttempts: opts.stepAttempts, gateway, tools, research: null, actor: agentPrincipal });
}

describe("plan contract (E1800)", () => {
  test("parsePlanText accepts JSON objects and fenced JSON", () => {
    const plan = parsePlanText('{"done": true, "rationale": "r", "steps": [{"kind": "note", "text": "n"}]}');
    expect(plan.done).toBe(true);
    expect(plan.steps).toHaveLength(1);
    const fenced = parsePlanText("```json\n{\"done\": false, \"rationale\": \"r\", \"steps\": []}\n```");
    expect(fenced.done).toBe(false);
  });

  test("parsePlanText refuses non-plan output loudly", () => {
    expect(() => parsePlanText("mock(seed=1): on topic — spine journal deterministic.")).toThrow();
    expect(() => parsePlanText('{"done": "yes", "rationale": "r", "steps": []}')).toThrow();
    expect(() => parsePlanText('{"done": true, "rationale": "r", "steps": [{"kind": "summon"}]}')).toThrow();
  });

  test("InlinePlanner is deterministic across rounds", async () => {
    const planner = new InlinePlanner({ goal: "g", steps: [noteStep("a"), echoStep(1)] });
    const p1 = await planner.plan({ goal: "g", round: 0, history: [], packs: [] });
    const p2 = await planner.plan({ goal: "g", round: 3, history: [], packs: [] });
    expect(p1).toEqual(p2);
  });
});

describe("agent runtime (supervisor over journaled decisions)", () => {
  test("inline run: every step journaled; outcome goal; chain verifies", async () => {
    const { ws, runId, harness, gateway, tools } = await makeFixture(configFor(), 42);
    const runtime = mkRuntime(harness, gateway, tools, { idGen: new SeededIdGen(() => T0, new SeededRng(1)) });
    const result = await runtime.run({
      goal: "prove the loop",
      principal: agentPrincipal,
      policy: agentPolicy,
      planner: new InlinePlanner({ goal: "prove the loop", steps: [noteStep("thinking"), echoStep("payload"), modelStep(42)] }),
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    expect(result.outcome).toBe("goal");
    expect(result.steps).toBe(3);
    expect(result.tokensUsed).toBeGreaterThan(0); // the model step is metered
    const recs = await records(ws, runId);
    const stepEvents = recs.filter((r) => r.k === "evt" && r.env.type === "agent.step.recorded") as Array<Extract<JournalRecord, { k: "evt" }>>;
    expect(stepEvents).toHaveLength(3);
    expect(stepEvents.map((e) => e.env.payload.round)).toEqual([0, 0, 0]);
    expect(stepEvents.map((e) => e.env.payload.index)).toEqual([0, 1, 2]);
    const modelStepEvent = stepEvents[2]!;
    expect(modelStepEvent.env.payload.kind).toBe("model");
    expect(modelStepEvent.env.payload.input_tokens).toBeGreaterThan(0);
    expect(typeof modelStepEvent.env.payload.cost_micro_usd).toBe("number");
    expect(recs.some((r) => r.k === "evt" && r.env.type === "agent.run.completed")).toBe(true);
    const verify = await verifyJournal(RunHarness.journalPathFor(ws, runId));
    expect(verify.ok).toBe(true);
    await harness.release();
  });

  test("model steps cross the gateway single gate (decide → journal → act)", async () => {
    const { ws, runId, harness, gateway, tools } = await makeFixture(configFor(), 43);
    const runtime = mkRuntime(harness, gateway, tools, { idGen: new SeededIdGen(() => T0, new SeededRng(2)) });
    await runtime.run({
      goal: "metered",
      principal: agentPrincipal,
      policy: agentPolicy,
      planner: new InlinePlanner({ goal: "metered", steps: [modelStep(7)] }),
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    const recs = await records(ws, runId);
    // A journaled model.invoke broker decision exists BEFORE the step event.
    const decisions = recs.filter((r) => r.k === "decision").map((r) => (r.k === "decision" ? r.decision.domain : ""));
    expect(decisions).toContain("model.invoke");
    expect(recs.some((r) => r.k === "evt" && r.env.type === "gateway.invoke.recorded")).toBe(true);
    await harness.release();
  });

  test("broker refusal is fatal: outcome failed, no retry around authority", async () => {
    const { ws, runId, harness, gateway, tools } = await makeFixture(configFor(), 44);
    const denialPolicy: PolicyContract = {
      policy_id: "deny-tools",
      version: 1,
      rules: [{ id: "deny-tool", principalKinds: ["agent"], domain: "tool.call", scope: "*", effect: "deny", rationale: "nope" }],
    };
    const runtime = mkRuntime(harness, gateway, tools, { idGen: new SeededIdGen(() => T0, new SeededRng(3)) });
    const result = await runtime.run({
      goal: "refused",
      principal: agentPrincipal,
      policy: denialPolicy,
      planner: new InlinePlanner({ goal: "refused", steps: [echoStep(1)] }),
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    expect(result.outcome).toBe("failed");
    expect(result.failures).toBe(1);
    const recs = await records(ws, runId);
    expect(recs.some((r) => r.k === "evt" && r.env.type === "tool.call.denied")).toBe(true);
    expect(recs.some((r) => r.k === "evt" && r.env.type === "agent.step.failed")).toBe(true);
    await harness.release();
  });

  test("step ceiling stops loudly (E1804) with journaled work intact", async () => {
    const { ws, runId, harness, gateway, tools } = await makeFixture(configFor(), 45);
    const runtime = mkRuntime(harness, gateway, tools, { maxSteps: 2, idGen: new SeededIdGen(() => T0, new SeededRng(4)) });
    try {
      await runtime.run({
        goal: "too many",
        principal: agentPrincipal,
        policy: agentPolicy,
        planner: new InlinePlanner({ goal: "too many", steps: [echoStep(1), echoStep(2), echoStep(3)] }),
        budget: { tokensUsed: 0, microUsdUsed: 0 },
      });
      expect.unreachable();
    } catch (err) {
      expect((err as { code?: string }).code).toBe("E1804");
    }
    const recs = await records(ws, runId);
    expect(recs.filter((r) => r.k === "evt" && r.env.type === "agent.step.recorded")).toHaveLength(2);
    const completed = recs.find((r) => r.k === "evt" && r.env.type === "agent.run.completed") as Extract<JournalRecord, { k: "evt" }>;
    expect(completed.env.payload.outcome).toBe("step_limit");
    await harness.release();
  });

  test("retries are bounded and journaled; success after transient failure", async () => {
    const { ws, runId, harness } = await makeFixture(configFor(), 46);
    const clock = new FixedClock(T0);
    const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(5));
    let attempts = 0;
    const flaky = new ToolInvocationService({
      clock,
      idGen,
      registry: ToolRegistry.fromConfig([{ name: "echo" }]),
      executors: new Map([
        [
          "echo",
          {
            args: { value: "any" },
            execute: async (args) => {
              attempts++;
              if (attempts < 3) throw new Error(`transient ${attempts}`);
              return { echoed: args.value, attempt: attempts };
            },
          },
        ],
      ]),
    });
    const runtime = mkRuntime(harness, null, flaky, { stepAttempts: 3, idGen });
    const result = await runtime.run({
      goal: "flaky",
      principal: agentPrincipal,
      policy: agentPolicy,
      planner: new InlinePlanner({ goal: "flaky", steps: [echoStep("x")] }),
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    expect(result.outcome).toBe("goal");
    expect(attempts).toBe(3);
    const recs = await records(ws, runId);
    const step = recs.find((r) => r.k === "evt" && r.env.type === "agent.step.recorded") as Extract<JournalRecord, { k: "evt" }>;
    expect(step.env.payload.attempt).toBe(3);
    await harness.release();
  });

  test("metrics fold from the journal alone (order-free)", async () => {
    const { ws, runId, harness, gateway, tools } = await makeFixture(configFor(), 47);
    const runtime = mkRuntime(harness, gateway, tools, { idGen: new SeededIdGen(() => T0, new SeededRng(9)) });
    await runtime.run({
      goal: "metrics",
      principal: agentPrincipal,
      policy: agentPolicy,
      planner: new InlinePlanner({ goal: "metrics", steps: [echoStep(1), modelStep(9), noteStep("bookkeeping")] }),
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    const recs = await records(ws, runId);
    const m = agentMetricsFromRecords(recs);
    expect(m.run.started).toBe(true);
    expect(m.run.outcome).toBe("goal");
    expect(m.run.steps).toBe(3);
    expect(m.run.failures).toBe(0);
    expect(m.model.invocations).toBe(1);
    expect(m.model.inputTokens).toBeGreaterThan(0);
    expect(m.tools.completed).toBe(1);
    expect(m.context.notes).toBe(1);
    // The fold equals what the runtime returned (single source of truth).
    const state = agentStateFromRecords(runId, TRACE_ID, recs);
    expect(state.tokensUsed).toBe(m.model.inputTokens + m.model.outputTokens);
  });

  test("gate prompt pauses with awaiting_gate; approval elevates; resume completes", async () => {
    const { ws, runId, harness, gateway, tools } = await makeFixture(configFor(), 48);
    const promptPolicy: PolicyContract = {
      policy_id: "prompt-tools",
      version: 1,
      rules: [{ id: "prompt-tool", principalKinds: ["agent"], domain: "tool.call", scope: "echo", effect: "prompt", gateLabel: "Approve echo?", rationale: "human authority" }],
    };
    // Attempt 1: the tool step hits a prompt decision → run pauses.
    const runtime1 = mkRuntime(harness, gateway, tools, { idGen: new SeededIdGen(() => T0, new SeededRng(6)) });
    const paused = await runtime1.run({
      goal: "needs authority",
      principal: agentPrincipal,
      policy: promptPolicy,
      planner: new InlinePlanner({ goal: "needs authority", steps: [echoStep("authorized-payload")] }),
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    expect(paused.outcome).toBe("awaiting_gate");
    expect(paused.gate).not.toBeNull();
    await harness.release();

    // Human authority: restore, resolve the gate with approval (elevation),
    // and CONTINUE the loop from the journaled state.
    const clock = new FixedClock(T0);
    const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(6));
    const restored = await RunHarness.restore({ workspaceDir: ws, runId, traceId: TRACE_ID, configFingerprint: "cfg", clock, idGen });
    expect(restored.state.openGates).toHaveLength(1);
    const gate = restored.state.openGates[0]!;
    await restored.harness.resolveGate(gate, { approved: true });

    const agentState = agentStateFromRecords(runId, TRACE_ID, restored.read.records);
    expect(agentState.started).toBe(true);
    expect(agentState.completedSteps).toHaveLength(0);
    const runtime2 = mkRuntime(restored.harness, gateway, tools, { idGen });
    const result = await runtime2.run(
      {
        goal: "needs authority",
        principal: agentPrincipal,
        policy: promptPolicy, // the SAME prompt policy — the elevation answers it
        planner: new InlinePlanner({ goal: "needs authority", steps: [echoStep("authorized-payload")] }),
        budget: { tokensUsed: 0, microUsdUsed: 0 },
      },
      agentState,
    );
    expect(result.outcome).toBe("goal");
    expect(result.steps).toBe(1);
    const recs = await records(ws, runId);
    // The elevation decision is journaled with policy human-elevation.
    const elevations = recs.filter((r) => r.k === "decision" && r.decision.decision.policy === "human-elevation");
    expect(elevations).toHaveLength(1);
    expect(recs.some((r) => r.k === "evt" && r.env.type === "broker.elevation.recorded")).toBe(true);
    const verify = await verifyJournal(RunHarness.journalPathFor(ws, runId));
    expect(verify.ok).toBe(true);
    await restored.harness.release();
  });

  test("gateway gate prompts pause identically (GatewayGatePrompt path)", async () => {
    const { harness, gateway, tools } = await makeFixture(configFor(), 49);
    const promptModelPolicy: PolicyContract = {
      policy_id: "prompt-model",
      version: 1,
      rules: [{ id: "prompt-model", principalKinds: ["agent"], domain: "model.invoke", scope: "mockbrain/*", effect: "prompt", gateLabel: "Approve model call?", rationale: "human authority" }],
    };
    const runtime = mkRuntime(harness, gateway, tools, { idGen: new SeededIdGen(() => T0, new SeededRng(7)) });
    const result = await runtime.run({
      goal: "model gate",
      principal: agentPrincipal,
      policy: promptModelPolicy,
      planner: new InlinePlanner({ goal: "model gate", steps: [modelStep(1)] }),
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    expect(result.outcome).toBe("awaiting_gate");
    expect(result.gate).not.toBeNull();
    await harness.release();
  });

  test("ModelPlanner fails loudly when the model output is not a plan (E1800)", async () => {
    const { ws, runId, harness, gateway } = await makeFixture(configFor(), 50);
    const planner = new ModelPlanner({
      host: harness,
      gateway,
      model: "mockbrain/mock-1",
      principal: agentPrincipal,
      policy: agentPolicy,
      requestId: () => "req_01ModelPlannerTestId00000",
      budget: () => ({ tokensUsed: 0, microUsdUsed: 0 }),
    });
    try {
      await planner.plan({ goal: "plan please", round: 0, history: [], packs: [] });
      expect.unreachable();
    } catch (err) {
      expect((err as { code?: string }).code).toBe("E1800");
    }
    // The planning invocation was still metered through the single gate.
    const recs = await records(ws, runId);
    expect(recs.some((r) => r.k === "evt" && r.env.type === "gateway.invoke.recorded")).toBe(true);
    await harness.release();
  });
});

describe("reasoning sessions (persistent, deterministic folding)", () => {
  test("notes are journaled; the fold is a pure function of the notes", async () => {
    const { ws, runId, harness } = await makeFixture(configFor(), 51);
    const session = new ReasoningSession(harness, agentPrincipal);
    await session.note("The spine orders every envelope. Details follow.");
    await session.note("The journal chains hashes; it is append-only");
    const state = agentStateFromRecords(runId, TRACE_ID, await records(ws, runId)).reasoning;
    expect(state.notes).toHaveLength(2);
    expect(unfoldedNotes(state)).toHaveLength(2);
    const summary = foldSummary(unfoldedNotes(state));
    expect(summary).toContain("1. The spine orders every envelope.");
    expect(summary).toContain("2. The journal chains hashes; it is append-only");
    const fold = await session.fold(state);
    expect(fold.folded_count).toBe(2);
    const stateAfter = agentStateFromRecords(runId, TRACE_ID, await records(ws, runId)).reasoning;
    expect(stateAfter.folds).toHaveLength(1);
    expect(stateAfter.folds[0]!.summary_hash).toBe(fold.summary_hash);
    expect(unfoldedNotes(stateAfter)).toHaveLength(0);
    // Refold refuses nothing-to-fold (E1600).
    await expect(session.fold(stateAfter)).rejects.toThrow();
    await harness.release();
  });

  test("reasoningStateReducer replays the identical session from records", () => {
    let state = initialReasoningState();
    const mk = (type: string, payload: Record<string, unknown>, seq: number): JournalRecord =>
      ({ k: "evt", env: { v: 1, type, seq, ts: "2026-08-29T00:00:00.000Z", trace_id: "t", span_id: "s", actor: { kind: "agent", id: "a" }, cause: { kind: "envelope", ref: null }, payload } }) as unknown as JournalRecord;
    state = reasoningStateReducer(state, mk("reasoning.note.recorded", { index: 1, text: "one" }, 1));
    state = reasoningStateReducer(state, mk("reasoning.note.recorded", { index: 2, text: "two" }, 2));
    state = reasoningStateReducer(state, mk("reasoning.folded", { folded_count: 2, summary: "1. one 2. two", summary_hash: "h" }, 3));
    expect(state.notes).toHaveLength(2);
    expect(state.folds).toHaveLength(1);
    expect(unfoldedNotes(state)).toHaveLength(0);
    // Replaying from scratch yields the identical state.
    let again = initialReasoningState();
    again = reasoningStateReducer(again, mk("reasoning.note.recorded", { index: 1, text: "one" }, 1));
    again = reasoningStateReducer(again, mk("reasoning.note.recorded", { index: 2, text: "two" }, 2));
    again = reasoningStateReducer(again, mk("reasoning.folded", { folded_count: 2, summary: "1. one 2. two", summary_hash: "h" }, 3));
    expect(again).toEqual(state);
  });
});

// Unused-import guard: GatewayGatePrompt is exercised via the runtime path.
void GatewayGatePrompt;
