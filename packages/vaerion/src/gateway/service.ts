/**
 * Vaerion — the Model Gateway SERVICE (MS-3, the single gate; D-J).
 *
 * EVERY model invocation in the engine crosses this service. The flow is
 * the broker flow, unchanged:
 *
 *     decide (model.invoke) → journal → act (adapter → transport)
 *     decide (secret.read)  → journal → resolve (keychain/env, call time)
 *
 * plus gateway law layered on top:
 *   - R-MG2: connection establishment is retried with deterministic
 *     full-jitter backoff; the breaker refuses when a provider is down;
 *     once a 200 stream flows, consumption is never retried.
 *   - R-MG3: usage + integer micro-USD cost are journaled with the
 *     invocation; run budgets stop the run loudly (never silently).
 *   - R-MG5: outbound payloads are scrubbed through the redaction
 *     middleware BEFORE they reach any adapter — a secret-shaped value
 *     never leaves the machine, and the journaled text is redacted too.
 *   - ADR-0013: secret VALUES are resolved only at call time, passed once
 *     to the adapter, never cached or persisted.
 *
 * The service is pure with respect to the run harness: it sees a
 * `GatewayHost` port (the RunHarness satisfies it structurally), so the
 * gateway layer stays at L1 and cannot know runtime internals.
 */

import { blake3HexOf } from "../kernel/hash.ts";
import { redactDeep } from "../kernel/redact.ts";
import { VaerionError } from "../kernel/errors.ts";
import type { Actor, Cause } from "../spine/envelope.ts";
import type { DecisionRequest, BrokerDecision, BrokerDecisionRecord, PolicyContract } from "../broker/contracts/decision.ts";
import type { GateRecord } from "../broker/contracts/gate.ts";
import type { Clock, Rng } from "../kernel/clock.ts";
import type {
  InvocationResult,
  ModelRequest,
  ProviderAdapter,
  ProviderContext,
  GatewayTransport,
  StreamFrame,
  TokenUsage,
} from "./types.ts";
import { parseModelId } from "./types.ts";
import { costOf } from "./pricing.ts";
import { assembleText } from "./types.ts";
import { CircuitBreaker, TransportRetries, type RetryPolicy } from "./breaker.ts";
import { type SecretPort, requireResolvedSecret } from "./secrets.ts";
import { anthropicAdapter } from "./adapters/anthropic.ts";
import { openaiAdapter } from "./adapters/openai.ts";
import { ollamaAdapter } from "./adapters/ollama.ts";
import { mockBrainAdapter } from "./mockbrain.ts";

/**
 * The port the gateway needs from a run. RunHarness satisfies this
 * structurally (its decide() carries an optional graph parameter, which is
 * assignable); nothing here imports runtime.
 */
export interface GatewayHost {
  decide(req: DecisionRequest, policy: PolicyContract): Promise<{ decision: BrokerDecision; record: BrokerDecisionRecord; gate?: GateRecord }>;
  emit(type: string, payload: Record<string, unknown>, actor?: Actor, cause?: Cause): Promise<number>;
  journal: { readonly lastSeq: number };
}

/** Thrown when the broker answers `prompt` — the caller owns the gate UX. */
export class GatewayGatePrompt extends Error {
  readonly decision: Extract<BrokerDecision, { kind: "prompt" }>;
  readonly record: BrokerDecisionRecord;
  readonly gate: GateRecord;
  constructor(decision: Extract<BrokerDecision, { kind: "prompt" }>, record: BrokerDecisionRecord, gate: GateRecord) {
    super(decision.reason);
    this.name = "GatewayGatePrompt";
    this.decision = decision;
    this.record = record;
    this.gate = gate;
  }
}

/** Run-budget state supplied by the caller (computed from the run journal). */
export interface BudgetGuard {
  /** Per-run ceiling in tokens (whole run, input+output), when configured. */
  tokensPerRun?: number;
  /** Per-run ceiling in integer micro-USD, when configured. */
  microUsdPerRun?: number;
  /** Tokens already metered on this run before this invocation. */
  tokensUsed: number;
  /** Micro-USD already metered on this run before this invocation. */
  microUsdUsed: number;
}

export interface GatewayInvokeInput {
  request: ModelRequest;
  principal: { kind: "human" | "agent" | "tool" | "extension" | "research" | "system"; id: string; runId?: string; digest?: string };
  policy: PolicyContract;
  /** Request id for the broker decision (ULID from the caller's id port). */
  requestId: string;
  /** Stated intent — required, like every broker request. */
  intent: string;
  /** Budget state for this run (required; pass zeros when unconfigured). */
  budget: BudgetGuard;
}

/** The id port the gateway needs (ULID strings; the harness's IdGenLike shape). */
export interface GatewayIdGen {
  next(): string;
}

export interface GatewayServiceOptions {
  clock: Clock;
  rng: Rng;
  idGen: GatewayIdGen;
  transport: GatewayTransport;
  secrets: SecretPort;
  /** Override the adapter registry (tests inject fakes); default is all built-ins. */
  adapters?: ReadonlyArray<ProviderAdapter>;
  retry?: RetryPolicy;
  /** Custom sleep for retry backoff (tests pass a no-op or a clock stepper). */
  sleep?: (ms: number) => Promise<void>;
  breakerThreshold?: number;
  breakerCooldownMs?: number;
}

function defaultAdapters(): ProviderAdapter[] {
  return [mockBrainAdapter, anthropicAdapter, openaiAdapter, ollamaAdapter];
}

export class GatewayService {
  private readonly adapters: ReadonlyMap<string, ProviderAdapter>;
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly clock: Clock;
  private readonly rng: Rng;
  private readonly idGen: GatewayIdGen;
  private readonly transport: GatewayTransport;
  private readonly secrets: SecretPort;
  private readonly retry: RetryPolicy;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly breakerThreshold?: number;
  private readonly breakerCooldownMs?: number;

  constructor(opts: GatewayServiceOptions) {
    if (!opts || !opts.clock || !opts.rng || !opts.idGen || !opts.transport || !opts.secrets) {
      throw Object.assign(new Error("GatewayService: clock, rng, idGen, transport, secrets required"), { code: "E1600" });
    }
    const list = opts.adapters ?? defaultAdapters();
    this.adapters = new Map(list.map((a) => [a.provider, a]));
    this.clock = opts.clock;
    this.rng = opts.rng;
    this.idGen = opts.idGen;
    this.transport = opts.transport;
    this.secrets = opts.secrets;
    this.retry = opts.retry ?? { maxAttempts: 3, baseDelayMs: 200, maxDelayMs: 5_000 };
    this.sleep = opts.sleep ?? (() => Promise.resolve());
    this.breakerThreshold = opts.breakerThreshold;
    this.breakerCooldownMs = opts.breakerCooldownMs;
  }

  /** Declared capability matrix (doctor/`dev` surfaces; never faked). */
  matrix(): Array<{ provider: string; ops: string[]; requiresSecret: boolean; secretName: string | null }> {
    return [...this.adapters.values()].map((a) => ({
      provider: a.provider,
      ops: [...a.ops].sort(),
      requiresSecret: a.requiresSecret,
      secretName: a.secretName,
    }));
  }

  breakerFor(provider: string): CircuitBreaker {
    let b = this.breakers.get(provider);
    if (b === undefined) {
      b = new CircuitBreaker(provider, this.clock, { threshold: this.breakerThreshold, cooldownMs: this.breakerCooldownMs });
      this.breakers.set(provider, b);
    }
    return b;
  }

  /** Diagnostics snapshot of all live breakers. */
  breakerSnapshots(): Array<{ provider: string; state: string; consecutiveFailures: number }> {
    return [...this.breakers.values()].map((b) => {
      const s = b.snapshot();
      return { provider: s.provider, state: s.state, consecutiveFailures: s.consecutiveFailures };
    });
  }

  /**
   * Invoke a model through the single gate. Journaled order is exactly:
   * budget pre-check failure → gateway.invoke.failed; broker decision →
   * (secret decision) → invocation → gateway.invoke.recorded|failed.
   */
  async invoke(host: GatewayHost, input: GatewayInvokeInput): Promise<InvocationResult> {
    const { provider } = parseModelId(input.request.model);
    const adapter = this.adapters.get(provider);
    if (adapter === undefined) {
      throw new VaerionError("E1700", `no adapter registered for provider "${provider}"`, { model: input.request.model });
    }
    if (!adapter.ops.has(input.request.op)) {
      throw new VaerionError("E1701", `provider "${provider}" does not implement op "${input.request.op}" (declared: ${[...adapter.ops].join(", ")})`, { model: input.request.model, op: input.request.op });
    }
    this.assertShape(input.request);

    // Budget pre-check: already over ⇒ refuse BEFORE spending more (loud).
    this.precheckBudget(input.budget);

    const startedMs = this.clock.nowMs();
    const model = input.request.model;

    // 1. Broker decision for the invocation itself (decide → journal → act).
    const action = {
      op: input.request.op,
      model,
      message_count: input.request.messages?.length ?? null,
      input_chars: input.request.op === "embed" ? (input.request.input ?? []).join("").length : null,
      documents: input.request.op === "rerank" ? (input.request.documents ?? []).length : null,
      max_output_tokens: input.request.maxOutputTokens ?? null,
    };
    const invokeDecision = await host.decide(
      {
        request_id: input.requestId,
        principal: input.principal,
        domain: "model.invoke",
        scope: model,
        action,
        intent: input.intent,
      },
      input.policy,
    );
    if (invokeDecision.decision.kind === "deny") {
      throw new VaerionError(invokeDecision.decision.reason_code, `model.invoke denied by broker: ${invokeDecision.decision.reason}`, { model, decision_id: invokeDecision.record.decision_id });
    }
    if (invokeDecision.decision.kind === "prompt") {
      if (invokeDecision.gate === undefined) {
        throw new VaerionError("E1900", "prompt decision returned without a gate record");
      }
      throw new GatewayGatePrompt(invokeDecision.decision, invokeDecision.record, invokeDecision.gate);
    }
    const decisionId = invokeDecision.record.decision_id;

    const fail = async (code: "E1704" | "E1705" | "E1702" | "E1706" | "E1601", message: string, detail: Record<string, unknown>): Promise<never> => {
      await host.emit(
        "gateway.invoke.failed",
        { model, provider, op: input.request.op, error_code: code, message, decision_id: decisionId, ...detail },
        input.principal,
        { kind: "decision", ref: decisionId },
      );
      throw new VaerionError(code, message, detail);
    };

    // 2. Secret resolution — broker-mediated, resolved ONLY at call time.
    let secret: string | null = null;
    if (adapter.requiresSecret && adapter.secretName !== null) {
      const secretDecision = await host.decide(
        {
          request_id: this.idGen.next(),
          principal: input.principal,
          domain: "secret.read",
          scope: adapter.secretName,
          action: { name: adapter.secretName },
          intent: `resolve credential ${adapter.secretName} for ${model} invocation (value never journaled)`,
        },
        input.policy,
      );
      if (secretDecision.decision.kind === "deny") {
        throw new VaerionError(secretDecision.decision.reason_code, `secret.read denied by broker: ${secretDecision.decision.reason}`, { name: adapter.secretName, decision_id: secretDecision.record.decision_id });
      }
      if (secretDecision.decision.kind === "prompt") {
        if (secretDecision.gate === undefined) throw new VaerionError("E1900", "prompt decision returned without a gate record");
        throw new GatewayGatePrompt(secretDecision.decision, secretDecision.record, secretDecision.gate);
      }
      const resolved = await this.secrets.resolve(adapter.secretName);
      secret = requireResolvedSecret(adapter.secretName, resolved);
    }

    // 3. Breaker gate (R-MG2): an open breaker is a loud refusal.
    const breaker = this.breakerFor(provider);
    try {
      breaker.admit();
    } catch (err) {
      return fail("E1705", (err as Error).message, { provider });
    }

    // 4. Act: establish the stream (retryable) then consume (never retried).
    const ctx: ProviderContext = { clock: this.clock, rng: this.rng, transport: this.transport, secret };
    // R-MG5 outbound middleware: scrub secret-shaped values from the payload
    // before it reaches the adapter/transport. Deterministic (kernel law).
    const outbound: ModelRequest = redactDeep({
      ...input.request,
      messages: input.request.messages?.map((m) => ({ ...m })),
      input: input.request.input ? [...input.request.input] : undefined,
    });
    const retries = new TransportRetries(this.retry, this.clock, this.rng, this.sleep);
    let frames: StreamFrame[];
    let attempts: number;
    try {
      const framesIterable = await retries.run(() => adapter.open(outbound, ctx));
      attempts = retries.attemptsUsed;
      frames = await collectFrames(framesIterable);
    } catch (err) {
      breaker.recordFailure();
      const code = err instanceof VaerionError && (err.code === "E1706" || err.code === "E1601") ? err.code : "E1702";
      return fail(code, (err as Error).message, { provider, attempts: retries.attemptsUsed });
    }
    breaker.recordSuccess();

    // 5. Meter (R-MG3): usage frames → usage; price table → integer cost.
    const usage = lastUsage(frames);
    const cost = usage !== null ? costOf(model, input.request.op, usage) : null;
    const stopReason = lastStopReason(frames);
    const text = assembleText(frames);
    const latencyMs = Math.max(0, this.clock.nowMs() - startedMs);

    // 6. Journal the completed invocation (R-MG3/R-RT2: the full metering
    //    payload is journaled so rollups fold from the journal alone).
    await host.emit(
      "gateway.invoke.recorded",
      {
        model,
        provider,
        op: input.request.op,
        decision_id: decisionId,
        usage,
        cost,
        attempts,
        latency_ms: latencyMs,
        stop_reason: stopReason,
        text_hash: text.length > 0 ? blake3HexOf(text) : null,
        // R-MG5: the journaled text is redacted — secrets never persist.
        text: redactDeep(text),
        frames: frames.length,
      },
      input.principal,
      { kind: "decision", ref: decisionId },
    );

    // 7. Post-budget check: the spend is real and journaled; over budget is
    //    a loud stop with a repair hint, never a silent continue.
    this.postcheckBudget(input.budget, usage, cost, model, decisionId);

    return {
      model,
      provider,
      op: input.request.op,
      text,
      frames,
      usage,
      cost,
      stopReason,
      attempts,
      latencyMs,
      textHash: text.length > 0 ? blake3HexOf(text) : null,
    };
  }

  private assertShape(req: ModelRequest): void {
    if (req.op === "chat" && (req.messages === undefined || req.messages.length === 0)) {
      throw new VaerionError("E1702", "chat invocation requires at least one message");
    }
    if (req.op === "embed" && (req.input === undefined || req.input.length === 0)) {
      throw new VaerionError("E1702", "embed invocation requires non-empty input");
    }
    if (req.op === "rerank" && ((req.query ?? "").length === 0 || (req.documents ?? []).length === 0)) {
      throw new VaerionError("E1702", "rerank invocation requires query and documents");
    }
  }

  private precheckBudget(budget: BudgetGuard): void {
    if (budget.tokensPerRun !== undefined && budget.tokensUsed >= budget.tokensPerRun) {
      throw new VaerionError(
        "E1703",
        `run token budget exhausted before invocation (${budget.tokensUsed}/${budget.tokensPerRun})`,
        { tokensUsed: budget.tokensUsed, tokensPerRun: budget.tokensPerRun },
      );
    }
    if (budget.microUsdPerRun !== undefined && budget.microUsdUsed >= budget.microUsdPerRun) {
      throw new VaerionError(
        "E1703",
        `run budget exhausted before invocation (${budget.microUsdUsed}/${budget.microUsdPerRun} micro-USD)`,
        { microUsdUsed: budget.microUsdUsed, microUsdPerRun: budget.microUsdPerRun },
      );
    }
  }

  private postcheckBudget(budget: BudgetGuard, usage: TokenUsage | null, cost: { totalMicroUsd: number } | null, model: string, decisionId: string): void {
    if (budget.tokensPerRun !== undefined && usage !== null && budget.tokensUsed + usage.inputTokens + usage.outputTokens > budget.tokensPerRun) {
      throw new VaerionError(
        "E1703",
        `run token budget exceeded by this invocation (${budget.tokensUsed} used + ${usage.inputTokens + usage.outputTokens} > ${budget.tokensPerRun}); the invocation completed and is journaled — raise the budget in vaerion.yaml or start a new run`,
        { tokensUsed: budget.tokensUsed, tokensPerRun: budget.tokensPerRun, model, decision_id: decisionId },
      );
    }
    if (budget.microUsdPerRun !== undefined && cost !== null && budget.microUsdUsed + cost.totalMicroUsd > budget.microUsdPerRun) {
      throw new VaerionError(
        "E1703",
        `run micro-USD budget exceeded by this invocation (${budget.microUsdUsed} used + ${cost.totalMicroUsd} > ${budget.microUsdPerRun}); the invocation completed and is journaled — raise the budget in vaerion.yaml or start a new run`,
        { microUsdUsed: budget.microUsdUsed, microUsdPerRun: budget.microUsdPerRun, model, decision_id: decisionId },
      );
    }
  }
}

async function collectFrames(iter: AsyncIterable<StreamFrame>): Promise<StreamFrame[]> {
  const frames: StreamFrame[] = [];
  for await (const frame of iter) frames.push(frame);
  return frames;
}

function lastUsage(frames: readonly StreamFrame[]): TokenUsage | null {
  let usage: TokenUsage | null = null;
  for (const f of frames) if (f.type === "usage") usage = { inputTokens: f.inputTokens, outputTokens: f.outputTokens };
  return usage;
}

function lastStopReason(frames: readonly StreamFrame[]): string | null {
  let stop: string | null = null;
  for (const f of frames) if (f.type === "done") stop = f.stopReason;
  return stop;
}
