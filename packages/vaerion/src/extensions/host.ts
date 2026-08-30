/**
 * Vaerion — extension host (MS-5, ADR-0009 contingency R-2).
 *
 * Extensions are UNTRUSTED code. The ratified substrate is WASI Preview 2
 * components; this host is the R-2 FALLBACK that shares the same broker
 * semantics today: the extension runs as a SUBPROCESS speaking the published
 * world (spec/wit/vaerion-extension@0.1.0.wit) over line-delimited JSON on
 * stdio, with:
 *
 *   - digest pinning: the artifact is sha256-verified BEFORE any execution
 *     (mismatch ⇒ E2100, the artifact never runs);
 *   - an EMPTY environment and no ambient powers: the process gets stdin/
 *     stdout/stderr and nothing else;
 *   - the broker bridge: every host call is a decide→journal→act evaluation
 *     with the EXTENSION as principal (extensions are just principals);
 *   - fail-closed protocol law: the first protocol violation (bad handshake,
 *     unknown frame, oversized line, unsolicited response, budget overrun)
 *     kills the process (E2102); timeouts kill (E2103).
 *
 * The host itself never trusts a frame: sizes are capped, ids are matched,
 * and the process lifecycle is journaled (extension.spawned/exited).
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { VaerionError } from "../kernel/errors.ts";
import type { Clock } from "../kernel/clock.ts";
import type { Principal } from "../broker/contracts/principal.ts";
import type { PolicyContract } from "../broker/contracts/decision.ts";
import type { PermissionGraph } from "../broker/contracts/permission-graph.ts";
import { redactDeep } from "../kernel/redact.ts";
import type { ToolExecutor } from "../agents/tools.ts";

/** The world this host speaks (spec/wit/vaerion-extension@0.1.0.wit). */
export const EXTENSION_WORLD = "vaerion:extension@0.1.0";
const PROTOCOL_VERSION = 1;
const MAX_FRAME_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_HOST_CALLS = 16;

/** A builtin the host bridge may reach on an extension's behalf. */
export interface BuiltinBinding {
  executor: ToolExecutor;
  /** Broker scope for the tool.call decision (the declaration's scope). */
  scope: string;
}

export interface ExtensionHostContext {
  /** The run port (RunHarness satisfies it): decide + emit + journal. */
  host: {
    decide(req: {
      request_id: string;
      principal: Principal;
      domain: string;
      scope: string;
      action: Record<string, unknown>;
      intent: string;
    }, policy: PolicyContract, graph?: PermissionGraph | null): Promise<unknown>;
    emit(type: string, payload: Record<string, unknown>, actor?: { kind: string; id: string }, cause?: { kind: string; ref: string | null }): Promise<number>;
    journal: { readonly lastSeq: number };
  };
  policy: PolicyContract;
  graph?: PermissionGraph | null;
  clock: Clock;
  idGen: { next(): string };
  /** The builtins this process may bridge to (fail-closed: anything else is refused). */
  builtins: ReadonlyMap<string, BuiltinBinding>;
}

export interface ExtensionLaunch {
  name: string;
  artifact: string;
  digest: string;
  timeoutMs?: number;
  maxHostCalls?: number;
}

/** sha256 of a file, streamed (the pin law: verify BEFORE execute). */
export async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** Verify the pinned digest; a mismatch NEVER executes the artifact. */
export async function verifyArtifactPin(launch: ExtensionLaunch): Promise<void> {
  const actual = await sha256File(launch.artifact).catch(() => {
    throw new VaerionError("E2104", `extension ${launch.name}: artifact not readable: ${launch.artifact}`);
  });
  const pinned = launch.digest.replace(/^sha256:/, "");
  if (actual !== pinned) {
    throw new VaerionError("E2100", `extension ${launch.name}: artifact digest mismatch (pinned ${pinned.slice(0, 12)}…, actual ${actual.slice(0, 12)}…) — the artifact was NOT executed`, { extension: launch.name });
  }
}

type Frame = Record<string, unknown>;

/** One running extension process: handshake → [invoke rounds] → exit. */
class ExtensionProcess {
  private readonly child: ReturnType<typeof Bun.spawn>;
  private readonly queue: Frame[] = [];
  private stdoutError: Error | null = null;
  private stdoutDone = false;
  private readonly waiters: Array<() => void> = [];
  private readonly exited: Promise<number | null>;
  readonly pid: number;

  constructor(launch: ExtensionLaunch, readonly name: string, readonly principalId: string, private readonly clock: Clock) {
    try {
      this.child = Bun.spawn([launch.artifact], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: {}, // NO ambient environment (ADR-0009: no ambient powers)
      });
    } catch (err) {
      throw new VaerionError("E2104", `extension ${launch.name}: spawn failed: ${(err as Error).message.slice(0, 120)}`);
    }
    this.pid = this.child.pid;
    this.exited = this.child.exited as Promise<number | null>;
    void this.pumpStdout();
    void this.pumpStderr();
  }

  private pumpStdout(): void {
    const reader = (this.child.stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    void (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Fail-closed frame cap: an oversized line is a protocol violation.
        if (buffer.length > MAX_FRAME_BYTES) {
          this.violate("extension sent an oversized frame (>1MB)");
          return;
        }
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line.length === 0) continue;
          this.handleLine(line);
        }
      }
      this.stdoutDone = true;
      this.wake();
    })().catch(() => {
      this.stdoutDone = true;
      this.wake();
    });
  }

  /** Route one child line into the queue; unparseable lines are drift.
   *  Frame-type validation belongs to the consuming phase (handshake expects
   *  `ready`; invoke expects `result`/`host`) — not to the pump. */
  private handleLine(line: string): void {
    let frame: Frame;
    try {
      frame = JSON.parse(line) as Frame;
    } catch {
      this.violate("unparseable frame");
      return;
    }
    if (frame !== null && typeof frame === "object") {
      this.queue.push(frame);
      this.wake();
      return;
    }
    this.violate("frame is not a JSON object");
  }

  private pumpStderr(): void {
    const reader = (this.child.stderr as ReadableStream<Uint8Array>).getReader();
    void (async () => {
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
        // stderr is captured and discarded: extension diagnostics never
        // cross the spine unstructured (the journal carries the events).
      }
    })().catch(() => undefined);
  }

  private wake(): void {
    for (const w of this.waiters.splice(0)) w();
  }

  private violate(why: string): void {
    this.kill();
    if (this.stdoutError === null) {
      this.stdoutError = new VaerionError("E2102", `extension protocol violation: ${why}`);
    }
    this.stdoutDone = true;
    this.wake();
  }

  private async nextFrame(deadline: number): Promise<Frame | null> {
    for (;;) {
      if (this.stdoutError !== null) throw this.stdoutError;
      const frame = this.queue.shift();
      if (frame !== undefined) return frame;
      if (this.stdoutDone) return null;
      if (this.clock.nowMs() > deadline) {
        this.kill();
        throw new VaerionError("E2103", `extension ${this.name} exceeded its time budget`);
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 20);
      });
    }
  }

  kill(): void {
    try {
      this.child.kill();
    } catch {
      /* already gone */
    }
  }

  async exitCode(): Promise<number | null> {
    return this.exited;
  }

  /** Handshake: the child must announce the exact world and protocol version. */
  async handshake(launch: ExtensionLaunch, timeoutMs: number): Promise<void> {
    const deadline = this.clock.nowMs() + timeoutMs;
    let frame: Frame | null;
    try {
      frame = await this.nextFrame(deadline);
    } catch (err) {
      this.kill();
      throw err;
    }
    if (frame === null) {
      this.kill();
      const code = await this.exitCode();
      throw new VaerionError("E2102", `extension ${launch.name} exited before handshake (code ${code ?? "signal"})`);
    }
    if (frame.type !== "ready" || frame.v !== PROTOCOL_VERSION || frame.world !== EXTENSION_WORLD) {
      this.kill();
      throw new VaerionError("E2102", `extension ${launch.name} handshake rejected: expected {"type":"ready","v":${PROTOCOL_VERSION},"world":"${EXTENSION_WORLD}"}, got ${JSON.stringify(frame).slice(0, 120)}`);
    }
    // Drift after ready (a second handshake, stray frames) is rejected by
    // the invoke loop's type checks from here on.
    if (typeof frame !== "object") {
      this.kill();
      throw new VaerionError("E2102", `extension ${launch.name} sent a non-object frame`);
    }
  }

  /** One invoke round-trip with host-function bridging. */
  async invoke(input: {
    launch: ExtensionLaunch;
    callId: string;
    args: Record<string, unknown>;
    ctx: ExtensionHostContext;
  }): Promise<Record<string, unknown>> {
    const { launch, callId, args, ctx } = input;
    const timeoutMs = launch.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxHostCalls = launch.maxHostCalls ?? DEFAULT_MAX_HOST_CALLS;
    const deadline = ctx.clock.nowMs() + timeoutMs;
    this.send({ type: "invoke", call_id: callId, args: redactDeep(args) as Record<string, unknown> });
    let hostCalls = 0;
    for (;;) {
      if (ctx.clock.nowMs() > deadline) {
        this.kill();
        throw new VaerionError("E2103", `extension ${launch.name} exceeded ${timeoutMs}ms (invoke ${callId})`);
      }
      let frame: Frame;
      try {
        const next = await this.nextFrame(deadline);
        if (next === null) {
          this.kill();
          throw new VaerionError("E2102", `extension ${launch.name} exited mid-invoke (no result for ${callId})`);
        }
        frame = next;
      } catch (err) {
        this.kill();
        throw err;
      }
      if (frame.type === "result") {
        if (frame.call_id !== callId) {
          this.kill();
          throw new VaerionError("E2102", `extension ${launch.name} answered an unsolicited call_id`);
        }
        if (frame.ok === true) {
          const value = frame.value;
          if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
            this.kill();
            throw new VaerionError("E2102", `extension ${launch.name} result must be a JSON object`);
          }
          return value as Record<string, unknown>;
        }
        const err = (frame.error ?? {}) as { code?: unknown; message?: unknown };
        // Child-reported errors are DIAGNOSTICS, not engine codes: they are
        // wrapped (never trusted as catalog identities).
        throw new VaerionError("E1600", `extension ${launch.name} failed: ${String(err.message ?? "unknown error").slice(0, 160)}`, { extension_error: String(err.code ?? "unknown") });
      }
      if (frame.type === "host") {
        hostCalls++;
        if (hostCalls > maxHostCalls) {
          this.kill();
          throw new VaerionError("E2102", `extension ${launch.name} exceeded its host-call budget (${maxHostCalls})`);
        }
        const response = await this.bridgeHostCall(frame, ctx);
        this.send(response);
        continue;
      }
      this.kill();
      throw new VaerionError("E2102", `extension ${launch.name} sent unexpected frame type ${String(frame.type)}`);
    }
  }

  /** The broker bridge: decide → journal → act with the EXTENSION as principal. */
  private async bridgeHostCall(frame: Frame, ctx: ExtensionHostContext): Promise<Frame> {
    const callId = typeof frame.call_id === "string" ? frame.call_id : null;
    if (callId === null) {
      this.kill();
      throw new VaerionError("E2102", "host frame without call_id");
    }
    const hostFn = frame.host_fn;
    if (hostFn !== "tool.call") {
      this.kill();
      throw new VaerionError("E2102", `unknown host_fn ${String(hostFn)} (world ${EXTENSION_WORLD} defines tool.call only)`);
    }
    const tool = typeof frame.tool === "string" ? frame.tool : "";
    const args = (frame.args && typeof frame.args === "object" && !Array.isArray(frame.args) ? frame.args : {}) as Record<string, unknown>;
    const respondError = (code: string, message: string): Frame => ({ type: "result", call_id: callId, ok: false, error: { code, message } });
    const builtin = ctx.builtins.get(tool);
    if (!builtin) {
      // Not bridgeable: the extension receives a loud refusal and lives on —
      // the process is healthy; its POWER request was refused.
      return respondError("E1801", `tool "${tool}" is not bridgeable (not a declared builtin)`);
    }
    const principal: Principal = { kind: "extension", id: this.principalId };
    // decide → journal → act: the decision (and any refusal) is on the spine.
    const decision = (await ctx.host.decide(
      {
        request_id: ctx.idGen.next(),
        principal,
        domain: "tool.call",
        scope: builtin.scope,
        action: { tool, args: redactDeep(args) as Record<string, unknown>, via: "extension-bridge" },
        intent: `extension bridge ${this.name}: ${tool}`,
      },
      ctx.policy,
      ctx.graph,
    )) as { decision: { kind: string } };
    const kind = decision.decision.kind;
    if (kind === "allow") {
      try {
        const value = await builtin.executor.execute(args, { clock: ctx.clock, idGen: ctx.idGen });
        return { type: "result", call_id: callId, ok: true, value };
      } catch (err) {
        return respondError("E1600", `builtin ${tool} failed: ${(err as Error).message.slice(0, 120)}`);
      }
    }
    if (kind === "deny") {
      return respondError("E1300", "the broker denied the extension's host call (see the refusal log)");
    }
    // prompt: the alpha does not suspend an extension mid-process for a
    // durable gate; the decision IS journaled (the human sees it in the
    // run record) and the extension receives an explicit refusal.
    return respondError("E1302", "the broker requested human approval; prompts are not continuable inside an extension process (the decision is journaled)");
  }

  private send(frame: Frame): void {
    const stdin = this.child.stdin as unknown as { write: (s: string) => unknown; flush?: () => unknown };
    stdin.write(JSON.stringify(frame) + "\n");
    stdin.flush?.();
  }
}

export interface ExtensionRunResult {
  value: Record<string, unknown>;
  exitCode: number | null;
}

/**
 * Execute one extension invocation end-to-end:
 * verify pin → spawn → journal extension.spawned → handshake → invoke →
 * journal extension.exited → return the result. Every failure path kills
 * the process first, then throws the honest code.
 */
export async function runExtension(input: {
  launch: ExtensionLaunch;
  args: Record<string, unknown>;
  ctx: ExtensionHostContext;
  callId: string;
}): Promise<ExtensionRunResult> {
  const { launch, args, ctx, callId } = input;
  const timeoutMs = launch.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  await verifyArtifactPin(launch);
  const proc = new ExtensionProcess(launch, launch.name, `extension:${launch.name}`, ctx.clock);
  const actor = { kind: "extension", id: `extension:${launch.name}` };
  await ctx.host.emit(
    "extension.spawned",
    { extension: launch.name, digest: launch.digest, pid: proc.pid },
    actor,
    { kind: "envelope", ref: String(ctx.host.journal.lastSeq) },
  );
  try {
    await proc.handshake(launch, timeoutMs);
    const value = await proc.invoke({ launch, callId, args, ctx });
    proc.kill();
    const code = await proc.exitCode();
    await ctx.host.emit(
      "extension.exited",
      { extension: launch.name, code: code ?? null },
      actor,
      { kind: "envelope", ref: String(ctx.host.journal.lastSeq) },
    );
    return { value, exitCode: code };
  } catch (err) {
    proc.kill();
    const code = await proc.exitCode().catch(() => null);
    await ctx.host
      .emit("extension.exited", { extension: launch.name, code: code ?? null, failed: true }, actor, { kind: "envelope", ref: String(ctx.host.journal.lastSeq) })
      .catch(() => undefined);
    throw err;
  }
}
