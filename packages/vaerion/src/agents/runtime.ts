/**
 * Vaerion — the agent runtime (MS-4): supervisor over journaled decisions.
 *
 * The loop is the constitutional loop, applied to reasoning:
 *
 *     plan → (for each step) decide → journal → act → journal outcome
 *          → retries → replan with failure in history → completion
 *
 * Supervisor law:
 *   - Every step is journaled (agent.step.recorded | agent.step.failed) with
 *     its round/index coordinates; nothing happens off the spine.
 *   - Broker refusals are FATAL (E1300/E1301): authority is explicit — the
 *     runtime never retries around a refusal.
 *   - Gate prompts PAUSE the run: agent.run.completed {outcome:
 *     "awaiting_gate"} is journaled and the gate is returned; the human
 *     resolves via `vae resume`; an approved gate becomes durable elevation
 *     authority (RunHarness elevation law) and the run continues on resume.
 *   - Retries are bounded and deterministic: per-step maxAttempts with
 *     injected backoff; broker refusals and citation violations are never
 *     retried.
 *   - Step ceiling is LOUD (E1804): the ceiling stops the run with the
 *     journaled work intact — never a silent truncation.
 *   - Recovery: state is a pure fold of the journal (R-RT2); resume() skips
 *     steps already journaled by their (round, index) coordinates and
 *     continues the loop. Crash-safe, replay-safe, hash-chain preserved.
 */

import { VaerionError } from "../kernel/errors.ts";
import type { Clock } from "../kernel/clock.ts";
import type { Actor } from "../spine/envelope.ts";
import type { JournalRecord } from "../journal/records.ts";
import { replayRecords, type Reducer } from "../journal/replay.ts";
import { verifyJournal, type VerifyReport } from "../journal/verify.ts";
import { readJournal, type ReadResult } from "../journal/reader.ts";
import type { GateRecord } from "../broker/contracts/gate.ts";
import type { Principal } from "../broker/contracts/principal.ts";
import type { PolicyContract } from "../broker/contracts/decision.ts";
import type { BudgetGuard, GatewayGatePrompt } from "../gateway/service.ts";
import { RunHarness, type RunHarnessOptions } from "../runtime/run.ts";
import { GatewayGatePrompt as GatewayGatePromptClass } from "../gateway/service.ts";
import { ToolGatePrompt } from "./tools.ts";
import type { Planner, PlannerHistoryItem } from "./planner.ts";
import { StepExecutor, historyItemOf, type ResearchPort, type StepOutcome } from "./executor.ts";
import { ReasoningSession, initialReasoningState, reasoningStateReducer, type ReasoningState } from "./reasoning.ts";

export type AgentOutcome = "goal" | "step_limit" | "failed" | "awaiting_gate";

export interface AgentRunState {
  runId: string;
  traceId: string;
  started: boolean;
  completed: boolean;
  outcome: AgentOutcome | null;
  round: number;
  /** Coordinates of journaled steps (dedup key for crash-safe resume). */
  completedSteps: Array<{ round: number; index: number }>;
  history: PlannerHistoryItem[];
  failures: Array<{ round: number; index: number; error_code: string }>;
  tokensUsed: number;
  microUsdUsed: number;
  toolCalls: number;
  openGates: GateRecord[];
  plannerKind: string | null;
  goal: string | null;
  reasoning: ReasoningState;
}

export function initialAgentRunState(runId: string, traceId: string): AgentRunState {
  return {
    runId,
    traceId,
    started: false,
    completed: false,
    outcome: null,
    round: 0,
    completedSteps: [],
    history: [],
    failures: [],
    tokensUsed: 0,
    microUsdUsed: 0,
    toolCalls: 0,
    openGates: [],
    plannerKind: null,
    goal: null,
    reasoning: initialReasoningState(),
  };
}

/** Pure fold: journal records → agent run state (deterministic restoration). */
export const agentRunStateReducer: Reducer<AgentRunState> = (state, rec) => {
  const next: AgentRunState = {
    ...state,
    completedSteps: [...state.completedSteps],
    history: [...state.history],
    failures: [...state.failures],
    openGates: [...state.openGates],
    reasoning: { notes: [...state.reasoning.notes], folds: [...state.reasoning.folds] },
  };
  switch (rec.k) {
    case "evt": {
      const p = rec.env.payload as Record<string, unknown>;
      switch (rec.env.type) {
        case "agent.run.started":
          next.started = true;
          next.plannerKind = typeof p.planner === "string" ? p.planner : null;
          next.goal = typeof p.goal === "string" ? p.goal : null;
          break;
        case "agent.step.recorded": {
          const coord = { round: Number(p.round), index: Number(p.index) };
          if (!next.completedSteps.some((c) => c.round === coord.round && c.index === coord.index)) {
            next.completedSteps.push(coord);
          }
          next.history.push({ round: coord.round, index: coord.index, kind: String(p.kind) as PlannerHistoryItem["kind"], ok: true, summary: String(p.summary ?? "") });
          next.tokensUsed += Number(p.input_tokens ?? 0) + Number(p.output_tokens ?? 0);
          next.microUsdUsed += Number(p.cost_micro_usd ?? 0);
          if (p.kind === "tool") next.toolCalls += 1;
          break;
        }
        case "agent.step.failed":
          next.failures.push({ round: Number(p.round), index: Number(p.index), error_code: String(p.error_code) });
          next.history.push({ round: Number(p.round), index: Number(p.index), kind: String(p.kind) as PlannerHistoryItem["kind"], ok: false, summary: String(p.message ?? "").slice(0, 160), error_code: String(p.error_code) });
          break;
        case "agent.run.completed":
          next.completed = true;
          next.outcome = String(p.outcome) as AgentOutcome;
          break;
        case "reasoning.note.recorded":
          next.reasoning.notes.push({ index: Number(p.index), text: String(p.text), seq: rec.env.seq });
          break;
        case "reasoning.folded":
          next.reasoning.folds.push({ folded_count: Number(p.folded_count), summary: String(p.summary), summary_hash: String(p.summary_hash), seq: rec.env.seq });
          break;
        default:
          break;
      }
      break;
    }
    case "gate": {
      if (rec.gate.state === "open") next.openGates.push(rec.gate);
      else next.openGates = next.openGates.filter((g) => g.gate_id !== rec.gate.gate_id);
      break;
    }
    default:
      break;
  }
  return next;
};

export interface AgentRuntimeOptions {
  harness: RunHarness;
  clock: Clock;
  idGen: { next(): string };
  /** Step ceiling (config agents.maxSteps; default 24). */
  maxSteps: number;
  /** Per-step retry attempts (default 1 = no retry; refusals never retried). */
  stepAttempts?: number;
  /** Deterministic backoff before a retry (injected; hermetic in tests). */
  sleep?: (ms: number) => Promise<void>;
  gateway: AgentRuntimeDeps["gateway"];
  tools: AgentRuntimeDeps["tools"];
  research: ResearchPort | null;
  actor?: Actor;
}

export interface AgentRuntimeDeps {
  gateway: import("../gateway/service.ts").GatewayService | null;
  tools: import("./tools.ts").ToolInvocationService | null;
}

export interface AgentRunInput {
  goal: string;
  principal: Principal;
  policy: PolicyContract;
  planner: Planner;
  budget: BudgetGuard;
}

export interface AgentRunResult {
  runId: string;
  outcome: AgentOutcome;
  steps: number;
  failures: number;
  tokensUsed: number;
  microUsdUsed: number;
  gate: GateRecord | null;
  plannerKind: string;
}

const DEFAULT_MAX_STEPS = 24;

export class AgentRuntime {
  private readonly opts: Required<Omit<AgentRuntimeOptions, "stepAttempts" | "sleep" | "actor">> & { stepAttempts: number; sleep: (ms: number) => Promise<void>; actor: Actor };

  constructor(opts: AgentRuntimeOptions) {
    if (!Number.isInteger(opts.maxSteps) || opts.maxSteps < 1) {
      throw new VaerionError("E1600", `maxSteps must be a positive integer, got ${String(opts.maxSteps)}`);
    }
    this.opts = {
      harness: opts.harness,
      clock: opts.clock,
      idGen: opts.idGen,
      maxSteps: opts.maxSteps,
      stepAttempts: Math.max(1, opts.stepAttempts ?? 1),
      sleep: opts.sleep ?? (() => Promise.resolve()),
      gateway: opts.gateway,
      tools: opts.tools,
      research: opts.research,
      actor: opts.actor ?? { kind: "agent", id: "agent" },
    };
  }

  /** Run the supervised loop. Throws E1804 on step-limit exhaustion. */
  async run(input: AgentRunInput, restored?: AgentRunState): Promise<AgentRunResult> {
    const { harness } = this.opts;
    const state = restored ?? initialAgentRunState(harness.journal.runId, harness.traceId());
    if (!state.started) {
      await harness.emit(
        "agent.run.started",
        { goal: input.goal, planner: input.planner.kind, max_steps: this.opts.maxSteps, principal: `${input.principal.kind}:${input.principal.id}` },
        this.opts.actor,
        { kind: "origin", ref: null },
      );
    }

    const executor = new StepExecutor({
      clock: this.opts.clock,
      actor: this.opts.actor,
      gateway: this.opts.gateway,
      gatewayHost: this.opts.harness,
      tools: this.opts.tools,
      toolHost: this.opts.harness,
      reasoning: this.reasoningSession(state),
      research: this.opts.research,
    });

    const ctx = {
      principal: input.principal,
      policy: input.policy,
      goal: input.goal,
      requestId: () => this.opts.idGen.next(),
      budget: (): BudgetGuard => ({
        ...input.budget,
        tokensUsed: state.tokensUsed,
        microUsdUsed: state.microUsdUsed,
      }),
    };

    try {
      const loopResult = await this.loop(input, state, executor, ctx);
      return {
        runId: harness.journal.runId,
        outcome: loopResult.outcome,
        steps: state.completedSteps.length,
        failures: state.failures.length,
        tokensUsed: state.tokensUsed,
        microUsdUsed: state.microUsdUsed,
        gate: loopResult.gate ?? null,
        plannerKind: input.planner.kind,
      };
    } catch (err) {
      // Human authority checkpoint: a prompt decision pauses the run — the
      // awaiting outcome is journaled, the gate returned, the journal left
      // OPEN (the gate must survive process death, R-A4).
      if (err instanceof GatewayGatePromptClass || err instanceof ToolGatePrompt) {
        return this.pauseForGate(state, err.gate);
      }
      throw err;
    }
  }

  private reasoningSession(state: AgentRunState): ReasoningSession {
    const session = new ReasoningSession(this.opts.harness, this.opts.actor);
    session.seedNoteCount(state.reasoning.notes.length);
    return session;
  }

  private async loop(
    input: AgentRunInput,
    state: AgentRunState,
    executor: StepExecutor,
    ctx: {
      principal: Principal;
      policy: PolicyContract;
      goal: string;
      requestId: () => string;
      budget: () => BudgetGuard;
    },
  ): Promise<{ outcome: AgentOutcome; gate?: GateRecord }> {
    const { harness } = this.opts;
    const fatalCodes = new Set(["E1300", "E1301"]);

    for (;;) {
      if (state.completedSteps.length >= this.opts.maxSteps) {
        await this.complete(state, "step_limit");
        throw new VaerionError(
          "E1804",
          `agent step ceiling reached (${state.completedSteps.length}/${this.opts.maxSteps}); journaled work is intact — raise agents.maxSteps in vaerion.yaml or narrow the goal`,
          { steps: state.completedSteps.length, max_steps: this.opts.maxSteps },
        );
      }

      const plan = await input.planner.plan({
        goal: input.goal,
        round: state.round,
        history: state.history,
        packs: [],
      });

      for (let index = 0; index < plan.steps.length; index++) {
        if (state.completedSteps.length >= this.opts.maxSteps) {
          await this.complete(state, "step_limit");
          throw new VaerionError(
            "E1804",
            `agent step ceiling reached (${state.completedSteps.length}/${this.opts.maxSteps}); journaled work is intact — raise agents.maxSteps in vaerion.yaml or narrow the goal`,
            { steps: state.completedSteps.length, max_steps: this.opts.maxSteps },
          );
        }
        const step = plan.steps[index]!;
        const coord = { round: state.round, index };
        // Crash-safe resume: steps already journaled are never re-executed.
        if (state.completedSteps.some((c) => c.round === coord.round && c.index === coord.index)) continue;

        let outcome: StepOutcome | null = null;
        let attempts = 0;
        for (;;) {
          attempts++;
          try {
            outcome = await executor.execute(step, ctx);
          } catch (err) {
            // Gate prompts propagate ABOVE retry: human authority is not a failure.
            if (err instanceof GatewayGatePromptClass || err instanceof ToolGatePrompt) throw err;
            outcome = { ok: false, kind: step.kind, error_code: err instanceof VaerionError ? err.code : "E1900", message: (err as Error).message };
          }
          if (outcome.ok) break;
          // Retry law: bounded; broker refusals are never retried.
          if (!outcome.ok && fatalCodes.has(outcome.error_code)) break;
          if (attempts >= this.opts.stepAttempts) break;
          await this.opts.sleep(50 * attempts);
        }

        if (outcome === null) {
          throw new VaerionError("E1900", "step executor returned no outcome");
        }

        if (outcome.ok) {
          state.completedSteps.push(coord);
          state.history.push(historyItemOf(coord.round, coord.index, outcome));
          // Live budget accounting: the fold recomputes the same numbers from
          // the journal (R-RT2); the loop keeps the guard accurate NOW so
          // pre/post budget checks see real spend within this process.
          if (outcome.kind === "model" && outcome.model) {
            state.tokensUsed += outcome.model.inputTokens + outcome.model.outputTokens;
            state.microUsdUsed += outcome.model.costMicroUsd;
          }
          await harness.emit(
            "agent.step.recorded",
            {
              round: coord.round,
              index: coord.index,
              kind: outcome.kind,
              summary: outcome.summary,
              attempt: attempts,
              ...(outcome.kind === "model" && outcome.model
                ? {
                    model: outcome.model.model,
                    input_tokens: outcome.model.inputTokens,
                    output_tokens: outcome.model.outputTokens,
                    cost_micro_usd: outcome.model.costMicroUsd,
                    latency_ms: outcome.model.latencyMs,
                    text_hash: outcome.model.textHash,
                  }
                : {}),
              ...(outcome.kind === "tool" && outcome.tool ? { tool: outcome.tool.tool, result_hash: outcome.tool.resultHash, blob_ref: outcome.tool.blobRef } : {}),
              ...(outcome.citations !== undefined ? { citations: outcome.citations } : {}),
            },
            this.opts.actor,
            { kind: "envelope", ref: String(harness.journal.lastSeq) },
          );
        } else {
          state.failures.push({ round: coord.round, index: coord.index, error_code: outcome.error_code });
          state.history.push(historyItemOf(coord.round, coord.index, outcome));
          await harness.emit(
            "agent.step.failed",
            {
              round: coord.round,
              index: coord.index,
              kind: outcome.kind,
              error_code: outcome.error_code,
              message: outcome.message.slice(0, 200),
              attempts,
            },
            this.opts.actor,
            { kind: "envelope", ref: String(harness.journal.lastSeq) },
          );
          // Supervisor decision: broker refusal ⇒ fatal (authority is explicit);
          // otherwise continue to the next round — the failure is in the
          // history the planner sees (honest replanning, never a hidden skip).
          if (fatalCodes.has(outcome.error_code)) {
            await this.complete(state, "failed");
            return { outcome: "failed" };
          }
        }
      }

      if (plan.done) {
        // Honest completion law: the plan finished, but journaled failures
        // mean the goal was NOT reached — outcome "failed" carries them.
        const outcome: AgentOutcome = state.failures.length > 0 ? "failed" : "goal";
        await this.complete(state, outcome);
        return { outcome };
      }
      state.round += 1;
    }
  }

  private async complete(state: AgentRunState, outcome: AgentOutcome): Promise<void> {
    state.outcome = outcome;
    state.completed = true;
    await this.opts.harness.emit(
      "agent.run.completed",
      {
        outcome,
        steps: state.completedSteps.length,
        failures: state.failures.length,
        tokens_used: state.tokensUsed,
        micro_usd_used: state.microUsdUsed,
      },
      this.opts.actor,
      { kind: "envelope", ref: String(this.opts.harness.journal.lastSeq) },
    );
  }

  /**
   * Pause on a gate: journal the awaiting outcome and return the gate. The
   * run is NOT closed — the gate must survive process death (R-A4).
   */
  async pauseForGate(state: AgentRunState, gate: GateRecord): Promise<AgentRunResult> {
    await this.complete(state, "awaiting_gate");
    return {
      runId: this.opts.harness.journal.runId,
      outcome: "awaiting_gate",
      steps: state.completedSteps.length,
      failures: state.failures.length,
      tokensUsed: state.tokensUsed,
      microUsdUsed: state.microUsdUsed,
      gate,
      plannerKind: state.plannerKind ?? "unknown",
    };
  }

  /**
   * Deterministic recovery: verify the chain, fold the agent state, restore
   * the harness, and return a runtime ready to continue the loop. Completed
   * steps are skipped by their (round, index) coordinates.
   */
  static async resume(
    opts: Omit<RunHarnessOptions, "traceId"> & { runtime: Omit<AgentRuntimeOptions, "harness"> },
  ): Promise<{ state: AgentRunState; read: ReadResult; verify: VerifyReport; runtime: AgentRuntime; harness: RunHarness }> {
    const journalPath = RunHarness.journalPathFor(opts.workspaceDir, opts.runId);
    const verify = await verifyJournal(journalPath);
    if (!verify.ok) {
      throw new VaerionError("E1500", "cannot resume agent run: journal failed verification", { path: journalPath, issues: verify.issues });
    }
    const read = await readJournal(journalPath);
    const firstEvt = read.records.find((rec): rec is Extract<typeof rec, { k: "evt" }> => rec.k === "evt");
    const traceId = firstEvt?.env.trace_id ?? `t_agent_resume_${opts.runId.slice(-8).toLowerCase()}`;
    const state = replayRecords<AgentRunState>({
      records: read.records,
      reducer: agentRunStateReducer,
      initial: initialAgentRunState(opts.runId, traceId),
      snapshotValidator: rejectForeignSnapshots,
    }).state;
    if (!state.started) {
      throw new VaerionError("E1600", `run ${opts.runId} is not an agent run (no agent.run.started on the journal)`);
    }
    if (state.completed && state.outcome !== "awaiting_gate") {
      throw new VaerionError("E1600", `agent run ${opts.runId} already completed (${state.outcome})`);
    }
    const harnessRestore = await RunHarness.restore({ ...opts, traceId });
    const runtime = new AgentRuntime({ ...opts.runtime, harness: harnessRestore.harness });
    return { state, read, verify, runtime, harness: harnessRestore.harness };
  }
}

/** Fold helper for read-only surfaces (explain/doctor/evals).
 *  Snapshot law: snapshots in a run journal capture the HARNESS RunState bag
 *  (that is the fold the harness snapshots). The agent fold must never trust
 *  another fold's snapshot — it validates against its own shape, and until
 *  agent-shaped snapshots exist the fold always runs from the beginning
 *  (deterministic; snapshots are accelerators, never truth). */
const rejectForeignSnapshots = (): boolean => false;

export function agentStateFromRecords(runId: string, traceId: string, records: ReadonlyArray<JournalRecord>): AgentRunState {
  return replayRecords<AgentRunState>({
    records: [...records],
    reducer: agentRunStateReducer,
    initial: initialAgentRunState(runId, traceId),
    snapshotValidator: rejectForeignSnapshots,
  }).state;
}

// Re-export for supervisor consumers (type identity with the gateway class).
export type { GatewayGatePrompt };
