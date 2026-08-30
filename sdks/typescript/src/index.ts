/**
 * @vaerion/sdk — TypeScript SDK (MS-1 preparation surface).
 *
 * Machine parity law (Sacred Invariant #7): the SDK exercises the SAME
 * contracts the CLI does — same engine calls, same envelopes, same receipts.
 * It is a projection of the engine, never a second implementation.
 *
 * Transport note: in MS-1 the client binds in-process. The daemon transport
 * (loopback HTTP/SSE, ADR-0010) lands with MS-5 and will implement the same
 * interface, so consumers do not change.
 */

import {
  runCli,
  RunHarness,
  verifyJournal,
  readJournal,
  listJournals,
  exportRedacted,
  BlobStore,
  initialRunState,
  runStateReducer,
  replayRecords,
  verifyRefusalLog,
  readRefusals,
  verifyEvidenceSet,
  verifyAuditLedger,
  graphFromConfig,
  GatewayService,
  meteringFromRecords,
  AgentRuntime,
  agentStateFromRecords,
  agentMetricsFromRecords,
  InlinePlanner,
  ToolRegistry,
  ToolInvocationService,
  echoTool,
  clockReadTool,
  agentGrants,
  WorkflowEngine,
  assertWorkflowDag,
  SystemClock,
  SystemRng,
  SystemIdGen,
  crn,
  policyFromConfig,
  loadConfig,
  fetchTransport,
  defaultSecretPort,
  formatMicroUsd,
  type RunState,
  type JournalRecord,
  type VerifyReport,
  type JournalListItem,
  type ExportReport,
  type BlobRef,
  type RefusalEntry,
  type RefusalVerifyReport,
  type EvidenceVerificationReport,
  type EvidenceRecord,
  type AuditVerifyReport,
  type GatewayMeteringRollup,
  type ModelRequest,
  type InvocationResult,
  type GatewayTransport,
  type SecretPort,
  type VaerionConfig,
  type PlanStep,
  type ToolExecutor,
  type AgentRunResult,
  type AgentMetrics,
  type WorkflowDag,
  type WorkflowRunResult,
} from "@vaerion/engine";

export interface VaeClientOptions {
  /** Workspace root (default: process cwd). */
  cwd?: string;
}

export interface RunResearchInput {
  sources: string[];
  query: string;
  maxDocs?: number;
}

export interface RunResearchResult {
  runId: string;
  traceId: string;
  documents: number;
  hits: Array<{ doc_id: string; score: number }>;
  receipt: unknown;
  journalVerified: boolean;
}

export interface ResumeInput {
  runId: string;
  answer?: Record<string, unknown>;
}

export class VaeClient {
  private readonly cwd: string;

  constructor(opts: VaeClientOptions = {}) {
    this.cwd = opts.cwd ?? process.cwd();
  }

  /** Stability check that mirrors `--json` machine mode (parity anchor). */
  async raw(args: string[]): Promise<{ code: number; lines: Array<Record<string, unknown>> }> {
    const lines: Array<Record<string, unknown>> = [];
    const io = {
      out: (l: string) => {
        try {
          lines.push(JSON.parse(l) as Record<string, unknown>);
        } catch {
          lines.push({ raw: l });
        }
      },
      err: (l: string) => {
        try {
          lines.push(JSON.parse(l) as Record<string, unknown>);
        } catch {
          lines.push({ raw: l });
        }
      },
    };
    const result = await runCli([...args, "--json"], io, this.cwd);
    return { code: result.code, lines };
  }

  async init(name: string): Promise<{ code: number; lines: Array<Record<string, unknown>> }> {
    return this.raw(["init", "--name", name]);
  }

  /**
   * Execute a local research run through the full constitutional pipeline —
   * the same path `vae run research` takes, in-process.
   */
  async runResearch(input: RunResearchInput): Promise<RunResearchResult> {
    const { runCli } = await import("@vaerion/engine");
    const lines: Array<Record<string, unknown>> = [];
    const result = await runCli(
      ["run", "research", "--sources", input.sources.join(","), "--query", input.query, "--max-docs", String(input.maxDocs ?? 8), "--json"],
      { out: (l) => lines.push(JSON.parse(l) as Record<string, unknown>), err: () => undefined },
      this.cwd,
    );
    const payload = lines[lines.length - 1] as
      | { run_id?: string; trace_id?: string; documents?: number; hits_detail?: Array<{ doc_id: string; score: number }>; receipt?: unknown; journal_verified?: boolean }
      | undefined;
    if (result.code !== 0 || !payload?.run_id) {
      throw Object.assign(new Error(`run failed with exit code ${result.code}`), { code: result.code, lines });
    }
    return {
      runId: payload.run_id as string,
      traceId: payload.trace_id as string,
      documents: payload.documents as number,
      hits: payload.hits_detail ?? [],
      receipt: payload.receipt,
      journalVerified: payload.journal_verified === true,
    };
  }

  async journalList(): Promise<JournalListItem[]> {
    return listJournals(`${this.cwd}/.vaerion/journal`);
  }

  async journalVerify(runId: string): Promise<VerifyReport> {
    return verifyJournal(`${this.cwd}/.vaerion/journal/${runId}.ndjson`);
  }

  async journalRecords(runId: string): Promise<JournalRecord[]> {
    return (await readJournal(`${this.cwd}/.vaerion/journal/${runId}.ndjson`)).records;
  }

  async journalExport(runId: string, out?: string): Promise<ExportReport> {
    return exportRedacted({
      sourceJournalPath: `${this.cwd}/.vaerion/journal/${runId}.ndjson`,
      exportPath: out ?? `${this.cwd}/.vaerion/exports/${runId}.redacted.ndjson`,
      runId,
    });
  }

  /** Deterministic restoration of a run's state (no locks held). */
  async restoreState(runId: string, traceId: string): Promise<RunState> {
    const read = await readJournal(`${this.cwd}/.vaerion/journal/${runId}.ndjson`);
    return replayRecords<RunState>({ records: read.records, reducer: runStateReducer, initial: initialRunState(runId, traceId) }).state;
  }

  /** Content-addressed blob access behind blob_refs found in journals. */
  blobs(): BlobStore {
    return new BlobStore(`${this.cwd}/.vaerion/blobs`);
  }

  /** Fetch one blob by ref (typed convenience over the CAS). */
  async openBlob(ref: BlobRef): Promise<Uint8Array> {
    return this.blobs().open(ref);
  }

  /** Machine parity with `vae resume`: pending-gate resolution. */
  async resume(input: ResumeInput): Promise<{ code: number; lines: Array<Record<string, unknown>> }> {
    const args = ["resume", input.runId];
    if (input.answer !== undefined) args.push("--answer", JSON.stringify(input.answer));
    return this.raw(args);
  }

  /* ── MS-2 broker surface (machine parity with explain/doctor) ── */

  /** The workspace's durable Refusal Log, optionally filtered to one run. */
  async refusals(runId?: string): Promise<RefusalEntry[]> {
    return readRefusals(`${this.cwd}/.vaerion/refusals.log`, runId ? { runId } : {});
  }

  /** Refusal-log chain verification (same chain law as journals). */
  async verifyRefusals(): Promise<RefusalVerifyReport> {
    return verifyRefusalLog(`${this.cwd}/.vaerion/refusals.log`);
  }

  /**
   * Evidence triangulation for one run: evidence ↔ blob bytes ↔ fingerprint.
   * Full evidence records only (summary payloads are skipped, never guessed).
   */
  async verifyRunEvidence(runId: string): Promise<EvidenceVerificationReport> {
    const records = await this.journalRecords(runId);
    const evidence: EvidenceRecord[] = [];
    for (const rec of records) {
      if (rec.k !== "evt" || rec.env.type !== "research.evidence.recorded") continue;
      const candidate = (rec.env.payload as Record<string, unknown>).evidence;
      if (candidate && typeof candidate === "object") evidence.push(candidate as EvidenceRecord);
    }
    return verifyEvidenceSet(evidence, this.blobs());
  }

  /** Audit-ledger verification for the workspace (machine parity with doctor). */
  async verifyAudit(): Promise<AuditVerifyReport> {
    return verifyAuditLedger(`${this.cwd}/.vaerion/audit.log`);
  }

  /* ── MS-3 gateway surface (machine parity with `vae run model`) ── */

  /**
   * One model invocation through the gateway SINGLE GATE, in-process: the
   * SAME engine calls the CLI makes — broker decision (model.invoke,
   * journaled; ceiling = gateway.providers) → adapter → sanctioned transport
   * → metering journaled → receipt. The principal is the local human; the
   * permission-graph ceiling still constrains which provider/model scopes
   * exist. Transport and secrets are injectable (tests stay hermetic via
   * cassettes/MockBrain; production defaults to the sanctioned fetch site
   * and keychain-first resolution).
   */
  async gatewayInvoke(input: {
    request: ModelRequest;
    intent?: string;
    transport?: GatewayTransport;
    secrets?: SecretPort;
  }): Promise<{ result: InvocationResult; runId: string; receipt: unknown; journalVerified: boolean }> {
    const clock = new SystemClock();
    const idGen = new SystemIdGen();
    const runId = crn("run", idGen.next());
    const traceId = `t_${idGen.next().slice(-10).toLowerCase()}`;
    const { config, fingerprint } = await loadConfig(`${this.cwd}/vaerion.yaml`);
    const graph = graphFromConfig(config, `graph_${fingerprint.slice(0, 12)}`);
    const harness = await RunHarness.create({
      workspaceDir: this.cwd,
      runId,
      traceId,
      configFingerprint: fingerprint,
      clock,
      idGen,
      permissionGraph: graph,
    });
    try {
      const gateway = new GatewayService({
        clock,
        rng: new SystemRng(),
        idGen,
        transport: input.transport ?? fetchTransport,
        secrets: input.secrets ?? defaultSecretPort(),
      });
      const budgets = config.gateway?.budgets;
      const result = await gateway.invoke(harness, {
        request: input.request,
        // Canonical local-human principal — the same node graphFromConfig
        // grants model.invoke ceiling scopes and declared secret names.
        principal: { kind: "human", id: "human", runId },
        policy: policyFromConfig(config),
        requestId: idGen.next(),
        intent: input.intent ?? `invoke ${input.request.model} (${input.request.op}) via SDK`,
        budget: { tokensUsed: 0, microUsdUsed: 0, tokensPerRun: budgets?.tokensPerRun, microUsdPerRun: budgets?.microUsdPerRun },
      });
      const closed = await harness.close(`model ${result.model} ${result.op} ok via SDK`);
      return { result, runId, receipt: closed.receipt, journalVerified: closed.verify.ok };
    } catch (err) {
      await harness.close(`run ${runId} gateway invoke ended: ${(err as Error).message.slice(0, 120)}`).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Gateway metering rollup for one run — a pure fold over the run's
   * journal, identical to what `vae explain` reports (integer micro-USD).
   */
  async metering(runId: string): Promise<GatewayMeteringRollup> {
    return meteringFromRecords(await this.journalRecords(runId));
  }

  /** The declared capability matrix (same data `vae doctor`/`dev` surface). */
  async gatewayMatrix(): Promise<Array<{ provider: string; ops: string[]; requiresSecret: boolean; secretName: string | null }>> {
    return new GatewayService({
      clock: new SystemClock(),
      rng: new SystemRng(),
      idGen: new SystemIdGen(),
      transport: fetchTransport,
      secrets: defaultSecretPort(),
    }).matrix();
  }

  /* ── MS-4 agents surface (machine parity with `vae run agent`) ── */

  /**
   * One supervised agent run, in-process: the SAME engine calls the CLI
   * makes — AgentRuntime over journaled decisions, declared tools through
   * the broker tool pipeline, model steps through the gateway single gate,
   * metrics folded from the journal. Steps must be declared (InlinePlanner)
   * or the config's planner model is used; custom executors are injectable.
   */
  async agentRun(input: {
    goal: string;
    steps?: PlanStep[];
    maxSteps?: number;
    tools?: Array<{ name: string; scope?: string; executor: ToolExecutor }>;
    transport?: GatewayTransport;
    secrets?: SecretPort;
  }): Promise<{ result: AgentRunResult; metrics: AgentMetrics; receipt: unknown; journalVerified: boolean }> {
    const { config, fingerprint } = await loadConfig(`${this.cwd}/vaerion.yaml`);
    const clock = new SystemClock();
    const idGen = new SystemIdGen();
    const runId = crn("run", idGen.next());
    const traceId = `t_sdk_agent_${idGen.next().slice(-8).toLowerCase()}`;
    const graph = graphFromConfig(config, `graph_${fingerprint.slice(0, 12)}`, agentGrants(config, policyFromConfig(config), { kind: "agent", id: `agent:${runId.slice(-8).toLowerCase()}` }));
    const harness = await RunHarness.create({ workspaceDir: this.cwd, runId, traceId, configFingerprint: fingerprint, clock, idGen, permissionGraph: graph });
    const principal = { kind: "agent" as const, id: `agent:${runId.slice(-8).toLowerCase()}` };
    try {
      const gateway = new GatewayService({
        clock,
        rng: new SystemRng(),
        idGen,
        transport: input.transport ?? fetchTransport,
        secrets: input.secrets ?? defaultSecretPort(),
      });
      const merged = [
        ...(config.tools ?? []).map((d) => ({ name: d.name, scope: d.scope ?? d.name, description: d.description ?? null })),
        ...(input.tools ?? []).filter((t) => !(config.tools ?? []).some((d) => d.name === t.name)).map((t) => ({ name: t.name, scope: t.scope ?? t.name, description: null })),
      ];
      const executors = new Map<string, ToolExecutor>([
        ["echo", echoTool],
        ["clock.read", clockReadTool],
        ...(input.tools ?? []).map((t) => [t.name, t.executor] as const),
      ]);
      const tools = new ToolInvocationService({ clock, idGen, registry: new ToolRegistry(merged), executors, blobStore: this.blobs() });
      const planner = new InlinePlanner({ goal: input.goal, steps: input.steps ?? [] });
      const runtime = new AgentRuntime({
        harness,
        clock,
        idGen,
        maxSteps: input.maxSteps ?? config.agents?.maxSteps ?? 24,
        gateway,
        tools,
        research: null,
        actor: principal,
      });
      const result = await runtime.run({
        goal: input.goal,
        principal,
        policy: policyFromConfig(config),
        planner,
        budget: { tokensUsed: 0, microUsdUsed: 0, tokensPerRun: config.gateway?.budgets?.tokensPerRun, microUsdPerRun: config.gateway?.budgets?.microUsdPerRun },
      });
      const closed = await harness.close(`agent run ${runId}: ${result.outcome} after ${result.steps} step(s) via SDK`);
      const metrics = agentMetricsFromRecords(await this.journalRecords(runId));
      return { result, metrics, receipt: closed.receipt, journalVerified: closed.verify.ok };
    } catch (err) {
      await harness.close(`agent run ${runId} ended: ${(err as Error).message.slice(0, 120)}`).catch(() => undefined);
      throw err;
    }
  }

  /**
   * One deterministic workflow DAG run, in-process (machine parity with
   * `vae run workflow`): fail-closed DAG validation, journaled topological
   * execution, content-addressed node outputs.
   */
  async workflowRun(input: { dag: WorkflowDag; transport?: GatewayTransport; secrets?: SecretPort }): Promise<{ result: WorkflowRunResult; receipt: unknown; journalVerified: boolean }> {
    assertWorkflowDag(input.dag);
    const { config, fingerprint } = await loadConfig(`${this.cwd}/vaerion.yaml`);
    const clock = new SystemClock();
    const idGen = new SystemIdGen();
    const runId = crn("run", idGen.next());
    const traceId = `t_sdk_wf_${idGen.next().slice(-8).toLowerCase()}`;
    const graph = graphFromConfig(config, `graph_${fingerprint.slice(0, 12)}`, agentGrants(config, policyFromConfig(config), { kind: "agent", id: "agent:workflow" }));
    const harness = await RunHarness.create({ workspaceDir: this.cwd, runId, traceId, configFingerprint: fingerprint, clock, idGen, permissionGraph: graph });
    try {
      const gateway = new GatewayService({
        clock,
        rng: new SystemRng(),
        idGen,
        transport: input.transport ?? fetchTransport,
        secrets: input.secrets ?? defaultSecretPort(),
      });
      const registry = ToolRegistry.fromConfig(config.tools ?? []);
      const tools = new ToolInvocationService({
        clock,
        idGen,
        registry,
        executors: new Map<string, ToolExecutor>([
          ["echo", echoTool],
          ["clock.read", clockReadTool],
        ]),
        blobStore: this.blobs(),
      });
      const engine = new WorkflowEngine({ harness, clock, idGen, blobRoot: `${this.cwd}/.vaerion/blobs`, gateway, tools, research: null, actor: { kind: "system", id: "workflow" } });
      const result = await engine.run({ dag: input.dag, principal: { kind: "agent", id: "agent:workflow" }, policy: policyFromConfig(config), budget: { tokensUsed: 0, microUsdUsed: 0 } });
      const closed = await harness.close(`workflow ${input.dag.id}: ${result.outcome} via SDK`);
      return { result, receipt: closed.receipt, journalVerified: closed.verify.ok };
    } catch (err) {
      await harness.close(`workflow run ${runId} ended: ${(err as Error).message.slice(0, 120)}`).catch(() => undefined);
      throw err;
    }
  }

  /** Agent metrics for one run — a pure fold, identical to `vae explain`. */
  async agentMetrics(runId: string): Promise<{ metrics: AgentMetrics; state: ReturnType<typeof agentStateFromRecords> }> {
    const records = await this.journalRecords(runId);
    return { metrics: agentMetricsFromRecords(records), state: agentStateFromRecords(runId, "sdk", records) };
  }
}

export { RunHarness } from "@vaerion/engine";
export default VaeClient;

/* ── MS-5 daemon surface (wire parity over HTTP/SSE) ── */
export { VaeDaemonClient, type VaeDaemonClientOptions, type DaemonRunStarted, type DaemonRunStatus, type DaemonEvent } from "./daemon.ts";
export { DaemonWireTransport, assertLoopbackBase, type WireResponse } from "./daemon-transport.ts";

