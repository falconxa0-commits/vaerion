/**
 * Vaerion — tool invocation pipeline (MS-4).
 *
 * EVERY tool invocation in the engine crosses this service, and the flow is
 * the broker flow, unchanged:
 *
 *     declare → validate → requested (journaled) → decide (tool.exec) →
 *     journal → execute → completed | denied (journaled)
 *
 * Constitutional law enforced here:
 *   - Declared-before-used: a tool that is not declared in the workspace is
 *     refused fail-closed BEFORE any decision (E1801) — undeclared tools
 *     never reach the broker, exactly like unknown models at the gateway.
 *   - Typed arguments: args are validated against the tool's declared shape
 *     (E1802) before the pipeline starts.
 *   - decide → journal → act: the broker decision (domain `tool.call`) is
 *     journaled by the harness BEFORE the executor runs; denials are
 *     journaled AND refusal-logged (never silent); prompt decisions open a
 *     durable gate and PAUSE (the caller owns the human authority UX).
 *   - Receipts + replay: every completed call journals the blake3 result
 *     hash (and the blob_ref when a CAS is supplied), so results are
 *     content-addressed and the call is replayable from the journal alone.
 *
 * The service is pure with respect to execution: executors are injected
 * (builtin deterministic tools ship with the engine; anything else is bound
 * by the host process), so hermetic tests never touch real effects.
 */

import { blake3HexOf } from "../kernel/hash.ts";
import { redactDeep } from "../kernel/redact.ts";
import { VaerionError } from "../kernel/errors.ts";
import type { Clock } from "../kernel/clock.ts";
import type { Actor, Cause } from "../spine/envelope.ts";
import type { Principal } from "../broker/contracts/principal.ts";
import type { DecisionRequest, BrokerDecision, BrokerDecisionRecord, PolicyContract } from "../broker/contracts/decision.ts";
import type { GateRecord } from "../broker/contracts/gate.ts";
import type { BlobStore, BlobRef } from "../store/blob-cas.ts";
import type { ToolDeclarationConfig } from "../config/config.ts";
import { canonicalJson } from "../kernel/canonical.ts";

/** The port the tool pipeline needs from a run (RunHarness satisfies it). */
export interface ToolHost {
  decide(req: DecisionRequest, policy: PolicyContract): Promise<{ decision: BrokerDecision; record: BrokerDecisionRecord; gate?: GateRecord }>;
  emit(type: string, payload: Record<string, unknown>, actor?: Actor, cause?: Cause): Promise<number>;
  journal: { readonly lastSeq: number };
}

/** Thrown when the broker answers `prompt` — the caller owns the gate UX. */
export class ToolGatePrompt extends Error {
  readonly decision: Extract<BrokerDecision, { kind: "prompt" }>;
  readonly record: BrokerDecisionRecord;
  readonly gate: GateRecord;
  constructor(decision: Extract<BrokerDecision, { kind: "prompt" }>, record: BrokerDecisionRecord, gate: GateRecord) {
    super(decision.reason);
    this.name = "ToolGatePrompt";
    this.decision = decision;
    this.record = record;
    this.gate = gate;
  }
}

/** A declared tool: the ONLY tools that can ever be authorized. */
export interface ToolDeclaration {
  name: string;
  /** Broker scope for the tool.exec decision (defaults to the tool name). */
  scope: string;
  description: string | null;
}

/** Argument shape: key → primitive expectation. Declared keys are REQUIRED
 *  (missing ⇒ E1802); append "?" to make a key optional (e.g. "number?"). */
export type ToolArgsSchema = Record<string, string>; // "string" | "number" | "boolean" | "string[]" | "number[]" | "any" (optional: "…?")

/** Deterministic executor port. Args are pre-validated; output must be JSON-safe. */
export interface ToolExecutor {
  readonly args: ToolArgsSchema;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>>;
}

export interface ToolContext {
  clock: Clock;
  idGen: { next(): string };
}

export interface ToolInvokeInput {
  tool: string;
  args: Record<string, unknown>;
  principal: Principal;
  policy: PolicyContract;
  /** Request id for the broker decision (ULID from the caller's id port). */
  requestId: string;
  /** Stated intent — required, like every broker request. */
  intent: string;
}

export interface ToolInvokeResult {
  tool: string;
  scope: string;
  ok: true;
  /** blake3 over the canonical JSON of the (redacted) result — replay anchor. */
  resultHash: string;
  /** Content-addressed result when a blob store was supplied. */
  blobRef: BlobRef | null;
  result: Record<string, unknown>;
}

/* ───────────────────────────  builtin executors  ─────────────────────────── */

/**
 * Deterministic builtins. `echo` returns its input; `clock.read` reads the
 * INJECTED clock (hermetic under FixedClock); `research.search` queries an
 * injected LocalIndex and returns journal-safe integer milli-scores.
 */
export const echoTool: ToolExecutor = {
  args: { value: "any?" },
  async execute(args) {
    return { echoed: args.value ?? null };
  },
};

export const clockReadTool: ToolExecutor = {
  args: {},
  async execute(_args, ctx) {
    return { now_ms: ctx.clock.nowMs(), now_iso: ctx.clock.nowIso() };
  },
};

/** Minimal structural surface of a LocalIndex hit (avoids an L1 import). */
export interface SearchHit {
  doc_id: string;
  score: number;
  matched_terms: string[];
}

export interface SearchableIndex {
  query(text: string, limit?: number): SearchHit[];
}

export function researchSearchTool(index: SearchableIndex): ToolExecutor {
  return {
    args: { query: "string", limit: "number?" },
    async execute(args) {
      const query = String(args.query ?? "");
      if (query.length === 0) {
        throw new VaerionError("E1802", "research.search requires a non-empty query");
      }
      const limit = args.limit === undefined ? undefined : Number(args.limit);
      const hits = index.query(query, limit);
      return {
        query,
        // Journal-safe integers: canonicalJson rejects floats (E1901 law).
        hits: hits.map((h) => ({ doc_id: h.doc_id, score_milli: Math.round(h.score * 1000), matched_terms: [...h.matched_terms] })),
      };
    },
  };
}

/* ──────────────────────────────  the registry  ────────────────────────────── */

export class ToolRegistry {
  private readonly byName = new Map<string, ToolDeclaration>();

  constructor(decls: ReadonlyArray<ToolDeclaration>) {
    for (const d of decls) {
      if (!/^[a-z][a-z0-9._-]{0,62}$/.test(d.name)) {
        throw new VaerionError("E1600", `tool declaration name invalid: ${d.name}`);
      }
      if (this.byName.has(d.name)) {
        throw new VaerionError("E1600", `duplicate tool declaration: ${d.name}`);
      }
      this.byName.set(d.name, d);
    }
  }

  static fromConfig(decls: ReadonlyArray<ToolDeclarationConfig>): ToolRegistry {
    return new ToolRegistry(
      decls.map((d) => ({ name: d.name, scope: d.scope ?? d.name, description: d.description ?? null })),
    );
  }

  declaration(name: string): ToolDeclaration | undefined {
    return this.byName.get(name);
  }

  declared(): ToolDeclaration[] {
    return [...this.byName.values()];
  }

  /** Validate args against the executor's declared shape (fail-closed E1802).
   *  Declared keys are required unless suffixed "?"; unknown keys are drift. */
  validateArgs(executor: ToolExecutor, tool: string, args: Record<string, unknown>): void {
    if (args === null || typeof args !== "object" || Array.isArray(args)) {
      throw new VaerionError("E1802", `tool ${tool} args must be a JSON object`, { tool });
    }
    for (const [rawKey, rawKind] of Object.entries(executor.args)) {
      const optional = rawKind.endsWith("?");
      const kind = optional ? rawKind.slice(0, -1) : rawKind;
      const v = (args as Record<string, unknown>)[rawKey];
      if (v === undefined) {
        if (!optional) {
          throw new VaerionError("E1802", `tool ${tool} is missing required arg "${rawKey}"`, { tool, key: rawKey });
        }
        continue;
      }
      const ok =
        kind === "any" ||
        (kind === "string" && typeof v === "string") ||
        (kind === "number" && typeof v === "number" && Number.isFinite(v)) ||
        (kind === "boolean" && typeof v === "boolean") ||
        (kind === "string[]" && Array.isArray(v) && v.every((x) => typeof x === "string")) ||
        (kind === "number[]" && Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x)));
      if (!ok) {
        throw new VaerionError("E1802", `tool ${tool} args[${rawKey}] expected ${kind}, got ${Array.isArray(v) ? "array" : typeof v}`, { tool, key: rawKey });
      }
    }
    // Unknown keys are config drift, not arg flexibility.
    for (const key of Object.keys(args)) {
      if (!(key in executor.args)) {
        throw new VaerionError("E1802", `tool ${tool} received undeclared arg "${key}" (declared: ${Object.keys(executor.args).join(", ") || "none"})`, { tool, key });
      }
    }
  }
}

/* ────────────────────────────  the pipeline  ──────────────────────────── */

export interface ToolInvocationServiceOptions {
  clock: Clock;
  idGen: { next(): string };
  registry: ToolRegistry;
  /** Executors bound in this process (builtin or host-provided). */
  executors: ReadonlyMap<string, ToolExecutor>;
  /** Optional CAS: completed results are content-addressed (receipts law). */
  blobStore?: BlobStore | null;
}

export class ToolInvocationService {
  private readonly clock: Clock;
  private readonly idGen: { next(): string };
  private readonly registry: ToolRegistry;
  private readonly executors: ReadonlyMap<string, ToolExecutor>;
  private readonly blobStore: BlobStore | null;

  constructor(opts: ToolInvocationServiceOptions) {
    if (!opts || !opts.clock || !opts.idGen || !opts.registry || !opts.executors) {
      throw new VaerionError("E1600", "ToolInvocationService: clock, idGen, registry, executors required");
    }
    this.clock = opts.clock;
    this.idGen = opts.idGen;
    this.registry = opts.registry;
    this.executors = opts.executors;
    this.blobStore = opts.blobStore ?? null;
  }

  /**
   * Invoke a tool through the broker pipeline. Journal order is exactly:
   * requested → decision (journaled by the harness) → completed | denied.
   * A prompt decision throws ToolGatePrompt AFTER the durable gate is open.
   */
  async invoke(host: ToolHost, input: ToolInvokeInput): Promise<ToolInvokeResult> {
    const declaration = this.registry.declaration(input.tool);
    if (declaration === undefined) {
      // Fail-closed BEFORE any journaling: an undeclared tool never reaches
      // the broker (mirror of the gateway's unknown-model law, E1700).
      throw new VaerionError("E1801", `tool "${input.tool}" is not declared in this workspace`, {
        tool: input.tool,
        declared: this.registry.declared().map((d) => d.name),
      });
    }
    const executor = this.executors.get(input.tool);
    if (executor === undefined) {
      throw new VaerionError("E1600", `tool "${input.tool}" is declared but has no executor bound in this process`, { tool: input.tool });
    }
    this.registry.validateArgs(executor, input.tool, input.args);

    const cause: Cause = { kind: "envelope", ref: String(host.journal.lastSeq) };
    await host.emit(
      "tool.call.requested",
      { tool: input.tool, scope: declaration.scope, args: redactDeep(input.args) as Record<string, unknown> },
      input.principal,
      cause,
    );

    const decision = await host.decide(
      {
        request_id: input.requestId,
        principal: input.principal,
        domain: "tool.call",
        scope: declaration.scope,
        action: { tool: input.tool, args: redactDeep(input.args) as Record<string, unknown> },
        intent: input.intent,
      },
      input.policy,
    );
    if (decision.decision.kind === "deny") {
      await host.emit(
        "tool.call.denied",
        {
          tool: input.tool,
          scope: declaration.scope,
          error_code: decision.decision.reason_code,
          reason: decision.decision.reason,
          decision_id: decision.record.decision_id,
        },
        input.principal,
        { kind: "decision", ref: decision.record.decision_id },
      );
      throw new VaerionError(decision.decision.reason_code, `tool.exec denied by broker: ${decision.decision.reason}`, { tool: input.tool, decision_id: decision.record.decision_id });
    }
    if (decision.decision.kind === "prompt") {
      if (decision.gate === undefined) {
        throw new VaerionError("E1900", "prompt decision returned without a gate record");
      }
      throw new ToolGatePrompt(decision.decision, decision.record, decision.gate);
    }

    // Act: the decision is journaled; execution happens now.
    let result: Record<string, unknown>;
    try {
      result = await executor.execute(input.args, { clock: this.clock, idGen: this.idGen });
    } catch (err) {
      // Executor failure AFTER authorization: journal the terminal state
      // honestly (completed-with-failure) — failures are never silent.
      const code = err instanceof VaerionError ? err.code : "E1900";
      await host.emit(
        "tool.call.completed",
        {
          tool: input.tool,
          scope: declaration.scope,
          ok: false,
          error_code: code,
          message: (err as Error).message.slice(0, 200),
          decision_id: decision.record.decision_id,
        },
        input.principal,
        { kind: "decision", ref: decision.record.decision_id },
      );
      throw err;
    }

    const safeResult = redactDeep(result) as Record<string, unknown>;
    const resultJson = canonicalJson(safeResult);
    const resultHash = await blake3HexOf(resultJson);
    let blobRef: BlobRef | null = null;
    if (this.blobStore !== null) {
      blobRef = await this.blobStore.put(resultJson);
      await host.emit("store.blob.put", { blob_ref: blobRef, purpose: `tool_result:${input.tool}` }, input.principal, { kind: "envelope", ref: String(host.journal.lastSeq) });
    }
    await host.emit(
      "tool.call.completed",
      {
        tool: input.tool,
        scope: declaration.scope,
        ok: true,
        result_hash: resultHash,
        blob_ref: blobRef,
        result: safeResult,
        decision_id: decision.record.decision_id,
      },
      input.principal,
      { kind: "decision", ref: decision.record.decision_id },
    );
    return { tool: input.tool, scope: declaration.scope, ok: true, resultHash, blobRef, result: safeResult };
  }
}
