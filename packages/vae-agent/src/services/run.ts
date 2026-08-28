/**
 * vae-agent — RunService (D3.2 `vae run`/`vae resume`, Stage 11 law).
 *
 * Executes DECLARED work deterministically: single writer per run
 * (D11.1), ULID identity (D11.2), strictly sequential step execution
 * (D11.3), journaled decisions before acts (D11.4), budget hard stop
 * with graceful partial receipt (D11.5), checkpoint before effects
 * (D11.6), broker-mediated tool invocation (D16.4), every invocation
 * journaled (D16.6). `--dry-run` has zero effect (Guarantee 3).
 * Resume continues from journal truth and refuses on drift (D12.4).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  blake3Text,
  canonicalJson,
  iso,
  receipt as buildReceipt,
  runFailureError,
  usageError,
  ulid,
  redactPayload,
  type Clock,
  type Json,
  type Receipt,
  HUMAN_OPERATOR,
} from "vae-foundation";
import { parseVaerYaml } from "vae-config";
import { JournalWriter, readEntries, verifyJournal, type JournalEntry } from "vae-store";
import { executionOrder, planFingerprint, validatePlan, type RunPlan } from "vae-workflow";
import { BudgetMeter, BudgetExhaustedError } from "../budget.ts";
import type { EngineContext } from "../context.ts";
import { runJournalFile } from "../context.ts";

export interface RunOptions {
  readonly dryRun?: boolean;
  readonly atMs?: number;
}

export interface RunOutcome {
  readonly runId: string;
  readonly ok: boolean;
  readonly receipt: Receipt;
  readonly journalFile: string;
  /** Steps completed (all in a successful run; a prefix otherwise). */
  readonly completedSteps: string[];
}

const HUMAN_GATE_ACTIONS = new Set<string>([]);

export class RunService {
  constructor(private readonly ctx: EngineContext) {}

  /** Execute a declared plan by name (plans live in `runs/*.yaml`). */
  run(planName: string, options: RunOptions = {}): RunOutcome {
    // Never build new work on tampered truth (D12.1, D12.4 posture).
    if (!this.ctx.auditVerifyReport.ok) {
      throw runFailureError("E3001", `The audit chain failed verification: ${this.ctx.auditVerifyReport.brokenAt?.why}.`, "Inspect the reported entry; the journal is append-only truth and tampering is detectable (D12.1).");
    }
    const plan = this.loadPlan(planName);
    const clock: Clock = { nowMs: () => options.atMs ?? this.ctx.clock.nowMs() };
    validatePlan(plan);
    const order = executionOrder(plan);
    const fingerprint = planFingerprint(plan);

    // ---- Dry-run: a faithful preview with zero effect (Guarantee 3). ----
    if (options.dryRun === true) {
      const budget = this.budget();
      const prospective: Receipt = buildReceipt({
        command: `vae run ${planName}`,
        ok: true,
        what_changed: order.map((step) => ({
          subject: `step:${step.id}`,
          action: "none" as const,
          detail: `would execute tool '${step.tool}' (prospective, dry-run)`,
        })),
        cost: { steps: order.length },
        undo: [],
        record: { journal: "(prospective — no journal written)" },
      });
      void budget;
      return { runId: "(dry-run)", ok: true, receipt: prospective, journalFile: "", completedSteps: [] };
    }

    // ---- Real run: single writer, journaled, broker-mediated. ----
    const runId = ulid(clock.nowMs());
    const handle = this.ctx.writerLocks.acquire(runId, "cli");
    try {
      const journal = new JournalWriter(runJournalFile(this.ctx.paths, runId), { clock });
      const budget = this.budget();
      const completed: string[] = [];

      journal.append({
        type: "run.started",
        actor: HUMAN_OPERATOR,
        cause: { kind: "command", ref: `vae run ${planName}` },
        payload: {
          plan: plan.name,
          plan_fingerprint: fingerprint,
          steps: order.map((s) => s.id),
          config_fingerprint: this.ctx.resolved.fingerprint,
          budget: this.ctx.resolved.config.engine.runs.budget,
        },
      });

      let failed = false;
      let failureDetail: Json | undefined;

      for (const step of order) {
        // Budget is charged BEFORE the step; exhaustion hard-stops with
        // a graceful partial receipt (D11.5).
        try {
          budget.chargeStep();
        } catch (error) {
          if (error instanceof BudgetExhaustedError) {
            journal.append({
              type: "run.failed",
              actor: HUMAN_OPERATOR,
              cause: { kind: "plan", ref: plan.name },
              payload: { step: step.id, code: "E3004", detail: error.message },
            });
            const receipt = this.partialReceipt(plan, runId, journal, completed, "E3004", error.message);
            return { runId, ok: false, receipt, journalFile: runJournalFile(this.ctx.paths, runId), completedSteps: completed };
          }
          throw error;
        }

        // 1. DECIDE — broker decision precedes any effect (D16.4).
        const toolSpec = this.ctx.tools.spec(step.tool); // refuses unregistered tools (E2005)
        const capability = toolSpec.capabilities[0]!;
        const { decision } = this.ctx.broker.evaluate(
          {
            capability: { domain: capability.domain as never, action: capability.action, scope: capability.scope },
            principal: { kind: "engine", id: "vae-core", declared: ["engine.selfcheck"] },
            cause: { kind: "plan", ref: `${plan.name}:${step.id}` },
          },
          { kind: "plan", ref: plan.name },
        );

        // 2. JOURNAL the decision before the act (D11.4).
        const decisionEntry = journal.append({
          type: "run.step.decision",
          actor: HUMAN_OPERATOR,
          cause: { kind: "plan", ref: `${plan.name}:${step.id}` },
          payload: { step: step.id, tool: step.tool, outcome: decision.outcome, reason_code: decision.reasonCode, explanation: decision.explanation },
        });

        // Checkpoint BEFORE the effect (D11.6) — durable and resumable.
        this.ctx.checkpoints.write({
          runId,
          stepId: step.id,
          phase: "before-effect",
          payload: { decision_entry: decisionEntry.seq, plan_fingerprint: fingerprint },
          tsMs: clock.nowMs(),
        });

        if (decision.outcome !== "allow") {
          failed = true;
          failureDetail = { step: step.id, code: decision.reasonCode, message: decision.explanation, fix: decision.fix ?? null };
          journal.append({
            type: "run.step.failed",
            actor: HUMAN_OPERATOR,
            cause: { kind: "plan", ref: `${plan.name}:${step.id}` },
            payload: failureDetail,
          });
          break;
        }

        // 3. ACT — broker-mediated, contract-validated, journaled (D16.6).
        const result = this.ctx.tools.invokeValidated({ tool: step.tool, input: step.input ?? {}, runId, stepId: step.id });
        if (result.ok) {
          completed.push(step.id);
          journal.append({
            type: "run.step.completed",
            actor: HUMAN_OPERATOR,
            cause: { kind: "plan", ref: `${plan.name}:${step.id}` },
            payload: { step: step.id, tool: step.tool, output: result.output as Json },
          });
        } else {
          failed = true;
          failureDetail = { step: step.id, kind: result.failure.kind, code: result.failure.code, message: result.failure.message, fix: result.failure.fix ?? null };
          journal.append({
            type: "run.step.failed",
            actor: HUMAN_OPERATOR,
            cause: { kind: "plan", ref: `${plan.name}:${step.id}` },
            payload: failureDetail,
          });
          break;
        }
      }

      const finalType = failed ? "run.failed" : "run.completed";
      journal.append({
        type: finalType,
        actor: HUMAN_OPERATOR,
        cause: { kind: "plan", ref: plan.name },
        payload: {
          steps_completed: completed.length,
          steps_total: order.length,
          budget: { steps_spent: budget.stepsSpent, steps_remaining: budget.stepsRemaining, usd_spent: budget.moneySpent },
          ...(failureDetail !== undefined ? { failure: failureDetail } : {}),
        },
      });

      const receipt = buildReceipt({
        command: `vae run ${planName}`,
        ok: !failed,
        what_changed: completed.map((stepId) => ({ subject: `step:${stepId}`, action: "executed" as const })),
        cost: {
          steps: budget.stepsSpent,
          journal_entries: verifyJournal(runJournalFile(this.ctx.paths, runId)).entries,
          wall_ms: 0,
          usd: budget.moneySpent,
        },
        undo: [],
        record: {
          run_id: runId,
          journal: `.vaerion/journal/${runId}.ndjson`,
          chain_head: journal.head(),
        },
      });

      this.persistReceipt(runId, receipt, failed ? "failed" : "completed");
      this.ctx.publishEvent(failed ? "run.failed" : "run.completed", { run_id: runId, plan: plan.name }, runId);
      return { runId, ok: !failed, receipt, journalFile: runJournalFile(this.ctx.paths, runId), completedSteps: completed };
    } finally {
      handle.release();
    }
  }

  /** Resume an interrupted or failed run from journal truth (Part III, D21.7). */
  resume(runId: string, options: RunOptions = {}): RunOutcome {
    const clock: Clock = { nowMs: () => options.atMs ?? this.ctx.clock.nowMs() };
    const file = runJournalFile(this.ctx.paths, runId);
    if (!existsSync(file)) {
      throw usageError("E1006", `Run '${runId}' has no journal in this workspace.`, "List runs with `vae journal --list --json` and resume an existing run.");
    }
    const report = verifyJournal(file);
    if (!report.ok) {
      throw runFailureError("E3001", `Journal for run '${runId}' failed verification: ${report.brokenAt?.why}.`, "Inspect the reported entry; reversion and resumption refuse on drift (D12.4).");
    }
    const entries = readEntries(file);
    const started = entries.find((e) => e.type === "run.started");
    if (started === undefined) throw usageError("E1006", `Run '${runId}' has no start entry.`, "Resume only runs created by `vae run`.");

    const planName = (started.payload as { plan: string }).plan;
    const journaledPlanFp = (started.payload as { plan_fingerprint: string }).plan_fingerprint;
    const journaledConfigFp = (started.payload as { config_fingerprint: string }).config_fingerprint;

    // Drift law: the plan and the pinned configuration must be exactly
    // what the run started with (D12.4, D19.7).
    const plan = this.loadPlan(planName);
    if (planFingerprint(plan) !== journaledPlanFp) {
      throw runFailureError("E2010", `Plan '${planName}' has drifted since run '${runId}' started.`, "Resolve the drift explicitly; a resumed run replays the declared work it started with (D12.4).");
    }
    if (journaledConfigFp !== this.ctx.resolved.fingerprint) {
      throw runFailureError("E2010", `Configuration has drifted since run '${runId}' started (pinned snapshot mismatch).`, "Restore the pinned configuration or start a new run; a resumed run continues under its pinned snapshot (D19.7).");
    }

    const completed = new Set(
      entries.filter((e) => e.type === "run.step.completed").map((e) => (e.payload as { step: string }).step),
    );
    const order = executionOrder(plan).filter((s) => !completed.has(s.id));

    if (order.length === 0) {
      // Nothing left to do: the run is already complete.
      const receipt = buildReceipt({
        command: `vae resume ${runId}`,
        ok: true,
        what_changed: [],
        cost: { steps: 0 },
        undo: [],
        record: { run_id: runId, journal: `.vaerion/journal/${runId}.ndjson` },
      });
      return { runId, ok: true, receipt, journalFile: file, completedSteps: [...completed] };
    }

    const handle = this.ctx.writerLocks.acquire(runId, "cli-resume");
    try {
      const journal = new JournalWriter(file, { clock });
      const budget = this.budget();
      journal.append({
        type: "run.resumed",
        actor: HUMAN_OPERATOR,
        cause: { kind: "command", ref: `vae resume ${runId}` },
        payload: { remaining_steps: order.map((s) => s.id), plan_fingerprint: journaledPlanFp },
      });

      let failed = false;
      let failureDetail: Json | undefined;
      const completedNow: string[] = [];

      for (const step of order) {
        budget.chargeStep();
        const toolSpec = this.ctx.tools.spec(step.tool);
        const capability = toolSpec.capabilities[0]!;
        const { decision } = this.ctx.broker.evaluate(
          {
            capability: { domain: capability.domain as never, action: capability.action, scope: capability.scope },
            principal: { kind: "engine", id: "vae-core", declared: ["engine.selfcheck"] },
            cause: { kind: "plan", ref: `${planName}:${step.id}` },
          },
          { kind: "resume", ref: runId },
        );
        journal.append({
          type: "run.step.decision",
          actor: HUMAN_OPERATOR,
          cause: { kind: "resume", ref: runId },
          payload: { step: step.id, tool: step.tool, outcome: decision.outcome, reason_code: decision.reasonCode },
        });
        this.ctx.checkpoints.write({ runId, stepId: step.id, phase: "before-effect", payload: { resumed: true }, tsMs: clock.nowMs() });
        if (decision.outcome !== "allow") {
          failed = true;
          failureDetail = { step: step.id, code: decision.reasonCode, message: decision.explanation };
          break;
        }
        const result = this.ctx.tools.invokeValidated({ tool: step.tool, input: step.input ?? {}, runId, stepId: step.id });
        if (result.ok) {
          completedNow.push(step.id);
          journal.append({
            type: "run.step.completed",
            actor: HUMAN_OPERATOR,
            cause: { kind: "resume", ref: runId },
            payload: { step: step.id, tool: step.tool, output: result.output as Json },
          });
        } else {
          failed = true;
          failureDetail = { step: step.id, kind: result.failure.kind, code: result.failure.code, message: result.failure.message };
          break;
        }
      }

      const allCompleted = [...completed, ...completedNow];
      journal.append({
        type: failed ? "run.failed" : "run.completed",
        actor: HUMAN_OPERATOR,
        cause: { kind: "resume", ref: runId },
        payload: { steps_completed: allCompleted.length, ...(failureDetail !== undefined ? { failure: failureDetail } : {}) },
      });

      const receipt = buildReceipt({
        command: `vae resume ${runId}`,
        ok: !failed,
        what_changed: completedNow.map((stepId) => ({ subject: `step:${stepId}`, action: "executed" as const })),
        cost: { steps: completedNow.length, journal_entries: verifyJournal(file).entries, usd: budget.moneySpent },
        undo: [],
        record: { run_id: runId, journal: `.vaerion/journal/${runId}.ndjson`, chain_head: journal.head() },
      });
      this.persistReceipt(runId, receipt, failed ? "failed" : "completed");
      return { runId, ok: !failed, receipt, journalFile: file, completedSteps: allCompleted };
    } finally {
      handle.release();
    }
  }

  private budget(): BudgetMeter {
    const budgetConfig = this.ctx.resolved.config.engine.runs.budget;
    return new BudgetMeter(budgetConfig.maxSteps, budgetConfig.usd);
  }

  private loadPlan(planName: string): RunPlan {
    const safeName = basename(planName);
    const planFile = join(this.ctx.paths.root, "runs", `${safeName}.yaml`);
    if (!existsSync(planFile)) {
      throw usageError("E1009", `The declared run plan '${safeName}' was not found in the workspace.`, "Reference a plan that exists under `runs/`, or scaffold one with `vae init`.");
    }
    const doc = parseVaerYaml(readFileSync(planFile, "utf8"));
    const plan = doc as unknown as RunPlan;
    if (typeof plan !== "object" || plan === null || !Array.isArray((plan as RunPlan).steps) || typeof plan.name !== "string") {
      throw usageError("E1008", `Run plan file '${safeName}.yaml' is not a valid plan.`, "Repair the plan against spec/schemas/run-plan.schema.json (name + steps).");
    }
    return plan;
  }

  private persistReceipt(runId: string, r: Receipt, status: "completed" | "failed"): void {
    writeFileSync(
      join(this.ctx.paths.runsDir, `${runId}.receipt.json`),
      `${JSON.stringify({ status, ...r }, null, 2)}\n`,
      "utf8",
    );
  }

  private partialReceipt(plan: RunPlan, runId: string, journal: JournalWriter, completed: string[], code: string, message: string): Receipt {
    journal.append({
      type: "run.failed",
      actor: HUMAN_OPERATOR,
      cause: { kind: "plan", ref: plan.name },
      payload: { code, message },
    });
    return buildReceipt({
      command: `vae run ${plan.name}`,
      ok: false,
      what_changed: completed.map((stepId) => ({ subject: `step:${stepId}`, action: "executed" as const })),
      cost: { steps: completed.length, journal_entries: journal.peekSeq() - 1, usd: "0.0000" },
      undo: [],
      record: {
        run_id: runId,
        journal: `.vaerion/journal/${runId}.ndjson`,
        chain_head: journal.head(),
      },
    });
  }
}

/** Journal entries for a run, redacted for export/rendering (D12.3). */
export function entriesForRender(file: string, limit?: number): JournalEntry[] {
  const entries = readEntries(file);
  const sliced = limit === undefined ? entries : entries.slice(-limit);
  return sliced.map((e) => ({ ...e, payload: redactPayload(e.payload as Json) })) as JournalEntry[];
}

export function fingerprintOf(value: unknown): string {
  return blake3Text(canonicalJson(value));
}

export function runStatus(entries: readonly JournalEntry[]): "completed" | "failed" | "running" {
  const last = entries.at(-1);
  if (last === undefined) return "running";
  if (last.type === "run.completed") return "completed";
  if (last.type === "run.failed") return "failed";
  return "running";
}

export function isoOf(ms: number): string {
  return iso(ms);
}
