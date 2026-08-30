/**
 * Vaerion — daemon run registry (MS-5, ADR-0010/ADR-0020).
 *
 * Executes the SAME engine compositions the CLI executes, over the wire:
 * agent runs (AgentRuntime), workflow runs (WorkflowEngine), durable gate
 * answers (RunHarness.resolveGate), continuations (the `vae resume` law).
 *
 * The journal is the truth; this registry is bookkeeping. Two laws shape it:
 *
 * 1. SERIAL EXECUTION per workspace (run queue, submission order): the audit
 *    ledger and the refusal log are single-writer hash chains; concurrent
 *    writers would break them. Concurrency needs a ratified ADR first.
 * 2. GATES SURVIVE THE PROCESS: a run paused on a durable gate RELEASES the
 *    writer lock and leaves the journal open, exactly like the CLI — answer
 *    and continue are separate, explicit human steps.
 */

import { join } from "node:path";
import { mkdir, stat } from "node:fs/promises";
import { VaerionError } from "../kernel/errors.ts";
import type { Clock } from "../kernel/clock.ts";
import { SystemClock, SystemRng } from "../kernel/clock.ts";
import { SystemIdGen, crn, type IdGen } from "../kernel/ids.ts";
import { loadConfig, validateConfig, CONFIG_SCHEMA_VERSION, policyFromConfig, type VaerionConfig } from "../config/config.ts";
import { canonicalJson } from "../kernel/canonical.ts";
import { blake3HexOf } from "../kernel/hash.ts";
import { RunHarness, initialRunState, runStateReducer, type RunState } from "../runtime/run.ts";
import { readJournal, type ReadResult } from "../journal/reader.ts";
import { verifyJournal, type VerifyReport } from "../journal/verify.ts";
import { listJournals, RUN_ID_RE } from "../journal/ls.ts";
import { replayRecords } from "../journal/replay.ts";
import type { JournalRecord } from "../journal/records.ts";
import { BlobStore } from "../store/blob-cas.ts";
import { graphFromConfig } from "../broker/engine.ts";
import type { GateRecord } from "../broker/contracts/gate.ts";
import type { PolicyContract } from "../broker/contracts/decision.ts";
import { GatewayService, GatewayGatePrompt, type BudgetGuard } from "../gateway/service.ts";
import { fetchTransport } from "../gateway/transport.ts";
import { defaultSecretPort } from "../gateway/secrets.ts";
import { PRICE_TABLE, type ModelPrice } from "../gateway/pricing.ts";
import { parseModelId, type ModelOp } from "../gateway/types.ts";
import { ToolRegistry, ToolInvocationService, echoTool, clockReadTool, ToolGatePrompt, type ToolExecutor } from "../agents/tools.ts";
import { AgentRuntime, agentStateFromRecords, type AgentRunState } from "../agents/runtime.ts";
import { agentMetricsFromRecords, type AgentMetrics } from "../agents/metrics.ts";
import { InlinePlanner, ModelPlanner, type Planner, type PlanStep } from "../agents/planner.ts";
import { LocalResearchPort } from "../agents/research-port.ts";
import { declareResearchCapability, type ResearchCapabilityDeclaration } from "../research/capability.ts";
import { WorkflowEngine, workflowStateFromRecords, type WorkflowDag, type WorkflowState } from "../workflow/engine.ts";
import { assertWorkflowDag } from "../workflow/dag.ts";
import { agentGrants } from "../agents/grants.ts";
import { redactDeep } from "../kernel/redact.ts";

/* ── workspace helpers (mirrored from the surface contract; api/ never imports cli/) ── */

interface DaemonWorkspace {
  root: string;
  journalDir: string;
  blobsDir: string;
  configPath: string;
}

function workspaceAt(root: string): DaemonWorkspace {
  const vaerionDir = join(root, ".vaerion");
  return {
    root: join(root),
    journalDir: join(vaerionDir, "journal"),
    blobsDir: join(vaerionDir, "blobs"),
    configPath: join(root, "vaerion.yaml"),
  };
}

async function loadWorkspaceConfig(ws: DaemonWorkspace): Promise<{ config: VaerionConfig; fingerprint: string; adhoc: boolean }> {
  const exists = await stat(ws.configPath).then(() => true, () => false);
  if (!exists) {
    const adhoc = validateConfig({ schemaVersion: CONFIG_SCHEMA_VERSION, project: { name: "adhoc" }, telemetry: { enabled: false } });
    return { config: adhoc, fingerprint: await blake3HexOf(canonicalJson(adhoc)), adhoc: true };
  }
  const loaded = await loadConfig(ws.configPath);
  return { config: loaded.config, fingerprint: loaded.fingerprint, adhoc: false };
}

/* ── shared service composition (the same calls the CLI makes) ── */

interface AgentServices {
  gateway: GatewayService;
  registry: ToolRegistry;
  tools: ToolInvocationService;
}

function agentServices(config: VaerionConfig, clock: SystemClock, idGen: SystemIdGen, blobsDir: string): AgentServices {
  const gateway = new GatewayService({
    clock,
    rng: new SystemRng(),
    idGen,
    transport: fetchTransport,
    secrets: defaultSecretPort(),
  });
  const registry = ToolRegistry.fromConfig(config.tools ?? []);
  const executors = new Map<string, ToolExecutor>([
    ["echo", echoTool],
    ["clock.read", clockReadTool],
  ]);
  const tools = new ToolInvocationService({ clock, idGen, registry, executors, blobStore: new BlobStore(blobsDir) });
  return { gateway, registry, tools };
}

/* ── types ── */

export interface StartAgentInput {
  kind: "agent";
  goal: string;
  planner?: "inline" | "model";
  steps?: PlanStep[];
  maxSteps?: number;
}

export interface StartWorkflowInput {
  kind: "workflow";
  dag: WorkflowDag;
}

export type StartRunInput = StartAgentInput | StartWorkflowInput;

export interface RunStarted {
  run_id: string;
  trace_id: string;
  kind: "agent" | "workflow";
}

interface RegistryEntry {
  kind: "agent" | "workflow";
  traceId: string;
  /** Set when the background task failed before/while journaling — the journal remains the truth. */
  startError?: string;
}

export interface RunStatusView {
  run_id: string;
  kind: "agent" | "workflow" | "unknown";
  status: RunState["status"];
  journal_ok: boolean;
  trace_id: string | null;
  decisions: RunState["decisions"];
  open_gates: GateRecord[];
  resolved_gates: number;
  last_seq: number;
  events_seen: number;
  receipt: unknown | null;
  agent: AgentRunState | null;
  workflow: WorkflowState | null;
  metrics: AgentMetrics | null;
  note?: string;
}

export interface RunSummary {
  run_id: string;
  status: RunState["status"];
  closed: boolean;
  last_seq: number;
}

/* ── the registry ── */

export class RunRegistry {
  private readonly ws: DaemonWorkspace;
  private readonly clock: Clock;
  private readonly idGen: IdGen;
  private readonly entries = new Map<string, RegistryEntry>();
  /** Serial execution chain: the audit ledger + refusal log are single-writer chains. */
  private queueTail: Promise<void> = Promise.resolve();
  private inflight = new Set<string>();
  private stopped = false;

  constructor(opts: { workspaceDir: string; clock?: Clock; idGen?: IdGen }) {
    this.ws = workspaceAt(opts.workspaceDir);
    this.clock = opts.clock ?? new SystemClock();
    this.idGen = opts.idGen ?? new SystemIdGen();
  }

  /** Serialize a writer operation (harness opens audit/refusal writers). */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queueTail.then(fn, fn);
    this.queueTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async ensureDirs(): Promise<void> {
    await mkdir(this.ws.journalDir, { recursive: true });
    await mkdir(this.ws.blobsDir, { recursive: true });
  }

  /**
   * Read a journal tolerating the tiny torn-tail window while a writer is
   * mid-append: one short retry, then the honest failure (recovery is a
   * `vae journal recover` decision, never automatic here).
   */
  private async readJournalSafe(runId: string): Promise<ReadResult> {
    const path = RunHarness.journalPathFor(this.ws.root, runId);
    try {
      return await readJournal(path);
    } catch (err) {
      if ((err as { code?: string }).code === "E1002") {
        await new Promise<void>((r) => setTimeout(r, 25));
        return readJournal(path);
      }
      throw err;
    }
  }

  private async journalExists(runId: string): Promise<boolean> {
    if (!RUN_ID_RE.test(runId)) return false;
    const list = await listJournals(this.ws.journalDir).catch(() => []);
    return list.some((j) => j.run_id === runId);
  }

  /* ── start ── */

  /** Validate and START a run; execution is queued in submission order. */
  async start(input: StartRunInput): Promise<RunStarted> {
    if (this.stopped) throw new VaerionError("E2005", "the daemon is shutting down; no new runs are accepted");
    await this.ensureDirs();
    const { config, fingerprint } = await loadWorkspaceConfig(this.ws);
    const policy = policyFromConfig(config);

    if (input.kind === "workflow") {
      assertWorkflowDag(input.dag);
      const runId = crn("run", this.idGen.next());
      const traceId = `t_wf_${this.idGen.next().slice(-10).toLowerCase()}`;
      this.entries.set(runId, { kind: "workflow", traceId });
      void this.exclusive(async () => {
        this.inflight.add(runId);
        try {
          await this.executeWorkflow(runId, traceId, input.dag, config, fingerprint, policy);
        } catch (err) {
          const entry = this.entries.get(runId);
          if (entry) entry.startError = (err as Error).message.slice(0, 200);
        } finally {
          this.inflight.delete(runId);
        }
      });
      return { run_id: runId, trace_id: traceId, kind: "workflow" };
    }

    // agent
    const goal = input.goal;
    if (typeof goal !== "string" || goal.length === 0) {
      throw new VaerionError("E1600", "agent runs require a non-empty `goal`");
    }
    const plannerKind = input.planner === "model" ? "model" : "inline";
    if (plannerKind === "inline" && !(Array.isArray(input.steps) && input.steps.length > 0)) {
      throw new VaerionError("E1800", "inline planning requires a non-empty `steps` array (declared plan); use planner:\"model\" for model-backed planning");
    }
    if (input.maxSteps !== undefined && (!Number.isInteger(input.maxSteps) || input.maxSteps <= 0)) {
      throw new VaerionError("E1600", "max_steps must be a positive integer");
    }
    const runId = crn("run", this.idGen.next());
    const traceId = `t_agent_${this.idGen.next().slice(-10).toLowerCase()}`;
    this.entries.set(runId, { kind: "agent", traceId });
    void this.exclusive(async () => {
      this.inflight.add(runId);
      try {
        await this.executeAgent(runId, traceId, input as StartAgentInput, config, fingerprint, policy);
      } catch (err) {
        const entry = this.entries.get(runId);
        if (entry) entry.startError = (err as Error).message.slice(0, 200);
      } finally {
        this.inflight.delete(runId);
      }
    });
    return { run_id: runId, trace_id: traceId, kind: "agent" };
  }

  /* ── execution (mirrors the CLI composition exactly) ── */

  private async executeAgent(
    runId: string,
    traceId: string,
    input: StartAgentInput,
    config: VaerionConfig,
    configFingerprint: string,
    policy: PolicyContract,
  ): Promise<void> {
    const clock = new SystemClock();
    const idGen = new SystemIdGen();
    const { gateway, registry, tools } = agentServices(config, clock, idGen, this.ws.blobsDir);
    const principal = { kind: "agent" as const, id: `agent:${runId.slice(-8).toLowerCase()}` };
    const graph = graphFromConfig(config, `graph_${configFingerprint.slice(0, 12)}`, agentGrants(config, policy, principal));
    const harness = await RunHarness.create({ workspaceDir: this.ws.root, runId, traceId, configFingerprint, clock, idGen, permissionGraph: graph });

    // Declared research capabilities power `context` steps through the ONE
    // context path (same wiring the CLI performs).
    const capabilities = new Map<string, ResearchCapabilityDeclaration>();
    for (const cap of config.research?.capabilities ?? []) {
      capabilities.set(
        cap.name,
        declareResearchCapability({
          name: cap.name,
          principal: principal.id,
          sources: cap.sources.map((s) => ({ kind: "local" as const, path: s.path })),
          rationale: "declared in vaerion.yaml research.capabilities",
          declaredAt: clock.nowIso(),
          maxItems: cap.maxItems ?? 16,
        }),
      );
    }
    const research = capabilities.size > 0
      ? new LocalResearchPort({ workspaceDir: this.ws.root, host: harness, clock, idGen, blobStore: new BlobStore(this.ws.blobsDir), capabilities, actor: { kind: "research", id: principal.id } })
      : null;

    const maxSteps = input.maxSteps ?? config.agents?.maxSteps ?? 24;
    let planner: Planner;
    if (input.planner === "model") {
      planner = new ModelPlanner({
        host: harness,
        gateway,
        model: config.agents?.plannerModel ?? "mockbrain/mock-1",
        principal,
        policy,
        requestId: () => idGen.next(),
        budget: (): BudgetGuard => {
          const b = config.gateway?.budgets;
          return { tokensUsed: 0, microUsdUsed: 0, tokensPerRun: b?.tokensPerRun, microUsdPerRun: b?.microUsdPerRun };
        },
      });
    } else {
      planner = new InlinePlanner({ goal: input.goal, steps: input.steps ?? [] });
    }

    const runtime = new AgentRuntime({ harness, clock, idGen, maxSteps, gateway, tools, research, actor: principal });
    const budget: BudgetGuard = { tokensUsed: 0, microUsdUsed: 0, tokensPerRun: config.gateway?.budgets?.tokensPerRun, microUsdPerRun: config.gateway?.budgets?.microUsdPerRun };
    try {
      const result = await runtime.run({ goal: input.goal, principal, policy, planner, budget });
      if (result.outcome === "awaiting_gate") {
        // The gate must survive process death: release the lock, never seal.
        await harness.release();
        return;
      }
      await harness.close(`agent run ${runId}: ${result.outcome} after ${result.steps} step(s) (${result.failures} failure(s), ${result.tokensUsed} tokens, ${result.microUsdUsed} µUSD)`);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "E1300" || code === "E1301") {
        await harness.close(`agent run ${runId} denied by broker (${code})`).catch(() => undefined);
      } else {
        await harness.close(`agent run ${runId} failed: ${(err as Error).message.slice(0, 120)}`).catch(() => undefined);
      }
      throw err;
    }
  }

  private async executeWorkflow(
    runId: string,
    traceId: string,
    dag: WorkflowDag,
    config: VaerionConfig,
    configFingerprint: string,
    policy: PolicyContract,
  ): Promise<void> {
    const clock = new SystemClock();
    const idGen = new SystemIdGen();
    const principal = { kind: "agent" as const, id: "agent:workflow" };
    const graph = graphFromConfig(config, `graph_${configFingerprint.slice(0, 12)}`, agentGrants(config, policy, principal));
    const harness = await RunHarness.create({ workspaceDir: this.ws.root, runId, traceId, configFingerprint, clock, idGen, permissionGraph: graph });
    const { gateway, tools } = agentServices(config, clock, idGen, this.ws.blobsDir);
    const engine = new WorkflowEngine({ harness, clock, idGen, blobRoot: this.ws.blobsDir, gateway, tools, research: null, actor: { kind: "system", id: "workflow" } });
    try {
      const result = await engine.run({ dag, principal, policy, budget: { tokensUsed: 0, microUsdUsed: 0 } });
      await harness.close(`workflow ${dag.id}: ${result.outcome} (${result.completedNodes.length}/${dag.nodes.length} nodes, ${result.failedNodes.length} failed)`);
    } catch (err) {
      if (err instanceof GatewayGatePrompt || err instanceof ToolGatePrompt) {
        // A gate keeps the journal OPEN (the gate must survive process death).
        await harness.release().catch(() => undefined);
        return;
      }
      await harness.close(`workflow run failed: ${(err as Error).message.slice(0, 120)}`).catch(() => undefined);
      throw err;
    }
  }

  /* ── read-only surfaces ── */

  async list(): Promise<RunSummary[]> {
    const list = await listJournals(this.ws.journalDir).catch(() => []);
    const summaries: RunSummary[] = [];
    for (const item of list) {
      const view = await this.status(item.run_id).catch(() => null);
      if (view === null) continue;
      summaries.push({ run_id: item.run_id, status: view.status, closed: view.status === "closed", last_seq: view.last_seq });
    }
    return summaries;
  }

  async status(runId: string): Promise<RunStatusView> {
    if (!(await this.journalExists(runId))) {
      const entry = this.entries.get(runId);
      if (entry?.startError) {
        throw new VaerionError("E2003", `run ${runId} never journaled a record (failed to start: ${entry.startError})`);
      }
      if (entry) {
        // Accepted but the first journal record has not landed yet (the run
        // is queued or opening its harness). Report honestly — never E2003.
        return {
          run_id: runId,
          kind: entry.kind,
          status: "open",
          journal_ok: true,
          trace_id: entry.traceId,
          decisions: { allow: 0, deny: 0, prompt: 0 },
          open_gates: [],
          resolved_gates: 0,
          last_seq: 0,
          events_seen: 0,
          receipt: null,
          agent: null,
          workflow: null,
          metrics: null,
          note: "run accepted; first journal record pending",
        };
      }
      throw new VaerionError("E2003", `run ${runId} is not known to this workspace`);
    }
    const path = RunHarness.journalPathFor(this.ws.root, runId);
    let verify: VerifyReport;
    let read: ReadResult;
    try {
      verify = await verifyJournal(path);
      read = await this.readJournalSafe(runId);
    } catch (err) {
      // A damaged journal is reported honestly, not hidden.
      const entry = this.entries.get(runId);
      return {
        run_id: runId,
        kind: entry?.kind ?? "unknown",
        status: "open",
        journal_ok: false,
        trace_id: entry?.traceId ?? null,
        decisions: { allow: 0, deny: 0, prompt: 0 },
        open_gates: [],
        resolved_gates: 0,
        last_seq: 0,
        events_seen: 0,
        receipt: null,
        agent: null,
        workflow: null,
        metrics: null,
        note: `journal unreadable: ${(err as Error).message.slice(0, 120)}`,
      };
    }
    const state = replayRecords<RunState>({ records: read.records, reducer: runStateReducer, initial: initialRunState(runId, "daemon") }).state;
    const agentState = agentStateFromRecords(runId, "t", read.records);
    const workflowState = workflowStateFromRecords("?", read.records);
    const entry = this.entries.get(runId);
    const kind = agentState.started ? ("agent" as const) : workflowState.started ? ("workflow" as const) : (entry?.kind ?? "unknown");
    const receiptRec = [...read.records].reverse().find((rec): rec is Extract<JournalRecord, { k: "receipt" }> => rec.k === "receipt");
    const live = this.inflight.has(runId);
    return {
      run_id: runId,
      kind,
      status: state.status === "closed" ? "closed" : live ? "open" : state.status,
      journal_ok: verify.ok,
      trace_id: read.records.find((r) => r.k === "evt") !== undefined ? (read.records.find((r) => r.k === "evt") as Extract<JournalRecord, { k: "evt" }>).env.trace_id : entry?.traceId ?? null,
      decisions: state.decisions,
      open_gates: state.openGates,
      resolved_gates: state.resolvedGates.length,
      last_seq: state.lastSeq,
      events_seen: state.eventsSeen,
      receipt: receiptRec?.receipt ?? null,
      agent: kind === "agent" ? agentState : null,
      workflow: kind === "workflow" ? workflowState : null,
      metrics: kind === "agent" ? agentMetricsFromRecords(read.records) : null,
      note: verify.ok ? undefined : "journal verification FAILED — inspect with `vae journal verify`",
    };
  }

  /* ── human gates ── */

  /** Resolve a pending durable gate (the `vae resume --answer` law). */
  async answer(runId: string, gateId: string, answer: Record<string, unknown>): Promise<{ gate: GateRecord; approved: boolean; receipt: unknown | null }> {
    return this.exclusive(async () => {
      if (!(await this.journalExists(runId))) {
        throw new VaerionError("E2003", `run ${runId} is not known to this workspace`);
      }
      const { fingerprint: configFingerprint } = await loadWorkspaceConfig(this.ws);
      const restored = await RunHarness.restore({
        workspaceDir: this.ws.root,
        runId,
        traceId: `t_resume_${runId.slice(-8).toLowerCase()}`,
        configFingerprint,
        clock: new SystemClock(),
        idGen: new SystemIdGen(),
      });
      const { harness, state } = restored;
      try {
        const gate = state.openGates.find((g) => g.gate_id === gateId);
        if (!gate) {
          const resolvedEarlier = state.resolvedGates.some((g) => g.gate_id === gateId);
          throw new VaerionError(resolvedEarlier ? "E1303" : "E1600", resolvedEarlier ? `gate ${gateId} is already resolved` : `gate ${gateId} is not pending on run ${runId}`);
        }
        const resolved = await harness.resolveGate(gate, answer);
        const approved = (answer as { approved?: unknown }).approved !== false;
        if (!approved) {
          const closed = await harness.close(`gate ${gateId} denied by human`);
          return { gate: resolved, approved: false, receipt: closed.receipt };
        }
        await harness.release();
        return { gate: resolved, approved: true, receipt: null };
      } finally {
        await harness.release();
      }
    });
  }

  /** Continue an approved agent run (or a workflow given its DAG). */
  async continueRun(runId: string, dag?: WorkflowDag): Promise<{ accepted: true; kind: "agent" | "workflow" }> {
    if (this.stopped) throw new VaerionError("E2005", "the daemon is shutting down; continuations are not accepted");
    if (!(await this.journalExists(runId))) {
      throw new VaerionError("E2003", `run ${runId} is not known to this workspace`);
    }
    const { config, fingerprint: configFingerprint } = await loadWorkspaceConfig(this.ws);
    const policy = policyFromConfig(config);
    // Foreground: verify the chain and establish what kind of continuation
    // this is (the fold decides; nothing is guessed).
    const probe = await this.readJournalSafe(runId);
    const agentState = agentStateFromRecords(runId, "t", probe.records);
    const workflowState = workflowStateFromRecords("?", probe.records);
    if (!agentState.started && !workflowState.started) {
      throw new VaerionError("E1600", `run ${runId} is neither an agent nor a workflow run`);
    }
    if (agentState.started) {
      if (agentState.completed && agentState.outcome !== "awaiting_gate") {
        throw new VaerionError("E1600", `agent run ${runId} already completed (${agentState.outcome})`);
      }
      const kind = "agent" as const;
      void this.exclusive(async () => {
        this.inflight.add(runId);
        try {
          await this.continueAgent(runId, config, configFingerprint, policy);
        } catch (err) {
          const entry = this.entries.get(runId);
          if (entry) entry.startError = (err as Error).message.slice(0, 200);
        } finally {
          this.inflight.delete(runId);
        }
      });
      return { accepted: true, kind };
    }
    if (!dag) {
      throw new VaerionError("E1600", "workflow continuation requires the original DAG in the body (the journal does not embed the caller's DAG file)");
    }
    assertWorkflowDag(dag);
    const kind = "workflow" as const;
    void this.exclusive(async () => {
      this.inflight.add(runId);
      try {
        await this.continueWorkflow(runId, dag, config, configFingerprint, policy);
      } catch (err) {
        const entry = this.entries.get(runId);
        if (entry) entry.startError = (err as Error).message.slice(0, 200);
      } finally {
        this.inflight.delete(runId);
      }
    });
    return { accepted: true, kind };
  }

  private async continueAgent(runId: string, config: VaerionConfig, configFingerprint: string, policy: PolicyContract): Promise<void> {
    const resumeClock = new SystemClock();
    const resumeIdGen = new SystemIdGen();
    const restored = await RunHarness.restore({
      workspaceDir: this.ws.root,
      runId,
      traceId: `t_resume_${runId.slice(-8).toLowerCase()}`,
      configFingerprint,
      clock: resumeClock,
      idGen: resumeIdGen,
    });
    const { harness, read } = restored;
    try {
      const agentState = agentStateFromRecords(runId, "t", read.records);
      const { gateway, tools } = agentServices(config, resumeClock, resumeIdGen, this.ws.blobsDir);
      // Elevation law: the approved gate is authority for the SAME principal
      // (agent:<run-id-suffix>) — the run continues as the identity that
      // asked, never a synthetic one that would not match the elevation.
      const samePrincipal = { kind: "agent" as const, id: `agent:${runId.slice(-8).toLowerCase()}` };
      const runtime = new AgentRuntime({
        harness,
        clock: resumeClock,
        idGen: resumeIdGen,
        maxSteps: config.agents?.maxSteps ?? 24,
        gateway,
        tools,
        research: null,
        actor: samePrincipal,
      });
      const goal = agentState.goal ?? "(resumed agent run)";
      const planner = new InlinePlanner({ goal, steps: [] });
      const result = await runtime.run(
        {
          goal,
          principal: samePrincipal,
          policy,
          planner,
          budget: { tokensUsed: 0, microUsdUsed: 0, tokensPerRun: config.gateway?.budgets?.tokensPerRun, microUsdPerRun: config.gateway?.budgets?.microUsdPerRun },
        },
        agentState,
      );
      if (result.outcome === "awaiting_gate") {
        await harness.release();
        return;
      }
      await harness.close(`agent run ${runId} resumed: ${result.outcome} after ${result.steps} step(s)`);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "E1300" || code === "E1301") {
        await harness.close(`agent run ${runId} denied by broker on resume (${code})`).catch(() => undefined);
      } else {
        await harness.close(`agent run ${runId} resume failed: ${(err as Error).message.slice(0, 120)}`).catch(() => undefined);
      }
      throw err;
    }
  }

  private async continueWorkflow(runId: string, dag: WorkflowDag, config: VaerionConfig, configFingerprint: string, policy: PolicyContract): Promise<void> {
    const clock = new SystemClock();
    const idGen = new SystemIdGen();
    const resumed = await WorkflowEngine.resume({
      workspaceDir: this.ws.root,
      runId,
      configFingerprint,
      clock,
      idGen,
      engine: { clock, idGen, blobRoot: this.ws.blobsDir, gateway: null, tools: null, research: null, actor: { kind: "system", id: "workflow" } },
    });
    try {
      const result = await resumed.engine.run({ dag, principal: { kind: "agent", id: "agent:workflow" }, policy, budget: { tokensUsed: 0, microUsdUsed: 0 } }, { resumeState: resumed.state });
      await resumed.harness.close(`workflow ${dag.id} resumed: ${result.outcome} (${result.completedNodes.length}/${dag.nodes.length} nodes)`);
    } catch (err) {
      if (err instanceof GatewayGatePrompt || err instanceof ToolGatePrompt) {
        await resumed.harness.release().catch(() => undefined);
        return;
      }
      await resumed.harness.close(`workflow resume failed: ${(err as Error).message.slice(0, 120)}`).catch(() => undefined);
      throw err;
    }
  }

  /* ── cancellation ── */

  /** Cancel a paused/interrupted run; in-flight runs are refused honestly. */
  async cancel(runId: string): Promise<{ cancelled: true; receipt: unknown }> {
    return this.exclusive(async () => {
      if (this.inflight.has(runId)) {
        throw new VaerionError("E2005", "the run is executing; in-flight cancellation is not supported — the supervisor loop is the only authority between steps");
      }
      if (!(await this.journalExists(runId))) {
        throw new VaerionError("E2003", `run ${runId} is not known to this workspace`);
      }
      const path = RunHarness.journalPathFor(this.ws.root, runId);
      const read = await this.readJournalSafe(runId);
      const state = replayRecords<RunState>({ records: read.records, reducer: runStateReducer, initial: initialRunState(runId, "daemon") }).state;
      if (state.status === "closed") {
        throw new VaerionError("E1600", `run ${runId} is already closed; cancellation is meaningless`);
      }
      const { fingerprint: configFingerprint } = await loadWorkspaceConfig(this.ws);
      const restored = await RunHarness.restore({
        workspaceDir: this.ws.root,
        runId,
        traceId: `t_cancel_${runId.slice(-8).toLowerCase()}`,
        configFingerprint,
        clock: new SystemClock(),
        idGen: new SystemIdGen(),
      });
      const { harness } = restored;
      try {
        // Awaiting gates: the human refuses every open gate (explicit denial
        // on the journal — never a silent abandonment), then the run seals.
        for (const gate of state.openGates) {
          await harness.resolveGate(gate, { approved: false, reason: "cancelled by operator" });
        }
        const closed = await harness.close(`run ${runId} cancelled by operator`);
        return { cancelled: true, receipt: closed.receipt };
      } finally {
        await harness.release();
      }
    });
  }

  /* ── events (read-only; SSE streams these) ── */

  /** Journaled event envelopes for one run with seq strictly after `cursor`. */
  async eventsSince(runId: string, cursor: number): Promise<Array<Record<string, unknown>>> {
    if (!(await this.journalExists(runId))) {
      throw new VaerionError("E2003", `run ${runId} is not known to this workspace`);
    }
    const read = await this.readJournalSafe(runId);
    return read.records
      .filter((rec): rec is Extract<JournalRecord, { k: "evt" }> => rec.k === "evt")
      .filter((rec) => rec.env.seq > cursor)
      .map((rec) => redactDeep(rec.env as unknown as Record<string, unknown>) as Record<string, unknown>);
  }

  /** Is the run sealed (a receipt exists on the journal)? */
  async isClosed(runId: string): Promise<boolean> {
    const read = await this.readJournalSafe(runId);
    return read.records.some((rec) => rec.k === "receipt");
  }

  /**
   * Merged workspace tail ordered by (ts, run_id, seq) — deterministic for a
   * fixed set of journals. Ordinals are positions in this merged order;
   * `after` excludes the first `after` events.
   */
  async workspaceEvents(opts: { after?: number; types?: string[]; limit?: number }): Promise<{ events: Array<Record<string, unknown>>; total: number }> {
    const list = await listJournals(this.ws.journalDir).catch(() => []);
    const merged: Array<{ env: Record<string, unknown>; runId: string; ts: string; seq: number }> = [];
    for (const item of list) {
      const read = await this.readJournalSafe(item.run_id).catch(() => null);
      if (read === null) continue;
      for (const rec of read.records) {
        if (rec.k !== "evt") continue;
        merged.push({ env: redactDeep(rec.env as unknown as Record<string, unknown>) as Record<string, unknown>, runId: item.run_id, ts: rec.env.ts, seq: rec.env.seq });
      }
    }
    merged.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : a.seq - b.seq));
    const after = Math.max(0, opts.after ?? 0);
    const sliced = merged.slice(after);
    const filtered = opts.types && opts.types.length > 0 ? sliced.filter((e) => opts.types!.includes(String((e.env as { type?: string }).type))) : sliced;
    const limit = opts.limit ?? 200;
    return { events: filtered.slice(0, limit).map((e) => e.env), total: merged.length };
  }

  /* ── capability surfaces ── */

  async models(): Promise<Array<{ provider: string; ops: string[]; requiresSecret: boolean; secretName: string | null }>> {
    const { config } = await loadWorkspaceConfig(this.ws);
    const clock = new SystemClock();
    const idGen = new SystemIdGen();
    const gateway = new GatewayService({ clock, rng: new SystemRng(), idGen, transport: fetchTransport, secrets: defaultSecretPort() });
    void config;
    return gateway.matrix();
  }

  async model(logical: string): Promise<{ logical: string; provider: string; model: string; ops: string[]; requiresSecret: boolean; secretName: string | null; prices: ModelPrice[] }> {
    const matrix = await this.models();
    const parsed = parseModelId(logical);
    const provider = matrix.find((m) => m.provider === parsed.provider);
    if (!provider) {
      throw new VaerionError("E1600", `unknown model: ${logical} (provider ${parsed.provider} is not declared)`);
    }
    void parsed;
    const prices = PRICE_TABLE.filter((p) => p.key === logical);
    return {
      logical,
      provider: provider.provider,
      model: logical,
      ops: [...provider.ops],
      requiresSecret: provider.requiresSecret,
      secretName: provider.secretName,
      prices,
    };
  }

  async tools(): Promise<Array<{ name: string; scope: string; description: string | null; builtin: boolean }>> {
    const { config } = await loadWorkspaceConfig(this.ws);
    const declared = (config.tools ?? []).map((d) => ({ name: d.name, scope: d.scope ?? d.name, description: d.description ?? null, builtin: false }));
    const builtins = [
      { name: "echo", scope: "echo", description: "deterministic echo (builtin)", builtin: true },
      { name: "clock.read", scope: "clock.read", description: "reads the injected clock port (builtin)", builtin: true },
    ];
    const seen = new Set(declared.map((d) => d.name));
    return [...declared, ...builtins.filter((b) => !seen.has(b.name))];
  }

  /* ── shutdown ── */

  /** Resolve when every queued/in-flight run has settled (bounded by the caller). */
  async idle(): Promise<void> {
    await this.queueTail;
  }

  markStopped(): void {
    this.stopped = true;
  }

  get isStopped(): boolean {
    return this.stopped;
  }
}
