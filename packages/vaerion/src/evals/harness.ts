/**
 * Vaerion — the hermetic evaluation harness (MS-4, ADR-0012).
 *
 * Evals answer one question with measured evidence: does the agent still do
 * exactly what it did before? Everything is hermetic by construction:
 *
 *   - Scenarios run REAL agent runs in a REAL workspace — InlinePlanner
 *     (declared steps), builtin deterministic tools, MockBrain when a
 *     scenario declares model steps — so the journals are genuine.
 *   - The transcript is the run's spine: ordered (type, payload) pairs with
 *     volatile fields normalized away. Its blake3 hash is the golden anchor.
 *   - Regression scoring is deterministic checking against declared
 *     expectations (outcome, step counts, tools used, citations present,
 *     minimum model invocations).
 *   - Replay comparison re-verifies the chain and re-folds the state twice —
 *     the fold must be identical, and re-running the scenario must yield the
 *     identical transcript hash (seeded determinism, byte-stable).
 *   - Golden governance matches the golden fixtures law: VAE_BLESS=1
 *     re-blesses, anything else compares (E1805 on drift).
 *
 * No network. No wall clock. No randomness. The same suite is the CI gate.
 */

import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { blake3HexOf } from "../kernel/hash.ts";
import { canonicalJson } from "../kernel/canonical.ts";
import { VaerionError } from "../kernel/errors.ts";
import { FixedClock, SeededRng } from "../kernel/clock.ts";
import { SeededIdGen } from "../kernel/ids.ts";
import { RunHarness } from "../runtime/run.ts";
import { verifyJournal, type VerifyReport } from "../journal/verify.ts";
import { readJournal } from "../journal/reader.ts";
import { replayRecords } from "../journal/replay.ts";
import { graphFromConfig } from "../broker/engine.ts";
import { validateConfig, policyFromConfig, type VaerionConfig } from "../config/config.ts";
import { GatewayService } from "../gateway/service.ts";
import { mockBrainAdapter } from "../gateway/mockbrain.ts";
import { cassetteTransport } from "../gateway/cassette.ts";
import { ToolRegistry, ToolInvocationService, echoTool, clockReadTool, type ToolExecutor } from "../agents/tools.ts";
import type { PolicyContract, PolicyRule } from "../broker/contracts/decision.ts";
import { InlinePlanner, type PlanStep } from "../agents/planner.ts";
import { AgentRuntime, agentStateFromRecords, type AgentRunResult } from "../agents/runtime.ts";
import { agentMetricsFromRecords, type AgentMetrics } from "../agents/metrics.ts";
import { agentGrants } from "../agents/grants.ts";

export interface EvalExpectation {
  outcome: "goal" | "failed" | "step_limit";
  minSteps?: number;
  maxSteps?: number;
  /** Tool names that must appear in completed tool calls. */
  toolsUsed?: string[];
  /** When the scenario prepares research context, answers must cite it. */
  citationsRequired?: boolean;
  minModelInvocations?: number;
  /** Journals must verify (always checked; declarable for clarity). */
  journalVerified?: boolean;
}

export interface EvalScenario {
  id: string;
  goal: string;
  /** Declared plan steps (InlinePlanner — the hermetic determinism device). */
  steps: PlanStep[];
  /** Tools the scenario's registry declares (executors: builtins or custom). */
  tools?: Array<{ name: string; scope?: string; executor: ToolExecutor }>;
  seed?: number;
  /** Agent step ceiling for the run (default 24). */
  maxSteps?: number;
  expect: EvalExpectation;
}

export interface TranscriptEntry {
  type: string;
  payload: Record<string, unknown>;
}

export interface EvalCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface EvalScenarioResult {
  id: string;
  ok: boolean;
  outcome: AgentRunResult["outcome"];
  checks: EvalCheck[];
  transcriptHash: string;
  replayHash: string;
  journalVerified: boolean;
  metrics: AgentMetrics;
}

export interface EvalReport {
  suite: string;
  allPassed: boolean;
  scenarios: EvalScenarioResult[];
  totals: { scenarios: number; passed: number; failed: number };
  reportHash: string;
}

/** Volatile payload fields normalized away for transcript stability (deep). */
const VOLATILE = new Set(["run_id", "trace_id", "decision_id", "gate_id", "span_id", "ts", "seq", "latency_ms", "request_id", "evidence_id", "recorded_at"]);

/** Build the normalized transcript from journal records (deterministic). */
export function transcriptOf(records: ReadonlyArray<import("../journal/records.ts").JournalRecord>): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (const rec of records) {
    if (rec.k === "evt") {
      entries.push({ type: rec.env.type, payload: stripVolatile(rec.env.payload) });
    } else if (rec.k === "decision") {
      entries.push({ type: "decision", payload: { domain: rec.decision.domain, scope: rec.decision.scope, kind: rec.decision.decision.kind, policy: rec.decision.decision.policy } });
    } else if (rec.k === "gate") {
      entries.push({ type: "gate", payload: { state: rec.gate.state } });
    } else if (rec.k === "receipt") {
      entries.push({ type: "receipt", payload: { summary: rec.receipt.summary } });
    }
  }
  return entries;
}

function stripVolatile(value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (VOLATILE.has(k)) continue;
    if (v === null || typeof v !== "object") {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) => (item !== null && typeof item === "object" ? stripVolatile(item) : item));
    } else {
      out[k] = stripVolatile(v);
    }
  }
  return out;
}

export interface EvalHarnessOptions {
  /** Directory for run workspaces (one subdirectory per scenario). */
  workRoot: string;
  /** Config template (gateway providers, tools, policy rules). */
  config: VaerionConfig;
  /** Suite name for the report + golden fixture naming. */
  suite: string;
}

export class EvalHarness {
  private readonly opts: EvalHarnessOptions;
  /** Distinct, deterministic run identity per scenario execution. */
  private runCounter = 0;

  constructor(opts: EvalHarnessOptions) {
    this.opts = opts;
  }

  /**
   * Run one scenario as a REAL agent run and score it. Deterministic:
   * fixed clock, seeded ids, seeded MockBrain, declared plan.
   */
  async runScenario(scenario: EvalScenario): Promise<EvalScenarioResult> {
    const seed = scenario.seed ?? 42;
    const runNo = this.runCounter++;
    const T0 = 1735689600000;
    const clock = new FixedClock(T0);
    // Deterministic AND distinct: the counter offsets the seed so two runs of
    // the same scenario never collide on run ids (a seeded idGen with an
    // identical seed would otherwise resume the PREVIOUS run's journal).
    const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(seed + runNo * 7919));
    const runId = `crn_run_${idGen.next()}`;
    const traceId = `t_eval_${scenario.id}`;
    const ws = join(this.opts.workRoot, scenario.id);
    await mkdir(join(ws, ".vaerion"), { recursive: true });

    const config = validateConfig({ ...this.opts.config, project: { ...this.opts.config.project, name: scenario.id.replace(/[^a-z0-9-]/gi, "-").slice(0, 62) || "eval-scenario" } } as unknown as VaerionConfig);
    const scenarioPrincipal = { kind: "agent" as const, id: `agent:${scenario.id}` };
    const basePolicy = policyFromConfig(config);
    // Scenario tools are declared by the suite (the suite author is the
    // human authority here): their scopes join the agent's ceiling grants
    // AND get an explicit policy rule, so the broker can lawfully allow them.
    const scenarioToolScopes = (scenario.tools ?? []).map((t) => t.scope ?? t.name);
    const evalPolicy: PolicyContract = {
      ...basePolicy,
      rules: [
        ...basePolicy.rules,
        ...scenarioToolScopes.map((s): PolicyRule => ({ id: `eval-tool-${s.replace(/[^a-z0-9.-]/gi, "_")}`, principalKinds: ["agent"], domain: "tool.call", scope: s, effect: "allow", rationale: "declared by the eval scenario (suite author authority)" })),
      ],
    };
    const grants = agentGrants(config, evalPolicy, scenarioPrincipal);
    if (scenarioToolScopes.length > 0) grants.push({ principalId: scenarioPrincipal.id, domain: "tool.call", scopes: scenarioToolScopes });
    const graph = graphFromConfig(config, `graph_eval_${scenario.id}`, grants);
    const harness = await RunHarness.create({
      workspaceDir: ws,
      runId,
      traceId,
      configFingerprint: `cfg_eval_${seed}`,
      clock,
      idGen,
      permissionGraph: graph,
    });

    // Real gateway over MockBrain only (hermetic; cassettes when declared).
    const gateway = new GatewayService({
      clock,
      rng: new SeededRng(seed),
      idGen,
      transport: cassetteTransport([]),
      secrets: { name: "eval-fixed", resolve: () => Promise.resolve(null) },
      adapters: [mockBrainAdapter],
    });
    // Merge declared tools: config declarations + scenario-local tools.
    const scenarioTools = scenario.tools ?? [];
    const mergedDeclarations = [
      ...(config.tools ?? []).map((d) => ({ name: d.name, scope: d.scope ?? d.name, description: d.description ?? null })),
      ...scenarioTools
        .filter((t) => !(config.tools ?? []).some((d) => d.name === t.name))
        .map((t) => ({ name: t.name, scope: t.scope ?? t.name, description: null })),
    ];
    const registry = new ToolRegistry(mergedDeclarations);
    const executors = new Map<string, ToolExecutor>([
      ["echo", echoTool],
      ["clock.read", clockReadTool],
    ]);
    for (const t of scenarioTools) executors.set(t.name, t.executor);
    const tools = new ToolInvocationService({ clock, idGen, registry, executors, blobStore: null });

    const planner = new InlinePlanner({ goal: scenario.goal, steps: scenario.steps });
    const principal = scenarioPrincipal;
    const runtime = new AgentRuntime({
      harness,
      clock,
      idGen,
      maxSteps: scenario.maxSteps ?? 24,
      gateway,
      tools,
      research: null,
      actor: principal,
    });

    let result: AgentRunResult | null = null;
    let runError: Error | null = null;
    try {
      result = await runtime.run({
        goal: scenario.goal,
        principal,
        policy: evalPolicy,
        planner,
        budget: { tokensUsed: 0, microUsdUsed: 0 },
      });
    } catch (err) {
      runError = err as Error;
    } finally {
      await harness.close(`eval scenario ${scenario.id}: ${result?.outcome ?? runError?.message?.slice(0, 80) ?? "unknown"}`).catch(() => undefined);
    }

    const journalPath = RunHarness.journalPathFor(ws, runId);
    const verify = await verifyJournal(journalPath);
    const read = await readJournal(journalPath);
    const transcript = transcriptOf(read.records);
    const transcriptHash = await blake3HexOf(canonicalJson(transcript));
    // Replay comparison: re-fold the agent state twice; folds must agree.
    const fold1 = agentStateFromRecords(runId, traceId, read.records);
    const fold2 = agentStateFromRecords(runId, traceId, read.records);
    const replayHash = await blake3HexOf(canonicalJson({ steps: fold1.completedSteps, history: fold1.history, outcome: fold1.outcome, fold_equal: JSON.stringify(fold1) === JSON.stringify(fold2) }));
    const metrics = agentMetricsFromRecords(read.records);

    const checks = scoreScenario(scenario, { result, runError, verify, metrics, transcript, citationsSeen: citationsIn(transcript) });
    return {
      id: scenario.id,
      ok: checks.every((c) => c.ok),
      outcome: result?.outcome ?? "failed",
      checks,
      transcriptHash,
      replayHash,
      journalVerified: verify.ok,
      metrics,
    };
  }

  /** Run the full suite and produce the regression report. */
  async runSuite(scenarios: EvalScenario[]): Promise<EvalReport> {
    const results: EvalScenarioResult[] = [];
    for (const scenario of scenarios) {
      results.push(await this.runScenario(scenario));
    }
    const passed = results.filter((r) => r.ok).length;
    const report: EvalReport = {
      suite: this.opts.suite,
      allPassed: passed === results.length,
      scenarios: results,
      totals: { scenarios: results.length, passed, failed: results.length - passed },
      reportHash: "",
    };
    report.reportHash = await blake3HexOf(canonicalJson({ suite: report.suite, totals: report.totals, scenarios: report.scenarios }));
    return report;
  }

  /**
   * Golden governance: compare the report hash against the blessed fixture;
   * VAE_BLESS=1 re-blesses (the only bless path, matching the fixtures law).
   */
  async compareGolden(report: EvalReport): Promise<{ ok: boolean; blessed: boolean; goldenPath: string; detail: string }> {
    const goldenPath = join(this.opts.workRoot, "..", "fixtures", "golden", `eval-${this.opts.suite}.golden.json`);
    const existing = await readFile(goldenPath, "utf8").catch(() => null);
    if (existing === null) {
      if (process.env.VAE_BLESS === "1") {
        await mkdir(join(this.opts.workRoot, "..", "fixtures", "golden"), { recursive: true });
        await writeFile(goldenPath, JSON.stringify({ suite: report.suite, reportHash: report.reportHash }, null, 2) + "\n");
        return { ok: true, blessed: true, goldenPath, detail: "blessed new golden" };
      }
      return { ok: false, blessed: false, goldenPath, detail: "no golden fixture yet (run with VAE_BLESS=1 to bless)" };
    }
    const golden = JSON.parse(existing) as { suite: string; reportHash: string };
    if (golden.reportHash === report.reportHash) {
      return { ok: true, blessed: false, goldenPath, detail: "matches blessed golden" };
    }
    if (process.env.VAE_BLESS === "1") {
      await writeFile(goldenPath, JSON.stringify({ suite: report.suite, reportHash: report.reportHash }, null, 2) + "\n");
      return { ok: true, blessed: true, goldenPath, detail: "re-blessed golden (review the diff)" };
    }
    throw new VaerionError("E1805", `eval report hash differs from blessed golden for suite "${this.opts.suite}"`, { expected: golden.reportHash, actual: report.reportHash });
  }
}

function citationsIn(transcript: TranscriptEntry[]): string[] {
  const ids = new Set<string>();
  for (const entry of transcript) {
    const p = entry.payload as Record<string, unknown>;
    if (entry.type === "agent.step.recorded" && Array.isArray(p.citations)) {
      for (const c of p.citations as unknown[]) ids.add(String(c));
    }
    if (entry.type === "research.context.prepared") ids.add("context");
  }
  return [...ids];
}

function scoreScenario(
  scenario: EvalScenario,
  ctx: {
    result: AgentRunResult | null;
    runError: Error | null;
    verify: VerifyReport;
    metrics: AgentMetrics;
    transcript: TranscriptEntry[];
    citationsSeen: string[];
  },
): EvalCheck[] {
  const checks: EvalCheck[] = [];
  const push = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
  };

  push(
    "outcome",
    ctx.result?.outcome === scenario.expect.outcome || (scenario.expect.outcome === "failed" && ctx.runError !== null),
    `expected ${scenario.expect.outcome}, got ${ctx.result?.outcome ?? (ctx.runError !== null ? `throw(${ctx.runError.message.slice(0, 60)})` : "none")}`,
  );
  if (scenario.expect.minSteps !== undefined) {
    push("minSteps", (ctx.result?.steps ?? 0) >= scenario.expect.minSteps, `expected >= ${scenario.expect.minSteps}, got ${ctx.result?.steps ?? 0}`);
  }
  if (scenario.expect.maxSteps !== undefined) {
    push("maxSteps", (ctx.result?.steps ?? 0) <= scenario.expect.maxSteps, `expected <= ${scenario.expect.maxSteps}, got ${ctx.result?.steps ?? 0}`);
  }
  if (scenario.expect.toolsUsed !== undefined) {
    const used = new Set(ctx.transcript.filter((t) => t.type === "tool.call.completed").map((t) => String((t.payload as Record<string, unknown>).tool)));
    for (const tool of scenario.expect.toolsUsed) {
      push(`tool:${tool}`, used.has(tool), used.has(tool) ? "completed" : "not completed");
    }
  }
  if (scenario.expect.minModelInvocations !== undefined) {
    push("modelInvocations", ctx.metrics.model.invocations >= scenario.expect.minModelInvocations, `expected >= ${scenario.expect.minModelInvocations}, got ${ctx.metrics.model.invocations}`);
  }
  if (scenario.expect.citationsRequired === true) {
    push("citations", ctx.citationsSeen.some((c) => c.startsWith("cit_")), ctx.citationsSeen.length > 0 ? `citations: ${ctx.citationsSeen.join(",")}` : "no citations referenced");
  }
  push("journalVerified", ctx.verify.ok, ctx.verify.ok ? "chain green" : `chain broken: ${ctx.verify.issues.length} issue(s)`);
  return checks;
}
