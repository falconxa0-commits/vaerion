/**
 * Vaerion — the workflow DAG engine (MS-4).
 *
 * Deterministic, replayable, resumable, journal-backed DAG execution.
 *
 *     workflow.started → (per node in topo order) node.started →
 *     [step through the StepExecutor law] → node.completed {blob_ref} |
 *     node.failed {error_code} → workflow.completed
 *
 * Law:
 *   - Scheduling is the deterministic topo order (Kahn + lexicographic);
 *     execution is sequential — parallelism needs a ratified ADR first.
 *   - Node outputs are content-addressed: a completed node's outcome is
 *     stored in the blob CAS and journaled by blob_ref (receipts law).
 *   - Resume is the fold: completed nodes are skipped by id; the chain is
 *     verified BEFORE anything appends; crash-safe by the single-writer
 *     journal lock; replay-safe because everything is a journal record.
 *   - Retries are per-node, bounded, deterministic; broker refusals are
 *     fatal (authority is explicit); gate prompts pause the whole workflow.
 */

import { VaerionError } from "../kernel/errors.ts";
import type { Clock } from "../kernel/clock.ts";
import type { Actor } from "../spine/envelope.ts";
import type { JournalRecord } from "../journal/records.ts";
import { replayRecords, type Reducer } from "../journal/replay.ts";
import { verifyJournal, type VerifyReport } from "../journal/verify.ts";
import { readJournal, type ReadResult } from "../journal/reader.ts";
import type { Principal } from "../broker/contracts/principal.ts";
import type { PolicyContract } from "../broker/contracts/decision.ts";
import type { BudgetGuard } from "../gateway/service.ts";
import { RunHarness, type RunHarnessOptions } from "../runtime/run.ts";
import { BlobStore } from "../store/blob-cas.ts";
import { canonicalJson } from "../kernel/canonical.ts";
import { blake3HexOf } from "../kernel/hash.ts";
import { GatewayGatePrompt } from "../gateway/service.ts";
import { ToolGatePrompt } from "../agents/tools.ts";
import { StepExecutor, type StepOutcome } from "../agents/executor.ts";
import { ReasoningSession } from "../agents/reasoning.ts";
import type { ResearchPort } from "../agents/executor.ts";
import { assertWorkflowDag, topoOrder, type WorkflowDag } from "./dag.ts";

export interface WorkflowState {
  workflowId: string;
  started: boolean;
  completed: boolean;
  outcome: "completed" | "failed" | "awaiting_gate" | null;
  completedNodes: string[];
  failedNodes: Array<{ node: string; error_code: string }>;
  outputs: Record<string, string>; // node id → result hash
  openGates: number;
}

export function initialWorkflowState(workflowId: string): WorkflowState {
  return { workflowId, started: false, completed: false, outcome: null, completedNodes: [], failedNodes: [], outputs: {}, openGates: 0 };
}

/** Pure fold: journal records → workflow state (deterministic restoration). */
export const workflowStateReducer: Reducer<WorkflowState> = (state, rec) => {
  const next: WorkflowState = {
    ...state,
    completedNodes: [...state.completedNodes],
    failedNodes: [...state.failedNodes],
    outputs: { ...state.outputs },
  };
  if (rec.k !== "evt") {
    if (rec.k === "gate" && rec.gate.state === "open") next.openGates++;
    return next;
  }
  const p = rec.env.payload as Record<string, unknown>;
  switch (rec.env.type) {
    case "workflow.started":
      next.started = true;
      next.workflowId = String(p.workflow ?? state.workflowId);
      break;
    case "workflow.node.completed": {
      const id = String(p.node);
      if (!next.completedNodes.includes(id)) next.completedNodes.push(id);
      next.outputs[id] = String(p.result_hash ?? "");
      break;
    }
    case "workflow.node.failed":
      next.failedNodes.push({ node: String(p.node), error_code: String(p.error_code) });
      break;
    case "workflow.completed":
      next.completed = true;
      next.outcome = String(p.outcome) as WorkflowState["outcome"];
      break;
    default:
      break;
  }
  return next;
};

export interface WorkflowEngineOptions {
  harness: RunHarness;
  clock: Clock;
  idGen: { next(): string };
  blobRoot: string;
  gateway: import("../gateway/service.ts").GatewayService | null;
  tools: import("../agents/tools.ts").ToolInvocationService | null;
  research: ResearchPort | null;
  actor?: Actor;
}

export interface WorkflowRunInput {
  dag: WorkflowDag;
  principal: Principal;
  policy: PolicyContract;
  budget: BudgetGuard;
}

export interface WorkflowRunResult {
  workflowId: string;
  outcome: "completed" | "failed" | "awaiting_gate";
  completedNodes: string[];
  failedNodes: Array<{ node: string; error_code: string }>;
  outputs: Record<string, string>;
  gate: import("../broker/contracts/gate.ts").GateRecord | null;
}

export class WorkflowEngine {
  private readonly opts: Required<Omit<WorkflowEngineOptions, "actor">> & { actor: Actor };

  constructor(opts: WorkflowEngineOptions) {
    this.opts = {
      harness: opts.harness,
      clock: opts.clock,
      idGen: opts.idGen,
      blobRoot: opts.blobRoot,
      gateway: opts.gateway,
      tools: opts.tools,
      research: opts.research,
      actor: opts.actor ?? { kind: "system", id: "workflow" },
    };
  }

  /** Execute a DAG. Validates first (E1803); nothing journals on invalid DAGs.
   *  With `resumeState`, already-completed nodes are skipped (crash recovery). */
  async run(input: WorkflowRunInput, opts?: { resumeState?: WorkflowState }): Promise<WorkflowRunResult> {
    assertWorkflowDag(input.dag);
    const order = topoOrder(input.dag);
    const { harness } = this.opts;
    if (!opts?.resumeState) {
      await harness.emit("workflow.started", { workflow: input.dag.id, nodes: input.dag.nodes.length }, this.opts.actor, { kind: "origin", ref: null });
    }
    const skip = new Set(opts?.resumeState?.completedNodes ?? []);
    const state = await this.execute(input, order, skip, opts?.resumeState);
    return {
      workflowId: input.dag.id,
      outcome: state.outcome ?? (state.failedNodes.length > 0 ? "failed" : "completed"),
      completedNodes: [...state.completedNodes],
      failedNodes: [...state.failedNodes],
      outputs: { ...state.outputs },
      gate: null,
    };
  }

  private executor(input: WorkflowRunInput): StepExecutor {
    const reasoning = new ReasoningSession(this.opts.harness, this.opts.actor);
    return new StepExecutor({
      clock: this.opts.clock,
      actor: this.opts.actor,
      gateway: this.opts.gateway,
      gatewayHost: this.opts.harness,
      tools: this.opts.tools,
      toolHost: this.opts.harness,
      reasoning,
      research: this.opts.research,
    });
  }

  private async execute(
    input: WorkflowRunInput,
    order: string[],
    skip: Set<string>,
    resumed?: WorkflowState | null,
  ): Promise<WorkflowState> {
    const { harness } = this.opts;
    const nodes = new Map(input.dag.nodes.map((n) => [n.id, n]));
    const state: WorkflowState = resumed
      ? { ...resumed, completedNodes: [...resumed.completedNodes], failedNodes: [...resumed.failedNodes], outputs: { ...resumed.outputs }, openGates: 0 }
      : initialWorkflowState(input.dag.id);
    state.started = true;
    const blobs = new BlobStore(this.opts.blobRoot);
    const executor = this.executor(input);
    const fatalCodes = new Set(["E1300", "E1301"]);

    for (const nodeId of order) {
      if (skip.has(nodeId)) continue;
      if (state.failedNodes.length > 0) {
        // Deterministic failure law: a failed node stops downstream progress;
        // dependents are never half-run. Completion is journaled below.
        break;
      }
      const node = nodes.get(nodeId)!;
      await harness.emit("workflow.node.started", { workflow: input.dag.id, node: nodeId, deps: [...node.deps] }, this.opts.actor, { kind: "envelope", ref: String(harness.journal.lastSeq) });

      const maxAttempts = node.maxAttempts ?? 1;
      let outcome: StepOutcome | null = null;
      let attempts = 0;
      for (;;) {
        attempts++;
        try {
          outcome = await executor.execute(node.step, {
            principal: input.principal,
            policy: input.policy,
            goal: `${input.dag.id}:${nodeId}`,
            requestId: () => this.opts.idGen.next(),
            budget: (): BudgetGuard => ({ ...input.budget }),
          });
        } catch (err) {
          if (err instanceof GatewayGatePrompt || err instanceof ToolGatePrompt) throw err;
          outcome = { ok: false, kind: node.step.kind, error_code: err instanceof VaerionError ? err.code : "E1900", message: (err as Error).message };
        }
        if (outcome.ok) break;
        if (fatalCodes.has(outcome.error_code)) break;
        if (attempts >= maxAttempts) break;
      }

      if (outcome === null) {
        throw new VaerionError("E1900", "workflow node produced no outcome");
      }

      if (outcome.ok) {
        // Content-address the node outcome (receipts law): the journal
        // carries the hash, the CAS carries the bytes.
        const payload = canonicalJson({ node: nodeId, kind: outcome.kind, summary: outcome.summary });
        const resultHash = await blake3HexOf(payload);
        const blobRef = await blobs.put(payload);
        await harness.emit("store.blob.put", { blob_ref: blobRef, purpose: `workflow_node:${input.dag.id}:${nodeId}` }, this.opts.actor, { kind: "envelope", ref: String(harness.journal.lastSeq) });
        state.completedNodes.push(nodeId);
        state.outputs[nodeId] = resultHash;
        await harness.emit(
          "workflow.node.completed",
          {
            workflow: input.dag.id,
            node: nodeId,
            result_hash: resultHash,
            blob_ref: blobRef,
            attempts,
            summary: outcome.summary,
          },
          this.opts.actor,
          { kind: "envelope", ref: String(harness.journal.lastSeq) },
        );
      } else {
        state.failedNodes.push({ node: nodeId, error_code: outcome.error_code });
        await harness.emit(
          "workflow.node.failed",
          { workflow: input.dag.id, node: nodeId, error_code: outcome.error_code, message: outcome.message.slice(0, 200), attempts },
          this.opts.actor,
          { kind: "envelope", ref: String(harness.journal.lastSeq) },
        );
      }
    }

    if (resumed && state.completed) {
      // Resumed state was already terminal (workflow.completed in journal);
      // nothing new to journal — return the folded outcome.
      return state;
    }
    state.completed = true;
    state.outcome = state.failedNodes.length > 0 ? "failed" : "completed";
    await harness.emit(
      "workflow.completed",
      {
        workflow: input.dag.id,
        outcome: state.outcome,
        completed: [...state.completedNodes],
        failed: state.failedNodes.map((f) => f.node),
      },
      this.opts.actor,
      { kind: "envelope", ref: String(harness.journal.lastSeq) },
    );
    return state;
  }

  /**
   * Deterministic recovery: verify the chain, fold the workflow state, and
   * continue from the first uncompleted node. Crash-safe, replay-safe.
   */
  static async resume(
    opts: Omit<RunHarnessOptions, "traceId"> & { engine: Omit<WorkflowEngineOptions, "harness"> },
  ): Promise<{ state: WorkflowState; read: ReadResult; verify: VerifyReport; engine: WorkflowEngine; harness: RunHarness }> {
    const journalPath = RunHarness.journalPathFor(opts.workspaceDir, opts.runId);
    const verify = await verifyJournal(journalPath);
    if (!verify.ok) {
      throw new VaerionError("E1500", "cannot resume workflow run: journal failed verification", { path: journalPath, issues: verify.issues });
    }
    const read = await readJournal(journalPath);
    const firstEvt = read.records.find((rec): rec is Extract<typeof rec, { k: "evt" }> => rec.k === "evt");
    const traceId = firstEvt?.env.trace_id ?? `t_wf_resume_${opts.runId.slice(-8).toLowerCase()}`;
    const state = replayRecords<WorkflowState>({
      records: read.records,
      reducer: workflowStateReducer,
      initial: initialWorkflowState("?"),
      snapshotValidator: (): boolean => false,
    }).state;
    if (!state.started) {
      throw new VaerionError("E1600", `run ${opts.runId} is not a workflow run (no workflow.started on the journal)`);
    }
    if (state.completed) {
      throw new VaerionError("E1600", `workflow run ${opts.runId} already completed (${state.outcome})`);
    }
    const harnessRestore = await RunHarness.restore({ ...opts, traceId });
    const engine = new WorkflowEngine({ ...opts.engine, harness: harnessRestore.harness });
    return { state, read, verify, engine, harness: harnessRestore.harness };
  }
}

export function workflowStateFromRecords(workflowId: string, records: ReadonlyArray<JournalRecord>): WorkflowState {
  return replayRecords<WorkflowState>({
    records: [...records],
    reducer: workflowStateReducer,
    initial: initialWorkflowState(workflowId),
    // Snapshot law: never trust another fold's snapshot bag (see agents/runtime.ts).
    snapshotValidator: (): boolean => false,
  }).state;
}

export type { WorkflowDag };
