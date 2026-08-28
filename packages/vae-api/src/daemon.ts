/**
 * vae-api — the loopback daemon (D7.2 daemon posture, D7.3 socket-first,
 * D17.7 canonical envelope, D17.9 loopback + pairing token).
 *
 * One core, two postures: the daemon serves the SAME engine services
 * the CLI composes in-process — no side channels exist (D7.5).
 * Responses use the one canonical envelope; the journal stream is
 * NDJSON, envelope-aligned (D17.8 posture). Read-only surface in
 * MS-0; mutation endpoints arrive with the execution milestones.
 */

import { envelope, iso, EXIT_CODES, ENGINE_VERSION, catalogEntry, type Envelope, type Json } from "vae-foundation";
import type { EngineContext, RunSummary } from "vae-agent";
import { JournalService } from "vae-agent";
import { mintToken, tokensMatch } from "./token.ts";

export interface DaemonOptions {
  readonly port?: number;
  readonly hostname?: string;
}

const DEFAULT_PORT = 7897;
const DEFAULT_HOST = "127.0.0.1";

function okEnvelope(ctx: EngineContext, type: Envelope["type"], payload: unknown): Envelope {
  return envelope({
    type,
    seq: ctx.nextEventSeq(),
    ts: iso(ctx.clock.nowMs()),
    actor: { kind: "engine", id: "vae-core" },
    cause: { kind: "daemon", ref: "http" },
    payload: payload as never,
  });
}

function errorEnvelope(ctx: EngineContext, code: string, message: string, fix: string): Envelope {
  return envelope({
    type: "engine.error",
    seq: ctx.nextEventSeq(),
    ts: iso(ctx.clock.nowMs()),
    actor: { kind: "engine", id: "vae-core" },
    cause: { kind: "daemon", ref: "http" },
    payload: { error: { code, message, fix } },
  });
}

/** Emitted OpenAPI contract (D17.1: the specification is the contract). */
export function openapiDocument(hostname: string, port: number): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Vaerion Local API",
      version: ENGINE_VERSION,
      description: "Loopback-only API served by the vae daemon. Envelope-aligned (D17.7); pairing-token authenticated (D17.9).",
    },
    servers: [{ url: `http://${hostname}:${port}` }],
    paths: {
      "/v1/health": { get: { summary: "Engine and workspace health", responses: { "200": { description: "envelope(ok)" } } } },
      "/v1/runs": { get: { summary: "List runs with journal status", responses: { "200": { description: "envelope(RunSummary[])" } } } },
      "/v1/runs/{runId}/journal": { get: { summary: "Stream a run's journal as NDJSON envelopes", responses: { "200": { description: "NDJSON stream" } } } },
      "/v1/spec": { get: { summary: "This OpenAPI document", responses: { "200": { description: "OpenAPI 3.1 JSON" } } } },
    },
  };
}

export interface StartedDaemon {
  readonly url: string;
  readonly port: number;
  readonly token: string;
  stop(): void;
}

/** Start the daemon (embedded workspace context required). */
export function startDaemon(ctx: EngineContext, options: DaemonOptions = {}): StartedDaemon {
  const port = options.port ?? DEFAULT_PORT;
  const hostname = options.hostname ?? DEFAULT_HOST;
  const token = mintToken(ctx.paths.tokenFile);
  const journals = new JournalService(ctx);

  const authOk = (req: Request): boolean => {
    const header = req.headers.get("authorization");
    const presented = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    return tokensMatch(presented, token);
  };

  let selfRef: { port: number } | undefined;
  const server = Bun.serve({
    port,
    hostname,
    async fetch(req: Request): Promise<Response> {
      const boundPort = (selfRef?.port as number | undefined) ?? port;
      const url = new URL(req.url);
      const path = url.pathname;

      // Unauthenticated minimal health endpoint.
      if (req.method === "GET" && path === "/v1/health") {
        const body = okEnvelope(ctx, "doctor.check", {
          ok: ctx.auditVerifyReport.ok,
          engineVersion: ctx.engineVersion,
          project: ctx.resolved.config.project.name,
        });
        return Response.json(body, { status: 200 });
      }

      // Everything else requires the pairing token (D17.9).
      if (!authOk(req)) {
        const entry = catalogEntry("E2013");
        return Response.json(errorEnvelope(ctx, entry.code, entry.message, entry.fix), {
          status: 401,
          headers: { "www-authenticate": "Bearer" },
        });
      }

      if (req.method === "GET" && path === "/v1/runs") {
        const runs: RunSummary[] = journals.listRuns();
        return Response.json(okEnvelope(ctx, "journal.verified", { runs }));
      }

      const journalMatch = path.match(/^\/v1\/runs\/([^/]+)\/journal$/);
      if (req.method === "GET" && journalMatch !== null) {
        const runId = decodeURIComponent(journalMatch[1]!);
        const entries = journals.entries(runId);
        const body = entries
          .map((e) =>
            JSON.stringify(
              envelope({
                type: "journal.entry.appended",
                seq: e.seq,
                ts: e.ts,
                run_id: runId,
                actor: e.actor,
                cause: e.cause,
                payload: { entry: e as unknown as Json },
              }),
            ),
          )
          .join("\n");
        return new Response(body.length > 0 ? `${body}\n` : "", {
          status: 200,
          headers: { "content-type": "application/x-ndjson" },
        });
      }

      if (req.method === "GET" && path === "/v1/spec") {
        return Response.json(okEnvelope(ctx, "engine.version", { openapi: openapiDocument(hostname, boundPort) }));
      }

      return Response.json(
        errorEnvelope(ctx, "E1006", `No route for ${req.method} ${path}.`, "Re-run with --help to see the available machine surface."),
        { status: 404 },
      );
    },
  });
  selfRef = { port: (server.port ?? port) as number };

  return {
    url: `http://${hostname}:${server.port ?? port}`,
    port: (server.port ?? port) as number,
    token,
    stop: () => server.stop(true),
  };
}

export const DAEMON_DEFAULTS = { port: DEFAULT_PORT, hostname: DEFAULT_HOST, exit: EXIT_CODES.OK } as const;
