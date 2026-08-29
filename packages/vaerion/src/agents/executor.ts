/**
 * Vaerion — the agent step executor (MS-4).
 *
 * One responsibility: run a single PlanStep through its constitutional path
 * and return an honest outcome.
 *
 *   model step   → GatewayService (the single gate: decide → journal → act →
 *                  meter); citation enforcement applies when the step asks
 *                  for it and the run has prepared research context.
 *   tool step    → ToolInvocationService (broker → journal → execute →
 *                  receipts → replay).
 *   note step    → ReasoningSession (persistent scratchpad, journaled).
 *   context step → the ResearchPort (One Context Path: declared capability →
 *                  deterministic retrieval → evidence → citations → pack).
 *
 * The executor is stateless with respect to authority: gate prompts
 * (GatewayGatePrompt / ToolGatePrompt) propagate — the supervisor owns the
 * pause-and-resume law. Failures are RETURNED as outcomes (never swallowed),
 * so the supervisor can retry or replan with the failure in the history.
 */

import { VaerionError } from "../kernel/errors.ts";
import type { Clock } from "../kernel/clock.ts";
import type { Actor } from "../spine/envelope.ts";
import type { Principal } from "../broker/contracts/principal.ts";
import type { PolicyContract } from "../broker/contracts/decision.ts";
import type { InvocationResult } from "../gateway/types.ts";
import { GatewayGatePrompt } from "../gateway/service.ts";
import type { GatewayService, BudgetGuard, GatewayHost } from "../gateway/service.ts";
import { ToolGatePrompt } from "./tools.ts";
import type { ToolInvocationService, ToolHost } from "./tools.ts";
import type { ReasoningSession } from "./reasoning.ts";
import type { PlanStep, PlannerHistoryItem } from "./planner.ts";
import type { Citation } from "../research/citation.ts";

/** The research port: the One Context Path behind `context` steps. */
export interface ResearchPort {
  prepare(query: string, capability: string): Promise<{ pack_fingerprint: string; citation_ids: string[]; evidence_count: number; blocks: number; dropped: number; tokens_estimated: number }>;
}

export type StepOutcome =
  | {
      ok: true;
      kind: PlanStep["kind"];
      summary: string;
      /** Model-backed step accounting (present for kind === "model"). */
      model?: { model: string; inputTokens: number; outputTokens: number; costMicroUsd: number; latencyMs: number; attempts: number; textHash: string | null; text: string };
      /** Tool-backed step accounting (present for kind === "tool"). */
      tool?: { tool: string; resultHash: string; blobRef: string | null };
      /** Citations referenced by the step's output when citation-checked. */
      citations?: string[];
    }
  | { ok: false; kind: PlanStep["kind"]; error_code: string; message: string };

export interface StepExecutorOptions {
  clock: Clock;
  actor: Actor;
  gateway: GatewayService | null;
  /** The run host for gateway invocations (RunHarness satisfies it). */
  gatewayHost: GatewayHost | null;
  tools: ToolInvocationService | null;
  /** The run host for tool pipelines (RunHarness satisfies it). */
  toolHost: ToolHost | null;
  reasoning: ReasoningSession;
  research: ResearchPort | null;
}

const CITATION_RE = /cit_\d{4}/g;

/** Gate prompts are NOT failures: they propagate for the supervisor's pause law. */
function isGatePrompt(err: unknown): err is GatewayGatePrompt | ToolGatePrompt {
  return err instanceof GatewayGatePrompt || err instanceof ToolGatePrompt;
}

export class StepExecutor {
  private readonly opts: StepExecutorOptions;
  private readonly gatewayHostField: GatewayHost | null;
  private readonly toolHostField: ToolHost | null;
  /** Citation ids minted by context steps in THIS run (citation enforcement). */
  private readonly availableCitations: string[] = [];

  constructor(opts: StepExecutorOptions) {
    this.opts = opts;
    this.gatewayHostField = opts.gatewayHost;
    this.toolHostField = opts.toolHost;
  }

  /** Citation enforcement input: the run's prepared citation ids. */
  availableCitationIds(): readonly string[] {
    return this.availableCitations;
  }

  async execute(
    step: PlanStep,
    ctx: { principal: Principal; policy: PolicyContract; goal: string; requestId: () => string; budget: () => BudgetGuard },
  ): Promise<StepOutcome> {
    switch (step.kind) {
      case "model":
        return this.executeModel(step, ctx);
      case "tool":
        return this.executeTool(step, ctx);
      case "note":
        return this.executeNote(step);
      case "context":
        return this.executeContext(step, ctx);
    }
  }

  private async executeModel(
    step: Extract<PlanStep, { kind: "model" }>,
    ctx: { principal: Principal; policy: PolicyContract; goal: string; requestId: () => string; budget: () => BudgetGuard },
  ): Promise<StepOutcome> {
    if (this.opts.gateway === null) {
      return { ok: false, kind: "model", error_code: "E1600", message: "no gateway bound in this process — model steps are unavailable" };
    }
    let result: InvocationResult;
    try {
      result = await this.opts.gateway.invoke(this.gatewayHostField as GatewayHost, {
        request: { op: "chat", model: step.model, messages: step.messages, seed: step.seed, maxOutputTokens: step.maxOutputTokens },
        principal: ctx.principal,
        policy: ctx.policy,
        requestId: ctx.requestId(),
        intent: `agent model step for goal: ${ctx.goal}`,
        budget: ctx.budget(),
      });
    } catch (err) {
      if (isGatePrompt(err)) throw err; // human authority is not a failure
      return { ok: false, kind: "model", error_code: err instanceof VaerionError ? err.code : "E1900", message: (err as Error).message };
    }
    // Citation enforcement (E1806): an answer step over prepared research
    // content must reference at least one prepared citation id.
    let citations: string[] | undefined;
    if (step.requiresCitations === true) {
      if (this.availableCitations.length === 0) {
        return { ok: false, kind: "model", error_code: "E1806", message: "answer step requires citations but the run prepared no research context" };
      }
      const cited = new Set(result.text.match(CITATION_RE) ?? []);
      const used = this.availableCitations.filter((c) => cited.has(c));
      if (used.length === 0) {
        return {
          ok: false,
          kind: "model",
          error_code: "E1806",
          message: `answer does not reference any prepared citation (${this.availableCitations.slice(0, 4).join(", ")}${this.availableCitations.length > 4 ? "…" : ""})`,
        };
      }
      citations = used;
    }
    return {
      ok: true,
      kind: "model",
      summary: result.text.slice(0, 120),
      model: {
        model: result.model,
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
        costMicroUsd: result.cost?.totalMicroUsd ?? 0,
        latencyMs: result.latencyMs,
        attempts: result.attempts,
        textHash: result.textHash,
        text: result.text,
      },
      ...(citations !== undefined ? { citations } : {}),
    };
  }

  private async executeTool(
    step: Extract<PlanStep, { kind: "tool" }>,
    ctx: { principal: Principal; policy: PolicyContract; goal: string; requestId: () => string; budget: () => BudgetGuard },
  ): Promise<StepOutcome> {
    if (this.opts.tools === null) {
      return { ok: false, kind: "tool", error_code: "E1600", message: "no tool pipeline bound in this process — tool steps are unavailable" };
    }
    try {
      const result = await this.opts.tools.invoke(this.toolHostField as ToolHost, {
        tool: step.tool,
        args: step.args,
        principal: ctx.principal,
        policy: ctx.policy,
        requestId: ctx.requestId(),
        intent: `agent tool step for goal: ${ctx.goal}`,
      });
      return {
        ok: true,
        kind: "tool",
        summary: `tool ${result.tool} completed (${result.resultHash.slice(0, 12)}…)`,
        tool: { tool: result.tool, resultHash: result.resultHash, blobRef: result.blobRef?.hash ?? null },
      };
    } catch (err) {
      if (isGatePrompt(err)) throw err; // human authority is not a failure
      return { ok: false, kind: "tool", error_code: err instanceof VaerionError ? err.code : "E1900", message: (err as Error).message };
    }
  }

  private async executeNote(step: Extract<PlanStep, { kind: "note" }>): Promise<StepOutcome> {
    const note = await this.opts.reasoning.note(step.text);
    return { ok: true, kind: "note", summary: `note #${note.index}: ${note.text.slice(0, 80)}` };
  }

  private async executeContext(
    step: Extract<PlanStep, { kind: "context" }>,
    ctx: { principal: Principal; policy: PolicyContract; goal: string; requestId: () => string; budget: () => BudgetGuard },
  ): Promise<StepOutcome> {
    if (this.opts.research === null) {
      return { ok: false, kind: "context", error_code: "E1600", message: "no research port bound in this process — context steps are unavailable" };
    }
    try {
      const prepared = await this.opts.research.prepare(step.query, step.capability);
      this.availableCitations.push(...prepared.citation_ids);
      return {
        ok: true,
        kind: "context",
        summary: `context ${prepared.pack_fingerprint.slice(0, 12)}… (${prepared.blocks} blocks, ${prepared.evidence_count} evidence, ${prepared.citation_ids.length} citations)`,
      };
    } catch (err) {
      if (isGatePrompt(err)) throw err; // human authority is not a failure
      return { ok: false, kind: "context", error_code: err instanceof VaerionError ? err.code : "E1900", message: (err as Error).message };
    }
  }
}

/** Convert an outcome into a planner history item (newest-last fold input). */
export function historyItemOf(round: number, index: number, outcome: StepOutcome): PlannerHistoryItem {
  return outcome.ok
    ? { round, index, kind: outcome.kind, ok: true, summary: outcome.summary }
    : { round, index, kind: outcome.kind, ok: false, summary: outcome.message.slice(0, 160), error_code: outcome.error_code };
}
