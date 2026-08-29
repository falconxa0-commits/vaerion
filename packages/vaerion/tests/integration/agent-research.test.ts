/**
 * Vaerion agent research integration — constitutional flow (MS-4).
 *
 * Law under test: `context` steps cross the ONE Context Path (declared
 * capability → deterministic retrieval → fenced evidence → citations → pack,
 * all journaled); answer steps over prepared content MUST cite it (E1806)
 * and citing answers carry their citations on the journaled step.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixedClock, SeededRng } from "../../src/kernel/clock.ts";
import { SeededIdGen } from "../../src/kernel/ids.ts";
import { RunHarness } from "../../src/runtime/run.ts";
import { readJournal } from "../../src/journal/reader.ts";
import { verifyJournal } from "../../src/journal/verify.ts";
import { validateConfig, type VaerionConfig } from "../../src/config/config.ts";
import { graphFromConfig } from "../../src/broker/engine.ts";
import { GatewayService } from "../../src/gateway/service.ts";
import { mockBrainAdapter } from "../../src/gateway/mockbrain.ts";
import { cassetteTransport } from "../../src/gateway/cassette.ts";
import { AgentRuntime, agentStateFromRecords } from "../../src/agents/runtime.ts";
import { InlinePlanner, type PlanStep } from "../../src/agents/planner.ts";
import { LocalResearchPort } from "../../src/agents/research-port.ts";
import { agentMetricsFromRecords } from "../../src/agents/metrics.ts";
import type { JournalRecord } from "../../src/journal/records.ts";
import type { PolicyContract } from "../../src/broker/contracts/decision.ts";

const TRACE_ID = "t_agent_research";
const T0 = 1735689600000;
const workspaces: string[] = [];
afterAll(async () => {
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
});

const agentPolicy: PolicyContract = {
  policy_id: "agent-research-it",
  version: 1,
  rules: [{ id: "model-allow", principalKinds: ["agent"], domain: "model.invoke", scope: "mockbrain/mock-1", effect: "allow", rationale: "integration" }],
};

const agentPrincipal = { kind: "agent" as const, id: "agent:research-it" };

async function makeFixture(): Promise<{ ws: string; runId: string; harness: RunHarness; gateway: GatewayService; research: LocalResearchPort; config: VaerionConfig }> {
  const clock = new FixedClock(T0);
  const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(42));
  const runId = `crn_run_${idGen.next()}`;
  const ws = await mkdtemp(join(tmpdir(), "vaerion-agent-res-"));
  workspaces.push(ws);
  // Declared source with two retrievable documents.
  const docs = join(ws, "docs");
  await mkdir(docs, { recursive: true });
  await writeFile(join(docs, "spine.md"), "# Spine\nThe event spine orders every envelope deterministically with actor and cause attribution.\n");
  await writeFile(join(docs, "journal.md"), "# Journal\nThe journal is an append-only blake3 hash chain with per-run sequence numbers.\n");
  const config = validateConfig({
    schemaVersion: "0.1",
    project: { name: "agent-research-it" },
    gateway: { providers: { mockbrain: { enabled: true, models: ["mock-1"] } } },
    research: { capabilities: [{ name: "docs", sources: [{ kind: "local", path: "./docs" }], fencing: "untrusted" }] },
    telemetry: { enabled: false },
  });
  const graph = graphFromConfig(config, `graph_${runId.slice(-8)}`, [
    // Model grant derived from the declared provider ceiling (agent law).
    { principalId: agentPrincipal.id, domain: "model.invoke", scopes: ["mockbrain/mock-1"] },
  ]);
  const harness = await RunHarness.create({ workspaceDir: ws, runId, traceId: TRACE_ID, configFingerprint: "cfg_res", clock, idGen, permissionGraph: graph });
  const gateway = new GatewayService({ clock, rng: new SeededRng(42), idGen, transport: cassetteTransport([]), secrets: { name: "x", resolve: () => Promise.resolve(null) }, adapters: [mockBrainAdapter] });
  const { declareResearchCapability } = await import("../../src/research/capability.ts");
  const capabilities = new Map([
    ["docs", declareResearchCapability({ name: "docs", principal: agentPrincipal.id, sources: [{ kind: "local", path: "./docs" }], rationale: "declared research capability", declaredAt: clock.nowIso(), maxItems: 16 })],
  ]);
  const research = new LocalResearchPort({ workspaceDir: ws, host: harness, clock, idGen, blobStore: await import("../../src/store/blob-cas.ts").then((m) => new m.BlobStore(join(ws, ".vaerion", "blobs"))), capabilities, actor: { kind: "research", id: agentPrincipal.id } });
  return { ws, runId, harness, gateway, research, config };
}

describe("agent research integration (One Context Path + citation enforcement)", () => {
  test("context step journals the full evidence trail; pack is fenced and fingerprinted", async () => {
    const { ws, runId, harness, gateway, research } = await makeFixture();
    const runtime = new AgentRuntime({ harness, clock: new FixedClock(T0), idGen: new SeededIdGen(() => T0, new SeededRng(1)), maxSteps: 8, gateway, tools: null, research, actor: agentPrincipal });
    const steps: PlanStep[] = [{ kind: "context", capability: "docs", query: "event spine deterministic" }];
    const result = await runtime.run({
      goal: "gather context",
      principal: agentPrincipal,
      policy: agentPolicy,
      planner: new InlinePlanner({ goal: "gather context", steps }),
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    expect(result.outcome).toBe("goal");
    const recs = (await readJournal(RunHarness.journalPathFor(ws, runId))).records;
    const types = recs.filter((r) => r.k === "evt").map((r) => (r.k === "evt" ? r.env.type : ""));
    // The One Context Path, journaled end to end:
    expect(types).toContain("research.source.fetched");
    expect(types).toContain("store.blob.put");
    expect(types).toContain("research.evidence.recorded");
    expect(types).toContain("research.index.updated");
    expect(types).toContain("research.context.prepared");
    const packEvent = recs.find((r) => r.k === "evt" && r.env.type === "research.context.prepared") as Extract<JournalRecord, { k: "evt" }>;
    expect(typeof packEvent.env.payload.pack_fingerprint).toBe("string");
    const m = agentMetricsFromRecords(recs);
    expect(m.context.packs).toBe(1);
    const verify = await verifyJournal(RunHarness.journalPathFor(ws, runId));
    expect(verify.ok).toBe(true);
    await harness.release();
  });

  test("undeclared capability in a context step is refused (E1403)", async () => {
    const { ws, runId, harness, gateway, research } = await makeFixture();
    const runtime = new AgentRuntime({ harness, clock: new FixedClock(T0), idGen: new SeededIdGen(() => T0, new SeededRng(2)), maxSteps: 8, gateway, tools: null, research, actor: agentPrincipal });
    const result = await runtime.run({
      goal: "wrong capability",
      principal: agentPrincipal,
      policy: agentPolicy,
      planner: new InlinePlanner({ goal: "wrong capability", steps: [{ kind: "context", capability: "ghost", query: "x" }] }),
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    expect(result.outcome).toBe("failed");
    expect(result.failures).toBe(1);
    const state = agentStateFromRecords(runId, TRACE_ID, (await readJournal(RunHarness.journalPathFor(ws, runId))).records);
    expect(state.failures[0]!.error_code).toBe("E1403");
    await harness.release();
  });

  test("citation enforcement: an answer over prepared context MUST cite it (E1806)", async () => {
    const { ws, runId, harness, gateway, research } = await makeFixture();
    const runtime = new AgentRuntime({ harness, clock: new FixedClock(T0), idGen: new SeededIdGen(() => T0, new SeededRng(3)), maxSteps: 8, gateway, tools: null, research, actor: agentPrincipal });
    // MockBrain echoes the user prompt: without a citation id, the answer step fails.
    const noCitation: PlanStep[] = [
      { kind: "context", capability: "docs", query: "event spine deterministic" },
      { kind: "model", model: "mockbrain/mock-1", requiresCitations: true, seed: 5, messages: [{ role: "user", content: "answer the question" }] },
    ];
    const result = await runtime.run({
      goal: "answer without citations",
      principal: agentPrincipal,
      policy: agentPolicy,
      planner: new InlinePlanner({ goal: "answer without citations", steps: noCitation }),
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    expect(result.outcome).toBe("failed");
    const state = agentStateFromRecords(runId, TRACE_ID, (await readJournal(RunHarness.journalPathFor(ws, runId))).records);
    expect(state.failures.some((f) => f.error_code === "E1806")).toBe(true);
    await harness.release();
  });

  test("a citing answer carries its citations on the journaled step", async () => {
    const { ws, runId, harness, gateway, research } = await makeFixture();
    const runtime = new AgentRuntime({ harness, clock: new FixedClock(T0), idGen: new SeededIdGen(() => T0, new SeededRng(4)), maxSteps: 8, gateway, tools: null, research, actor: agentPrincipal });
    // The prompt embeds cit_0001 within MockBrain's echo window (first 80 chars).
    const withCitation: PlanStep[] = [
      { kind: "context", capability: "docs", query: "event spine deterministic" },
      { kind: "model", model: "mockbrain/mock-1", requiresCitations: true, seed: 6, messages: [{ role: "user", content: "Answer using cit_0001 only." }] },
    ];
    const result = await runtime.run({
      goal: "answer with citations",
      principal: agentPrincipal,
      policy: agentPolicy,
      planner: new InlinePlanner({ goal: "answer with citations", steps: withCitation }),
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    expect(result.outcome).toBe("goal");
    const recs = (await readJournal(RunHarness.journalPathFor(ws, runId))).records;
    const step = recs.find((r) => r.k === "evt" && r.env.type === "agent.step.recorded" && (r as Extract<JournalRecord, { k: "evt" }>).env.payload.kind === "model") as Extract<JournalRecord, { k: "evt" }>;
    expect(Array.isArray(step.env.payload.citations)).toBe(true);
    expect(step.env.payload.citations as string[]).toContain("cit_0001");
    await harness.release();
  });
});
