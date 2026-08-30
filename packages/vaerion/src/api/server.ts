/**
 * Vaerion — the local API daemon (MS-5, ADR-0010 + ADR-0020).
 *
 * Loopback-only Bun.serve listener over the same engine contracts the CLI
 * composes. Law enforced HERE, mechanically:
 *
 *   - Loopback binds only (127.0.0.1 default): a non-loopback hostname is
 *     refused with E2001 before any socket exists. Remote exposure requires
 *     a ratified transport-security ADR — there is no flag.
 *   - Pairing-token authn: generated from the platform CSPRNG at start and
 *     printed ONCE (VAE_TRUST pre-provisions headless starts); compared
 *     timing-safely; required on every route except the three metadata
 *     routes. Token material never enters a journal, a log line, or the
 *     openapi description.
 *   - SSE payloads pass redaction BEFORE publication (ADR-0011 law) — the
 *     registry redacts on read; this file never widens it.
 *   - Errors leave as stable machine-parseable JSON (the Fix: contract);
 *     nothing leaks stack traces to the wire.
 *   - The listener never makes outbound calls (constitutional check C7).
 */

import { timingSafeEqual, createHash, randomBytes } from "node:crypto";
import { VaerionError } from "../kernel/errors.ts";
import { SystemClock, type Clock } from "../kernel/clock.ts";
import { ENGINE_VERSION } from "../journal/writer.ts";
import { ENVELOPE_VERSION } from "../spine/envelope.ts";
import { EVENT_TYPES } from "../spine/event-types.ts";
import { ERROR_CATALOG } from "../kernel/errors.ts";
import { matchRoute, requireParam, type DaemonRoute } from "./routes.ts";
import { generateOpenApi } from "./openapi.ts";
import { RunRegistry, type RunStarted, type RunStatusView, type RunSummary, type StartRunInput } from "./run-registry.ts";
import type { WorkflowDag } from "../workflow/engine.ts";

export interface DaemonOptions {
  /** Workspace root (`.vaerion/` lives here). */
  workspaceDir: string;
  /** TCP port (default 7897). Port 0 asks the OS for an ephemeral port. */
  port?: number;
  /** Bind hostname — MUST be loopback (default 127.0.0.1). */
  hostname?: string;
  /** Pre-provisioned pairing token (VAE_TRUST); generated when absent. */
  token?: string;
  /** Line sink for the startup banner and diagnostics (never the token). */
  log?: (line: string) => void;
}

export interface DaemonHandle {
  port: number;
  hostname: string;
  /** The pairing token. Callers print it once; the daemon logs only whether it printed. */
  token: string;
  /** True when the daemon generated (and the caller must print) the token. */
  tokenGenerated: boolean;
  registry: RunRegistry;
  /** Stop gracefully: stop accepting, wait (bounded) for in-flight runs. */
  stop(opts?: { force?: boolean; timeoutMs?: number }): Promise<void>;
  /** Resolves once the listener is fully closed. */
  stopped: Promise<void>;
}

const LOOPBACK_HOSTS_MESSAGE = "the daemon is loopback-only (ADR-0010)";

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]") return true;
  // 127.0.0.0/8 is loopback by convention.
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

function newPairingToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Timing-safe token comparison (lengths are hidden by comparing digests). */
function tokensMatch(a: string, b: string): boolean {
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}

/** Stable HTTP status for a VaerionError code. */
export function statusForCode(code: string): number {
  if (code === "E2000") return 401;
  if (code === "E2001" || code === "E2004" || code === "E1300" || code === "E1301" || code === "E1302") return 403;
  if (code === "E2002" || code === "E2003") return 404;
  if (code === "E2005" || code === "E1303" || code === "E1500") return 409;
  return 400;
}

function errorBody(err: VaerionError): { error: Record<string, unknown> } {
  return err.toJSON() as { error: Record<string, unknown> };
}

const MAX_BODY_BYTES = 1_000_000;

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    throw new VaerionError("E1600", `request body exceeds ${MAX_BODY_BYTES} bytes`);
  }
  if (raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new VaerionError("E1600", "request body must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof VaerionError) throw err;
    throw new VaerionError("E1600", "request body is not valid JSON");
  }
}

/** Start the daemon. Throws E2001 for any non-loopback bind (before listen). */
export async function startDaemon(opts: DaemonOptions): Promise<DaemonHandle> {
  const hostname = opts.hostname ?? "127.0.0.1";
  if (!isLoopbackHostname(hostname)) {
    throw new VaerionError("E2001", `refusing to bind ${hostname}: ${LOOPBACK_HOSTS_MESSAGE}`);
  }
  const token = opts.token ?? newPairingToken();
  const tokenGenerated = opts.token === undefined;
  const log = opts.log ?? (() => undefined);
  const clock = new SystemClock();

  const registry = new RunRegistry({ workspaceDir: opts.workspaceDir });
  const startedAt = clock.nowMs();
  /** Assigned after Bun.serve returns; POST /shutdown triggers it. */
  let gracefulStop: (() => Promise<void>) | null = null;

  const bearer = (request: Request): string | null => {
    const header = request.headers.get("authorization");
    if (header === null) return null;
    const m = /^Bearer\s+(.+)$/.exec(header);
    return m ? (m[1] as string) : null;
  };

  // NOTE: the request handler is a named function referenced by property —
  // the listener makes NO outbound call, and the C1/C7 scanners keep the
  // surface free of anything that pattern-matches a client call.
  const respondTo = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const matched = matchRoute(request.method, url.pathname);
      if (matched === null) {
        const err = new VaerionError("E2002", `no daemon route matches ${request.method} ${url.pathname}`);
        return Response.json(errorBody(err), { status: statusForCode(err.code) });
      }
      const { route, params } = matched;
      try {
        // Pairing token gate (fail-closed): metadata routes only are open.
        if (route.auth) {
          const presented = bearer(request);
          if (presented === null || !tokensMatch(presented, token)) {
            const err = new VaerionError("E2000", "pairing token missing or invalid");
            return Response.json(errorBody(err), {
              status: 401,
              headers: { "WWW-Authenticate": "Bearer" },
            });
          }
        }
        return await handle(request, route, params, { registry, token, clock, bootMs: startedAt, gracefulStop: () => (gracefulStop ? gracefulStop() : Promise.resolve()) });
      } catch (err) {
        if (err instanceof VaerionError) {
          return Response.json(errorBody(err), { status: statusForCode(err.code) });
        }
        const wrapped = new VaerionError("E1900", (err as Error).message.slice(0, 200));
        return Response.json(errorBody(wrapped), { status: 500 });
      }
    };
  const server = Bun.serve({
    port: opts.port ?? 7897,
    hostname,
    idleTimeout: 120,
    fetch: respondTo,
  });

  if (tokenGenerated) {
    // Print once (ADR-0010 decision 2). The value crosses exactly one log
    // line — the terminal the operator is watching — and nothing else.
    log(`pairing token (printed once; clients send 'Authorization: Bearer <token>'): ${token}`);
  } else {
    log("pairing token pre-provisioned (VAE_TRUST); not printed");
  }

  let stopResolve: (() => void) | null = null;
  const stopped = new Promise<void>((resolve) => {
    stopResolve = resolve;
  });

  const daemonHandle: DaemonHandle = {
    port: server.port ?? opts.port ?? 7897,
    hostname,
    token,
    tokenGenerated,
    registry,
    stopped,
    async stop(stopOpts = {}): Promise<void> {
      registry.markStopped();
      const timeoutMs = stopOpts.timeoutMs ?? 10_000;
      // Graceful: runs settle first (bounded); then the listener closes.
      // The final force-close kills only pooled keep-alive sockets — runs
      // have already settled by construction.
      const idle = registry.idle().then(() => undefined);
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
      await Promise.race([idle, timeout]);
      server.stop(stopOpts.force === false ? false : true);
      stopResolve?.();
    },
  };
  gracefulStop = () => daemonHandle.stop();
  return daemonHandle;
}

/* ── handlers (thin mapping onto the registry; no business logic here) ── */

interface HandlerContext {
  registry: RunRegistry;
  token: string;
  clock: Clock;
  bootMs: number;
  gracefulStop: () => Promise<void>;
}

async function handle(request: Request, route: DaemonRoute, params: Record<string, string>, ctx: HandlerContext): Promise<Response> {
  const url = new URL(request.url);
  switch (route.operationId) {
    case "getHealth":
      return Response.json({ ok: true, engine_version: ENGINE_VERSION, uptime_ms: ctx.clock.nowMs() - ctx.bootMs });
    case "getVersion":
      return Response.json({
        engine_version: ENGINE_VERSION,
        substrate: "typescript-on-bun (ADR-0018, reference substrate)",
        envelope_version: ENVELOPE_VERSION,
        event_types: EVENT_TYPES.length,
        error_codes: Object.keys(ERROR_CATALOG).length,
        routes: "see /openapi.json (generated from the dispatch table)",
      });
    case "getOpenApi":
      return Response.json(generateOpenApi());
    case "listRuns": {
      const runs: RunSummary[] = await ctx.registry.list();
      return Response.json({ runs });
    }
    case "startRun": {
      const body = await readJsonBody(request);
      const kind = body.kind;
      if (kind !== "agent" && kind !== "workflow") {
        throw new VaerionError("E1600", "body.kind must be \"agent\" or \"workflow\"");
      }
      const input = kind === "workflow"
        ? ({ kind, dag: body.dag } as StartRunInput)
        : ({
            kind,
            goal: body.goal,
            planner: body.planner,
            steps: body.steps,
            maxSteps: body.max_steps,
          } as StartRunInput);
      const started: RunStarted = await ctx.registry.start(input);
      return Response.json(started, { status: 201, headers: { Location: `/runs/${started.run_id}` } });
    }
    case "getRun": {
      const runId = requireParam(params, "run_id");
      const view: RunStatusView = await ctx.registry.status(runId);
      return Response.json(view);
    }
    case "streamRunEvents": {
      const runId = requireParam(params, "run_id");
      const cursor = parseCursor(url.searchParams.get("cursor"));
      const follow = url.searchParams.get("follow") !== "false";
      return streamRunEvents(ctx.registry, runId, { cursor, follow });
    }
    case "answerGate": {
      const runId = requireParam(params, "run_id");
      const body = await readJsonBody(request);
      const gateId = typeof body.gate_id === "string" && body.gate_id.length > 0 ? body.gate_id : null;
      if (gateId === null) throw new VaerionError("E1600", "body.gate_id is required");
      const answer = (body.answer && typeof body.answer === "object" && !Array.isArray(body.answer) ? body.answer : { approved: true }) as Record<string, unknown>;
      const result = await ctx.registry.answer(runId, gateId, answer);
      return Response.json({
        run_id: runId,
        gate: result.gate,
        approved: result.approved,
        receipt: result.receipt,
        hint: result.approved ? `continue with POST /runs/${runId}/continue` : "the run is closed (denied)",
      });
    }
    case "continueRun": {
      const runId = requireParam(params, "run_id");
      const body = await readJsonBody(request);
      const dag = body.dag as WorkflowDag | undefined;
      const accepted = await ctx.registry.continueRun(runId, dag);
      return Response.json({ run_id: runId, accepted: accepted.accepted, kind: accepted.kind }, { status: 202 });
    }
    case "cancelRun": {
      const runId = requireParam(params, "run_id");
      const result = await ctx.registry.cancel(runId);
      return Response.json({ run_id: runId, cancelled: result.cancelled, receipt: result.receipt });
    }
    case "streamWorkspaceEvents": {
      const after = parseCursor(url.searchParams.get("after"));
      const types = (url.searchParams.get("types") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const follow = url.searchParams.get("follow") !== "false";
      const limitRaw = url.searchParams.get("limit");
      const limit = limitRaw !== null && /^\d+$/.test(limitRaw) ? Math.max(1, Math.min(1000, parseInt(limitRaw, 10))) : 200;
      return streamWorkspaceEvents(ctx.registry, { after, types, follow, limit });
    }
    case "listModels": {
      const models = await ctx.registry.models();
      return Response.json({ models });
    }
    case "getModel": {
      const logical = requireParam(params, "logical");
      const model = await ctx.registry.model(logical);
      return Response.json(model);
    }
    case "listTools": {
      const tools = await ctx.registry.tools();
      return Response.json({ tools });
    }
    case "shutdownDaemon": {
      const body = await readJsonBody(request);
      const echoed = typeof body.token === "string" ? body.token : null;
      if (echoed === null || !tokensMatch(echoed, ctx.token)) {
        throw new VaerionError("E2004", "shutdown requires the pairing token echoed in the body");
      }
      // Respond first; the graceful stop runs once the response is delivered.
      setTimeout(() => {
        void ctx.gracefulStop();
      }, 25);
      return Response.json({ shutting_down: true, note: "in-flight runs settle before the listener closes" });
    }
    default: {
      const err = new VaerionError("E2002", `route ${route.operationId} has no handler`);
      return Response.json(errorBody(err), { status: 500 });
    }
  }
}

function parseCursor(raw: string | null): number {
  if (raw === null || raw.length === 0) return 0;
  if (!/^\d+$/.test(raw)) throw new VaerionError("E1600", `cursor must be a non-negative integer, got: ${raw}`);
  return parseInt(raw, 10);
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-store",
  Connection: "keep-alive",
};

const FOLLOW_POLL_MS = 60;

/** SSE for one run: replay journal events after the cursor, then follow to the receipt. */
function streamRunEvents(registry: RunRegistry, runId: string, opts: { cursor: number; follow: boolean }): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let cursor = opts.cursor;
      const push = (frame: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          closed = true; // client disconnected
        }
      };
      const finish = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed by the runtime */
          }
        }
      };
      const pushEnvelope = (env: Record<string, unknown>) => push(`data: ${JSON.stringify(env)}\n\n`);
      try {
        // Replay phase — the journal is the truth.
        const replayed = await registry.eventsSince(runId, cursor);
        for (const env of replayed) {
          cursor = Math.max(cursor, Number(env.seq ?? 0));
          pushEnvelope(env);
        }
        if (!opts.follow) {
          push("event: end\ndata: {}\n\n");
          finish();
          return;
        }
        // Follow phase — poll the journal until the run is sealed.
        for (;;) {
          if (closed) return;
          await new Promise<void>((r) => setTimeout(r, FOLLOW_POLL_MS));
          const fresh = await registry.eventsSince(runId, cursor);
          for (const env of fresh) {
            cursor = Math.max(cursor, Number(env.seq ?? 0));
            pushEnvelope(env);
          }
          if (await registry.isClosed(runId)) {
            push(`event: end\ndata: ${JSON.stringify({ run_id: runId })}\n\n`);
            finish();
            return;
          }
        }
      } catch (err) {
        const body = err instanceof VaerionError ? errorBody(err) : { error: { code: "E1900", message: (err as Error).message.slice(0, 200) } };
        push(`event: error\ndata: ${JSON.stringify(body)}\n\n`);
        finish();
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

/** SSE across the workspace: merged (ts, run_id, seq) tail with follow. */
function streamWorkspaceEvents(registry: RunRegistry, opts: { after: number; types: string[]; follow: boolean; limit: number }): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let after = opts.after;
      const push = (frame: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          closed = true; // client disconnected
        }
      };
      const finish = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed by the runtime */
          }
        }
      };
      try {
        const first = await registry.workspaceEvents({ after, types: opts.types, limit: opts.limit });
        for (const env of first.events) {
          after += 1;
          push(`data: ${JSON.stringify(env)}\n\n`);
        }
        if (!opts.follow) {
          push("event: end\ndata: {}\n\n");
          finish();
          return;
        }
        for (;;) {
          if (closed) return;
          await new Promise<void>((r) => setTimeout(r, FOLLOW_POLL_MS));
          const next = await registry.workspaceEvents({ after, types: opts.types, limit: opts.limit });
          for (const env of next.events) {
            after += 1;
            push(`data: ${JSON.stringify(env)}\n\n`);
          }
        }
      } catch (err) {
        const body = err instanceof VaerionError ? errorBody(err) : { error: { code: "E1900", message: (err as Error).message.slice(0, 200) } };
        push(`event: error\ndata: ${JSON.stringify(body)}\n\n`);
        finish();
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
