/**
 * Vaerion — local API daemon route table (MS-5, ADR-0010/ADR-0020).
 *
 * This table is the SINGLE SOURCE for both request dispatch and the
 * generated OpenAPI description (spec/openapi.json): an "API gap" is
 * impossible by construction because the description and the dispatcher are
 * the same data. Only implemented routes are described — an unimplemented
 * route is never advertised.
 *
 * Layer law: `api/` is an L4 surface, a SIBLING of the CLI over the same
 * engine contracts (RunHarness, AgentRuntime, WorkflowEngine, GatewayService,
 * ToolInvocationService). It must never import the CLI (layerlint hard edge)
 * and must never make outbound network calls (constitutional check C7).
 */

import { VaerionError } from "../kernel/errors.ts";

export type DaemonMethod = "GET" | "POST";

export interface DaemonRoute {
  method: DaemonMethod;
  /** Path with `{param}` placeholders, e.g. `/runs/{run_id}/answer`. */
  path: string;
  /** Pairing token required (ADR-0010: only the three meta routes are open). */
  auth: boolean;
  operationId: string;
  summary: string;
  description: string;
  tag: "meta" | "runs" | "events" | "models" | "tools" | "packages" | "admin";
  /** OpenAPI request-body schema (POST routes); generated verbatim. */
  requestBody?: Record<string, unknown>;
  /** Response notes rendered into the OpenAPI responses map. */
  responses: Record<string, string>;
}

/**
 * The implemented daemon surface. Every entry is backed by real engine
 * behavior; nothing here is aspirational.
 */
export const DAEMON_ROUTES: readonly DaemonRoute[] = [
  {
    method: "GET",
    path: "/health",
    auth: false,
    operationId: "getHealth",
    summary: "Daemon liveness (unauthenticated).",
    description:
      "Loopback liveness probe. Returns ok, the engine version, and the daemon uptime in milliseconds. No pairing token required (ADR-0010: metadata routes only).",
    tag: "meta",
    responses: { "200": "DaemonStatus" },
  },
  {
    method: "GET",
    path: "/version",
    auth: false,
    operationId: "getVersion",
    summary: "Engine and contract versions (unauthenticated).",
    description:
      "Engine version, substrate, envelope version, and the published contract counts (event types, error codes) the daemon enforces.",
    tag: "meta",
    responses: { "200": "VersionInfo" },
  },
  {
    method: "GET",
    path: "/openapi.json",
    auth: false,
    operationId: "getOpenApi",
    summary: "The generated OpenAPI description (unauthenticated).",
    description:
      "Machine-readable description of THIS daemon's routes, generated from the same route table that dispatches requests (ADR-0010 decision 4). The committed contract lives at spec/openapi.json and constitutional check C4 verifies the two never drift.",
    tag: "meta",
    responses: { "200": "OpenAPI document" },
  },
  {
    method: "GET",
    path: "/runs",
    auth: true,
    operationId: "listRuns",
    summary: "List runs known to this workspace.",
    description:
      "One entry per journal in the workspace journal directory: run id, status folded from the journal, event count, and closed/awaiting state. The journal is the truth; nothing is cached.",
    tag: "runs",
    responses: { "200": "Array of RunSummary" },
  },
  {
    method: "POST",
    path: "/runs",
    auth: true,
    operationId: "startRun",
    summary: "Start an agent or workflow run (background execution).",
    description:
      "Starts the same supervised agent loop or deterministic workflow DAG execution the CLI runs, as a background task. Runs execute SERIALLY per workspace (run queue, submission order): the audit ledger and refusal log are single-writer chains. Returns 201 with the run coordinates; poll /runs/{run_id} or stream /runs/{run_id}/events.",
    tag: "runs",
    requestBody: {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: {
        kind: { type: "string", enum: ["agent", "workflow"], description: "Run kind." },
        goal: { type: "string", description: "agent: the stated objective." },
        planner: { type: "string", enum: ["inline", "model"], description: "agent: planner kind (default inline)." },
        steps: { type: "array", items: { type: "object" }, description: "agent, inline planner: the declared plan steps." },
        max_steps: { type: "integer", minimum: 1, description: "agent: step ceiling override." },
        dag: { type: "object", description: "workflow: the DAG definition {id, nodes:[{id, deps, step, maxAttempts?}]}." },
      },
    },
    responses: { "201": "RunStarted (Location: /runs/{run_id})", "400": "E1600 validation", "403": "broker denial" },
  },
  {
    method: "GET",
    path: "/runs/{run_id}",
    auth: true,
    operationId: "getRun",
    summary: "One run's status, folded from its journal.",
    description:
      "Deterministic restoration: journal verification result, the RunState fold (status, decision counts, open/resolved gates), the agent- or workflow-specific fold when present, the agent metrics fold, and the terminal receipt when the run is closed.",
    tag: "runs",
    responses: { "200": "RunStatus", "404": "E2003 unknown run" },
  },
  {
    method: "GET",
    path: "/runs/{run_id}/events",
    auth: true,
    operationId: "streamRunEvents",
    summary: "Event stream for one run (SSE with cursor replay).",
    description:
      "Server-sent events. First REPLAYS every journaled event envelope with seq > cursor (query: cursor, default 0), then — unless follow=false — FOLLOWS the journal until the run is closed (receipt seen), emitting new envelopes as they are journaled. Payloads pass redaction before publication (ADR-0011 law). Each frame is `data: <envelope JSON>`; the stream ends with `event: end`.",
    tag: "events",
    responses: { "200": "text/event-stream", "404": "E2003 unknown run" },
  },
  {
    method: "POST",
    path: "/runs/{run_id}/answer",
    auth: true,
    operationId: "answerGate",
    summary: "Resolve a pending durable human gate.",
    description:
      "Human authority over a paused run, identical to `vae resume RUN_ID --answer JSON`. Restores the harness (verifying the hash chain first), resolves the named gate, and records the elevation when approved. A denial closes the run with a receipt. Continue an approved agent run with POST /runs/{run_id}/continue.",
    tag: "runs",
    requestBody: {
      type: "object",
      additionalProperties: false,
      required: ["gate_id"],
      properties: {
        gate_id: { type: "string", description: "The pending gate id (from GET /runs/{run_id})." },
        answer: { type: "object", description: "Gate answer; default {\"approved\":true}." },
      },
    },
    responses: { "200": "GateResolution", "403": "E1303 gate conflict", "404": "E2003 unknown run/gate" },
  },
  {
    method: "POST",
    path: "/runs/{run_id}/continue",
    auth: true,
    operationId: "continueRun",
    summary: "Continue an approved agent run (or a workflow with its DAG).",
    description:
      "Continues execution after gate approval, exactly like `vae resume` continuation: the approved gate is durable elevation authority and the loop resumes from its journaled steps. Workflow runs require the original DAG in the body (the journal does not embed the caller's DAG file).",
    tag: "runs",
    requestBody: {
      type: "object",
      additionalProperties: false,
      properties: {
        dag: { type: "object", description: "workflow continuation: the original DAG definition." },
      },
    },
    responses: { "202": "Continuation accepted (background execution)", "400": "E1600 not continuable / missing DAG", "404": "E2003 unknown run" },
  },
  {
    method: "POST",
    path: "/runs/{run_id}/cancel",
    auth: true,
    operationId: "cancelRun",
    summary: "Cancel a paused or interrupted run (terminal, receipted).",
    description:
      "Cancellation is defined where it is constitutionally meaningful: a run awaiting a durable gate (the open gate is denied — the human refuses) and an open run with NO live executor (e.g. after a daemon restart). In-flight runs are refused with 409 E2005 — the supervisor loop is the only authority between steps, and pretending otherwise would be a lie the journal would not support.",
    tag: "runs",
    responses: { "200": "Cancelled (receipt)", "409": "E2005 in-flight / E1500 closed" },
  },
  {
    method: "GET",
    path: "/events",
    auth: true,
    operationId: "streamWorkspaceEvents",
    summary: "Workspace-wide event tail (SSE, merged across runs).",
    description:
      "Merged event stream across every run journal in the workspace, ordered by (ts, run_id, seq). Query: cursor (emit events strictly after this global ordinal), types (comma-separated event-type filter), follow (default true — keep the stream open and poll the journal directory), limit (replay bound, default 200). Global ordinals are (ts, run_id, seq) and are stable across restarts because the journal is the truth.",
    tag: "events",
    responses: { "200": "text/event-stream" },
  },
  {
    method: "GET",
    path: "/models",
    auth: true,
    operationId: "listModels",
    summary: "Gateway provider capability matrix.",
    description:
      "The declared capability matrix (provider, ops, requiresSecret, secretName) exactly as `vae doctor`/`vae dev` surface it. Secret NAMES only — secret values are broker-mediated and never cross this surface.",
    tag: "models",
    responses: { "200": "Array of ProviderCapability" },
  },
  {
    method: "GET",
    path: "/models/{logical}",
    auth: true,
    operationId: "getModel",
    summary: "One logical model's capability and price record.",
    description:
      "Provider membership, supported ops, secret requirement (name only), and the published integer micro-USD price table entry when the model is priced. Unknown logical models are 404 E1600.",
    tag: "models",
    responses: { "200": "ModelCapability", "404": "E1600 unknown model" },
  },
  {
    method: "GET",
    path: "/tools",
    auth: true,
    operationId: "listTools",
    summary: "Declared tools plus the deterministic builtins.",
    description:
      "The intersection the agent pipeline can actually use: tools declared in vaerion.yaml (name, scope, description) and the engine builtins (echo, clock.read).",
    tag: "tools",
    responses: { "200": "Array of ToolDescription" },
  },
  {
    method: "POST",
    path: "/packages/pack",
    auth: true,
    operationId: "packagePack",
    summary: "Build the workspace bundle — wire parity with `vae package build`.",
    description:
      "The SAME deterministic fold the CLI runs (ADR-0016): declared inputs plus pin-verified extension artifacts, folded into a reproducible .vxn bundle with a regenerated vaerion.lock, journaled (package.built) with a receipt. Body: {out (workspace-relative bundle path), dry_run}. dry_run:true returns the plan and writes nothing. Requires vaerion.yaml with a package block (E1600 otherwise).",
    tag: "packages",
    requestBody: {
      type: "object",
      additionalProperties: false,
      properties: {
        out: { type: "string", description: "Workspace-relative bundle output path (default .vaerion/package/<project>.vxn)." },
        dry_run: { type: "boolean", description: "Plan only: fold and report, write nothing, journal nothing." },
      },
    },
    responses: { "200": "PackagePackResult (plan + run receipt)", "400": "E1600 no package block / invalid body", "403": "E2100 pin mismatch" },
  },
  {
    method: "POST",
    path: "/packages/verify",
    auth: true,
    operationId: "packageVerify",
    summary: "Verify a bundle — wire parity with `vae package verify BUNDLE`.",
    description:
      "The SAME pure check the CLI runs (ADR-0016 decision 3): digests recomputed, pins compared, content never executed, reported as an honest per-check findings list against the workspace config + lock. Body: {path, dry_run}. The path is resolved against the workspace root; traversal outside the workspace is refused (E2204). Journaled (package.verified) with a receipt unless dry_run.",
    tag: "packages",
    requestBody: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: { type: "string", description: "Bundle path, resolved against the workspace root (E2204 outside)." },
        dry_run: { type: "boolean", description: "Report only: no journal record." },
      },
    },
    responses: { "200": "PackageVerifyResult (ok + findings)", "400": "E1600 missing path / bundle not found · E2204 path outside workspace · E2206 failed verification" },
  },
  {
    method: "POST",
    path: "/packages/import",
    auth: true,
    operationId: "packageImport",
    summary: "Admit an externally produced bundle into the workspace.",
    description:
      "Imports a .vxn bundle file: the bundle FIRST passes the same pure verification the CLI runs (a failing bundle is never admitted, E2206), then the file is admitted at .vaerion/package/<name>.vxn, a fresh vaerion.lock is generated FROM the bundle (the lock is generated, never hand-edited), and the admission is journaled (package.imported) with a receipt. Body: {path, dry_run}. Content is never executed (ADR-0016 law).",
    tag: "packages",
    requestBody: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: { type: "string", description: "Bundle path, resolved against the workspace root (E2204 outside)." },
        dry_run: { type: "boolean", description: "Verify only: report what would be admitted, write nothing." },
      },
    },
    responses: { "200": "PackageImportResult (admitted + receipt)", "400": "E1600 missing path / bundle not found · E2204 path outside workspace · E2206 failed verification (never admitted)" },
  },
  {
    method: "POST",
    path: "/shutdown",
    auth: true,
    operationId: "shutdownDaemon",
    summary: "Graceful shutdown with token echo guard.",
    description:
      "Stops the listener and waits for in-flight runs to settle (bounded). The body must echo the pairing token ({\"token\":\"...\"}) in addition to the Authorization header — the echo guard prevents accidental shutdowns.",
    tag: "admin",
    requestBody: {
      type: "object",
      additionalProperties: false,
      required: ["token"],
      properties: { token: { type: "string", description: "The pairing token (echo guard)." } },
    },
    responses: { "200": "Shutting down", "403": "E2004 echo mismatch" },
  },
] as const;

/** Match a method+pathname against the route table; `{param}` matches one
 *  segment; the terminal `{logical}` parameter greedily matches the rest of
 *  the path (logical model ids are provider/model with a slash). */
export function matchRoute(method: string, pathname: string): { route: DaemonRoute; params: Record<string, string> } | null {
  const segments = pathname.split("/").filter((s) => s.length > 0);
  for (const route of DAEMON_ROUTES) {
    if (route.method !== method) continue;
    const pattern = route.path.split("/").filter((s) => s.length > 0);
    const greedy = pattern.length > 0 && pattern[pattern.length - 1] === "{logical}";
    if (pattern.length !== segments.length && !(greedy && segments.length >= pattern.length)) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pattern.length; i++) {
      const p = pattern[i] as string;
      if (p.startsWith("{") && p.endsWith("}")) {
        const name = p.slice(1, -1);
        if (name === "logical" && i === pattern.length - 1) {
          params[name] = segments.slice(i).map((s) => decodeURIComponent(s)).join("/");
          break;
        }
        params[name] = decodeURIComponent(segments[i] as string);
      } else if (p !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

/** Assert helper for route handlers: require a non-empty path parameter. */
export function requireParam(params: Record<string, string>, name: string): string {
  const v = params[name];
  if (typeof v !== "string" || v.length === 0) {
    throw new VaerionError("E1600", `path parameter {${name}} is required`);
  }
  return v;
}
