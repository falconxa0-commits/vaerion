/**
 * Vaerion — agent planners (MS-4).
 *
 * A planner turns a goal (+ the journaled history so far) into a Plan: an
 * ordered list of steps the executor will run through the constitutional
 * paths (model steps through the gateway single gate, tool steps through the
 * broker pipeline, notes through the reasoning session, context steps
 * through the One Context Path).
 *
 * Two implementations ship, both real:
 *   - InlinePlanner: the steps are DECLARED (in code or emitted by the CLI
 *     from a runbook). Deterministic by construction — the hermetic device
 *     for evals and recovery testing, same law as cassettes (ADR-0012): a
 *     declared determinism device, never a fake LLM.
 *   - ModelPlanner: asks a model through the GatewayService (the single
 *     gate) for a JSON plan; the model's usage is metered and journaled like
 *     any invocation; unparsable output fails loudly (E1800).
 */

import { VaerionError } from "../kernel/errors.ts";
import type { ChatMessage, ModelRequest } from "../gateway/types.ts";
import type { GatewayService, BudgetGuard } from "../gateway/service.ts";
import type { Principal } from "../broker/contracts/principal.ts";
import type { DecisionRequest, BrokerDecision, BrokerDecisionRecord, PolicyContract } from "../broker/contracts/decision.ts";
import type { GateRecord } from "../broker/contracts/gate.ts";
import type { Actor, Cause } from "../spine/envelope.ts";
import type { ContextPack } from "../research/context.ts";

/** One planned step. `final` marks the goal-reaching step of a plan. */
export type PlanStep =
  | {
      kind: "model";
      model: string;
      messages: ChatMessage[];
      /** The answer step: citation enforcement applies when the run used research context. */
      requiresCitations?: boolean;
      seed?: number;
      maxOutputTokens?: number;
      note?: string;
    }
  | { kind: "tool"; tool: string; args: Record<string, unknown>; note?: string }
  | { kind: "note"; text: string }
  | { kind: "context"; capability: string; query: string; note?: string };

/** A plan is executed in order; `done` ends the run after its steps complete. */
export interface Plan {
  done: boolean;
  rationale: string;
  steps: PlanStep[];
}

/** What the planner knows: the goal, the round, and the journaled history. */
export interface PlannerInput {
  goal: string;
  round: number;
  /** Prior step outcomes (newest last) — failures included, never hidden. */
  history: PlannerHistoryItem[];
  /** Context packs prepared so far in this run (citation enforcement input). */
  packs: Array<{ capability: string; pack_fingerprint: string; citation_ids: string[] }>;
}

export interface PlannerHistoryItem {
  round: number;
  index: number;
  kind: PlanStep["kind"];
  ok: boolean;
  summary: string;
  error_code?: string;
}

export interface Planner {
  readonly kind: "inline" | "model";
  plan(input: PlannerInput): Promise<Plan>;
}

/* ───────────────────────────  plan validation  ─────────────────────────── */

/** Validate one step object against the step contract (E1800). Exported for
 *  the workflow DAG validator — nodes carry plan steps. */
export function assertPlanStep(step: unknown, at: number): asserts step is PlanStep {
  const s = step as Partial<PlanStep> | null;
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1800", `plan step [${at}]: ${why}`);
  };
  if (!s || typeof s !== "object") fail("step must be an object");
  if (s.kind === "model") {
    if (typeof s.model !== "string" || !s.model.includes("/")) fail('model steps require a canonical "provider/model" string');
    if (!Array.isArray(s.messages) || s.messages.length === 0) fail("model steps require messages");
    for (const m of s.messages) {
      const mm = m as Partial<ChatMessage> | null;
      if (!mm || (mm.role !== "system" && mm.role !== "user" && mm.role !== "assistant") || typeof mm.content !== "string") {
        fail("model step messages must be {role: system|user|assistant, content: string}");
      }
    }
    return;
  }
  if (s.kind === "tool") {
    if (typeof s.tool !== "string" || s.tool.length === 0) fail("tool steps require a tool name");
    if (!s.args || typeof s.args !== "object" || Array.isArray(s.args)) fail("tool steps require an args object");
    return;
  }
  if (s.kind === "note") {
    if (typeof s.text !== "string" || s.text.length === 0) fail("note steps require non-empty text");
    return;
  }
  if (s.kind === "context") {
    if (typeof s.capability !== "string" || s.capability.length === 0) fail("context steps require a capability name");
    if (typeof s.query !== "string" || s.query.length === 0) fail("context steps require a query");
    return;
  }
  fail(`unknown step kind: ${String(s.kind)}`);
}

/** Validate a parsed plan object against the plan contract (E1800). */
export function assertPlan(value: unknown): asserts value is Plan {
  const p = value as Partial<Plan> | null;
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1800", `plan contract violated: ${why}`);
  };
  if (!p || typeof p !== "object") fail("plan must be an object");
  if (typeof p.done !== "boolean") fail("done must be a boolean");
  if (typeof p.rationale !== "string" || p.rationale.length === 0) fail("rationale must be a non-empty string");
  if (!Array.isArray(p.steps)) fail("steps must be an array");
  p.steps.forEach((s, i) => assertPlanStep(s, i));
}

/**
 * Parse planner TEXT into a plan. The planner model must answer with a JSON
 * object (optionally fenced); anything else is E1800 — planner drift is a
 * loud failure, never guessed around.
 */
export function parsePlanText(text: string): Plan {
  const trimmed = text.trim();
  const candidates: string[] = [];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && fence[1]) candidates.push(fence[1].trim());
  const brace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (brace !== -1 && lastBrace > brace) candidates.push(trimmed.slice(brace, lastBrace + 1));
  candidates.push(trimmed);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      assertPlan(parsed);
      return parsed;
    } catch (err) {
      if (err instanceof VaerionError && err.code === "E1800") throw err;
      continue;
    }
  }
  throw new VaerionError("E1800", "planner output is not a valid plan JSON object", { head: trimmed.slice(0, 120) });
}

/* ─────────────────────────────  inline planner  ───────────────────────────── */

export interface InlinePlannerOptions {
  goal: string;
  steps: PlanStep[];
  rationale?: string;
}

/** The declared plan — identical every round (determinism device, ADR-0012). */
export class InlinePlanner implements Planner {
  readonly kind = "inline" as const;
  private readonly opts: InlinePlannerOptions;

  constructor(opts: InlinePlannerOptions) {
    assertPlan({ done: true, rationale: opts.rationale ?? "declared inline plan", steps: opts.steps });
    this.opts = opts;
  }

  async plan(_input: PlannerInput): Promise<Plan> {
    return { done: true, rationale: this.opts.rationale ?? "declared inline plan", steps: [...this.opts.steps] };
  }
}

/* ──────────────────────────────  model planner  ────────────────────────────── */

export interface ModelPlannerOptions {
  /** The run host — planning invocations cross the real single gate. */
  host: GatewayHostLike;
  gateway: GatewayService;
  model: string;
  principal: Principal;
  policy: PolicyContract;
  /** ULID source for broker request ids. */
  requestId: () => string;
  /** Current run budget state (the runtime folds it from the journal). */
  budget: () => BudgetGuard;
  intent?: string;
}

/** Structural gateway-host port (RunHarness satisfies it). */
export interface GatewayHostLike {
  decide(req: DecisionRequest, policy: PolicyContract): Promise<{ decision: BrokerDecision; record: BrokerDecisionRecord; gate?: GateRecord }>;
  emit(type: string, payload: Record<string, unknown>, actor?: Actor, cause?: Cause): Promise<number>;
  journal: { readonly lastSeq: number };
}

const PLANNER_SYSTEM =
  "You are the Vaerion planner. Reply with ONLY a JSON object: " +
  '{"done": boolean, "rationale": string, "steps": PlanStep[]}. ' +
  "PlanStep is one of: {kind:'model', model:'provider/model', messages:[{role,content}]}, " +
  "{kind:'tool', tool:string, args:object}, {kind:'note', text:string}, " +
  "{kind:'context', capability:string, query:string}. " +
  "Set done=true when the goal is reached after these steps. No prose outside the JSON.";

/**
 * The model-backed planner: its planning invocation crosses the gateway
 * single gate (broker decision → metering → journal) like every model call.
 */
export class ModelPlanner implements Planner {
  readonly kind = "model" as const;
  private readonly opts: ModelPlannerOptions;

  constructor(opts: ModelPlannerOptions) {
    if (!opts.model.includes("/")) {
      throw new VaerionError("E1800", `ModelPlanner requires a canonical provider/model id, got: ${opts.model}`);
    }
    this.opts = opts;
  }

  async plan(input: PlannerInput): Promise<Plan> {
    const historyJson = JSON.stringify(
      input.history.map((h) => ({ round: h.round, index: h.index, kind: h.kind, ok: h.ok, summary: h.summary, error_code: h.error_code ?? null })),
    );
    const request: ModelRequest = {
      op: "chat",
      model: this.opts.model,
      messages: [
        { role: "system", content: PLANNER_SYSTEM },
        { role: "user", content: `goal: ${input.goal}\nround: ${input.round}\nhistory: ${historyJson}\nProduce the next plan JSON.` },
      ],
    };
    const result = await this.opts.gateway.invoke(this.opts.host, {
      request,
      principal: this.opts.principal,
      policy: this.opts.policy,
      requestId: this.opts.requestId(),
      intent: this.opts.intent ?? `plan round ${input.round} for goal: ${input.goal}`,
      budget: this.opts.budget(),
    });
    return parsePlanText(result.text);
  }
}

/** Re-export for consumers that assemble prompts from packs. */
export type { ContextPack };
