/**
 * @vaerion/sdk — VaeDaemonClient (MS-5): attach to the local daemon over
 * HTTP/SSE (ADR-0010/ADR-0020). Machine parity with the in-process client:
 * the SAME contracts, reached over the wire — run starts, durable gate
 * answers, continuations, cancellations, event streams with journal cursor
 * replay, and the gateway capability surface (secret NAMES only, never
 * values).
 *
 * Authentication is the pairing token printed once at daemon start
 * (VAE_TRUST pre-provisions headless starts).
 */

import type { WorkflowDag, PlanStep, ToolExecutor } from "@vaerion/engine";
import { DaemonWireTransport } from "./daemon-transport.ts";

export interface VaeDaemonClientOptions {
  /** Daemon base, e.g. http://127.0.0.1:7897 (loopback enforced, E2006). */
  base: string;
  /** The pairing token (Authorization: Bearer). */
  token: string;
}

export interface DaemonRunStarted {
  run_id: string;
  trace_id: string;
  kind: "agent" | "workflow";
}

export interface DaemonRunStatus {
  run_id: string;
  kind: "agent" | "workflow" | "unknown";
  status: "open" | "awaiting_gate" | "closed";
  journal_ok: boolean;
  trace_id: string | null;
  decisions: { allow: number; deny: number; prompt: number };
  open_gates: Array<Record<string, unknown>>;
  resolved_gates: number;
  last_seq: number;
  events_seen: number;
  receipt: unknown | null;
  agent: Record<string, unknown> | null;
  workflow: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  note?: string;
}

export interface DaemonEvent {
  v: number;
  type: string;
  ts: string;
  trace_id: string;
  span_id: string;
  seq: number;
  payload: Record<string, unknown>;
  [k: string]: unknown;
}

function raiseForStatus<T>(result: { status: number; body: unknown }, fallback: string): T {
  if (result.status >= 200 && result.status < 300) return result.body as T;
  const body = result.body as { error?: { code?: string; message?: string; fix?: string } } | null;
  const code = body?.error?.code;
  if (code) {
    throw Object.assign(new Error(body?.error?.message ?? fallback), { code, fix: body?.error?.fix, status: result.status });
  }
  throw Object.assign(new Error(`daemon returned ${result.status}: ${fallback}`), { status: result.status });
}

/** An attached client for the local daemon. Wire parity is test-proven. */
export class VaeDaemonClient {
  private readonly wire: DaemonWireTransport;

  constructor(opts: VaeDaemonClientOptions) {
    this.wire = new DaemonWireTransport(opts.base, opts.token);
  }

  /* ── metadata (unauthenticated) ── */

  async health(): Promise<{ ok: boolean; engine_version: string; uptime_ms: number }> {
    const r = await this.wire.request<{ ok: boolean; engine_version: string; uptime_ms: number }>("GET", "/health");
    return raiseForStatus(r, "health check failed");
  }

  async version(): Promise<Record<string, unknown>> {
    const r = await this.wire.request<Record<string, unknown>>("GET", "/version");
    return raiseForStatus(r, "version fetch failed");
  }

  async openapi(): Promise<Record<string, unknown>> {
    const r = await this.wire.request<Record<string, unknown>>("GET", "/openapi.json");
    return raiseForStatus(r, "openapi fetch failed");
  }

  /* ── runs ── */

  async startAgentRun(input: { goal: string; planner?: "inline" | "model"; steps?: PlanStep[]; maxSteps?: number }): Promise<DaemonRunStarted> {
    const r = await this.wire.request<DaemonRunStarted>("POST", "/runs", {
      body: { kind: "agent", goal: input.goal, planner: input.planner, steps: input.steps, max_steps: input.maxSteps },
    });
    return raiseForStatus(r, "agent run start failed");
  }

  async startWorkflowRun(dag: WorkflowDag): Promise<DaemonRunStarted> {
    const r = await this.wire.request<DaemonRunStarted>("POST", "/runs", { body: { kind: "workflow", dag } });
    return raiseForStatus(r, "workflow run start failed");
  }

  async listRuns(): Promise<Array<{ run_id: string; status: string; closed: boolean; last_seq: number }>> {
    const r = await this.wire.request<{ runs: Array<{ run_id: string; status: string; closed: boolean; last_seq: number }> }>("GET", "/runs");
    return raiseForStatus<{ runs: Array<{ run_id: string; status: string; closed: boolean; last_seq: number }> }>(r, "run list failed").runs ?? [];
  }

  async getRun(runId: string): Promise<DaemonRunStatus> {
    const r = await this.wire.request<DaemonRunStatus>("GET", `/runs/${encodeURIComponent(runId)}`);
    return raiseForStatus(r, `run ${runId} not found`);
  }

  async answerGate(runId: string, gateId: string, answer: Record<string, unknown> = { approved: true }): Promise<{ gate: Record<string, unknown>; approved: boolean; receipt: unknown | null; hint: string }> {
    const r = await this.wire.request("POST", `/runs/${encodeURIComponent(runId)}/answer`, { body: { gate_id: gateId, answer } });
    return raiseForStatus(r, `gate ${gateId} answer failed`);
  }

  async continueRun(runId: string, dag?: WorkflowDag): Promise<{ run_id: string; accepted: boolean; kind: "agent" | "workflow" }> {
    const r = await this.wire.request("POST", `/runs/${encodeURIComponent(runId)}/continue`, { body: dag ? { dag } : {} });
    return raiseForStatus(r, `run ${runId} continuation failed`);
  }

  async cancelRun(runId: string): Promise<{ run_id: string; cancelled: boolean; receipt: unknown }> {
    const r = await this.wire.request("POST", `/runs/${encodeURIComponent(runId)}/cancel`);
    return raiseForStatus(r, `run ${runId} cancel failed`);
  }

  /* ── event streams (SSE) ── */

  /** Stream one run's journaled events from a cursor; ends when the run seals. */
  async *streamRunEvents(runId: string, opts: { cursor?: number; follow?: boolean; signal?: AbortSignal } = {}): AsyncGenerator<DaemonEvent> {
    const query: Record<string, string> = { cursor: String(opts.cursor ?? 0) };
    if (opts.follow === false) query.follow = "false";
    const response = await this.wire.stream(`/runs/${encodeURIComponent(runId)}/events`, query);
    if (response.status !== 200) {
      const text = await response.text().catch(() => "");
      throw Object.assign(new Error(`event stream failed (${response.status})`), { status: response.status, detail: text.slice(0, 200) });
    }
    for await (const frame of sseFrames(response, opts.signal)) {
      if (frame.event === "end") return;
      if (frame.event === "error") {
        throw Object.assign(new Error("event stream error"), { body: frame.data as Record<string, unknown> });
      }
      if (frame.data !== undefined) yield frame.data as DaemonEvent;
    }
  }

  /** Workspace-wide merged tail. */
  async *streamWorkspaceEvents(opts: { after?: number; types?: string[]; follow?: boolean; limit?: number; signal?: AbortSignal } = {}): AsyncGenerator<DaemonEvent> {
    const query: Record<string, string> = { after: String(opts.after ?? 0), limit: String(opts.limit ?? 200) };
    if (opts.types && opts.types.length > 0) query.types = opts.types.join(",");
    if (opts.follow === false) query.follow = "false";
    const response = await this.wire.stream("/events", query);
    if (response.status !== 200) {
      throw Object.assign(new Error(`workspace event stream failed (${response.status})`), { status: response.status });
    }
    for await (const frame of sseFrames(response, opts.signal)) {
      if (frame.event === "end") return;
      if (frame.event === "error") {
        throw Object.assign(new Error("event stream error"), { body: frame.data as Record<string, unknown> });
      }
      if (frame.data !== undefined) yield frame.data as DaemonEvent;
    }
  }

  /* ── capability surfaces ── */

  async listModels(): Promise<Array<{ provider: string; ops: string[]; requiresSecret: boolean; secretName: string | null }>> {
    const r = await this.wire.request<{ models: Array<{ provider: string; ops: string[]; requiresSecret: boolean; secretName: string | null }> }>("GET", "/models");
    return raiseForStatus<{ models: Array<{ provider: string; ops: string[]; requiresSecret: boolean; secretName: string | null }> }>(r, "model list failed").models ?? [];
  }

  async getModel(logical: string): Promise<Record<string, unknown>> {
    const r = await this.wire.request("GET", `/models/${encodeURIComponent(logical)}`);
    return raiseForStatus(r, `model ${logical} not found`);
  }

  async listTools(): Promise<Array<{ name: string; scope: string; description: string | null; builtin: boolean }>> {
    const r = await this.wire.request<{ tools: Array<{ name: string; scope: string; description: string | null; builtin: boolean }> }>("GET", "/tools");
    return raiseForStatus<{ tools: Array<{ name: string; scope: string; description: string | null; builtin: boolean }> }>(r, "tool list failed").tools ?? [];
  }

  /* ── packages (ADR-0016 wire parity — the same fold/verify/import the CLI runs) ── */

  /** Build the workspace bundle over the wire (same contract as `vae package build`). */
  async packagePack(input: { out?: string; dryRun?: boolean } = {}): Promise<Record<string, unknown>> {
    const r = await this.wire.request<Record<string, unknown>>("POST", "/packages/pack", {
      body: { ...(input.out !== undefined ? { out: input.out } : {}), ...(input.dryRun !== undefined ? { dry_run: input.dryRun } : {}) },
    });
    return raiseForStatus(r, "package pack failed");
  }

  /** Verify a bundle over the wire (same pure check as `vae package verify BUNDLE`). */
  async packageVerify(input: { path: string; dryRun?: boolean }): Promise<Record<string, unknown>> {
    const r = await this.wire.request<Record<string, unknown>>("POST", "/packages/verify", {
      body: { path: input.path, ...(input.dryRun !== undefined ? { dry_run: input.dryRun } : {}) },
    });
    return raiseForStatus(r, "package verify failed");
  }

  /** Admit an externally produced bundle into the workspace (verify-first law). */
  async packageImport(input: { path: string; dryRun?: boolean }): Promise<Record<string, unknown>> {
    const r = await this.wire.request<Record<string, unknown>>("POST", "/packages/import", {
      body: { path: input.path, ...(input.dryRun !== undefined ? { dry_run: input.dryRun } : {}) },
    });
    return raiseForStatus(r, "package import failed");
  }

  /* ── admin ── */

  async shutdown(): Promise<{ shutting_down: boolean }> {
    const r = await this.wire.request<{ shutting_down: boolean }>("POST", "/shutdown", { body: { token: this.wire.token } });
    return raiseForStatus(r, "shutdown failed");
  }
}

/** Minimal SSE frame parser over a fetch body stream. */
async function* sseFrames(response: Response, signal?: AbortSignal): AsyncGenerator<{ event?: string; data?: unknown }> {
  const body = response.body;
  if (body === null) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let aborted = false;
  const onAbort = () => {
    aborted = true;
  };
  if (signal) {
    if (signal.aborted) aborted = true;
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const rawFrame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const frame = parseFrame(rawFrame);
        if (frame) yield frame;
      }
    }
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

function parseFrame(raw: string): { event?: string; data?: unknown } | null {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (event === undefined && dataLines.length === 0) return null;
  const dataText = dataLines.join("\n");
  let data: unknown;
  try {
    data = dataText.length > 0 ? JSON.parse(dataText) : undefined;
  } catch {
    data = dataText;
  }
  return { event, data };
}

/** Re-export so consumers can type the executor parameter without the engine barrel. */
export type { ToolExecutor, WorkflowDag, PlanStep };
export default VaeDaemonClient;
