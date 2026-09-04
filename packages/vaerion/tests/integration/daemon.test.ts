/**
 * The local API daemon over real sockets (MS-5, ADR-0010/ADR-0020).
 *
 * Law under test: loopback-only binds; pairing-token authn fail-closed;
 * runs start over the wire and execute the SAME engine composition the CLI
 * runs (journal is the truth); SSE streams replay from a journal cursor and
 * follow to the receipt; durable gates answer + continue over the wire
 * (elevation law completes the run); cancellation is receipted and honest;
 * shutdown requires the token echo.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon, type DaemonHandle } from "../../src/api/server.ts";
import { generateOpenApi } from "../../src/api/openapi.ts";
import { VaerionError } from "../../src/kernel/errors.ts";
import { runCli } from "../../src/cli/vae.ts";
import { readJournal } from "../../src/journal/reader.ts";
import { listJournals } from "../../src/journal/ls.ts";
import { RunHarness } from "../../src/runtime/run.ts";
import { VaeDaemonClient } from "../../../../sdks/typescript/src/index.ts";
import type { EvtRecord } from "../../src/journal/records.ts";
import type { PlanStep } from "../../src/agents/planner.ts";

const workspaces: string[] = [];
afterAll(async () => {
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
});

const ALLOW_YAML = `schemaVersion: "0.1"
project: { name: daemon-allow }
gateway: { providers: { mockbrain: { enabled: true, models: ["mock-1"] } } }
tools: [{ name: "echo" }]
agents: { maxSteps: 12, plannerModel: "mockbrain/mock-1" }
policy:
  rules:
    - { id: agent-echo-allow, principalKinds: [agent], domain: tool.call, scope: echo, effect: allow, rationale: "test" }
    - { id: agent-model-allow, principalKinds: [agent], domain: model.invoke, scope: "mockbrain/mock-1", effect: allow, rationale: "test" }
    - { id: human-model-allow, principalKinds: [human], domain: model.invoke, scope: "mockbrain/mock-1", effect: allow, rationale: "test" }
telemetry: { enabled: false }
`;

const PROMPT_YAML = `schemaVersion: "0.1"
project: { name: daemon-prompt }
gateway: { providers: { mockbrain: { enabled: true, models: ["mock-1"] } } }
tools: [{ name: "echo" }]
agents: { maxSteps: 12 }
policy:
  rules:
    - { id: agent-echo-prompt, principalKinds: [agent], domain: tool.call, scope: echo, effect: prompt, gateLabel: "Approve echo?", rationale: "human authority" }
telemetry: { enabled: false }
`;

async function makeWorkspace(yaml: string): Promise<string> {
  const ws = await mkdtemp(join(tmpdir(), "vaerion-daemon-"));
  workspaces.push(ws);
  await writeFile(join(ws, "vaerion.yaml"), yaml, "utf8");
  await mkdir(join(ws, ".vaerion", "journal"), { recursive: true });
  await mkdir(join(ws, ".vaerion", "blobs"), { recursive: true });
  return ws;
}

async function waitFor<T>(fn: () => Promise<T | null>, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v !== null) return v;
    if (Date.now() > deadline) throw new Error("waitFor: deadline exceeded");
    await new Promise<void>((r) => setTimeout(r, 50));
  }
}

async function jsonFetch(handle: DaemonHandle, method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${handle.port}${path}`, {
    method,
    headers: {
      ...(opts.token !== undefined ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: (text.length > 0 ? JSON.parse(text) : {}) as Record<string, unknown> };
}

const echoSteps: PlanStep[] = [
  { kind: "note", text: "Daemon wire run. The spine carries every step." },
  { kind: "tool", tool: "echo", args: { value: "over-the-wire" } },
];

describe("daemon: bind law + authentication (fail-closed)", () => {
  test("non-loopback binds are refused with E2001 before any socket exists", async () => {
    const ws = await makeWorkspace(ALLOW_YAML);
    try {
      await startDaemon({ workspaceDir: ws, hostname: "0.0.0.0", token: "x" });
      expect.unreachable();
    } catch (err) {
      expect((err as VaerionError).code).toBe("E2001");
    }
  });

  test("metadata routes are open; everything else demands the pairing token", async () => {
    const ws = await makeWorkspace(ALLOW_YAML);
    const handle = await startDaemon({ workspaceDir: ws, port: 0, token: "pairing-token-1" });
    try {
      const health = await jsonFetch(handle, "GET", "/health");
      expect(health.status).toBe(200);
      expect((health.body as { ok: boolean }).ok).toBe(true);
      expect((await jsonFetch(handle, "GET", "/version")).status).toBe(200);
      const openapi = await jsonFetch(handle, "GET", "/openapi.json");
      expect(openapi.status).toBe(200);
      expect(openapi.body).toEqual(generateOpenApi());

      const noToken = await jsonFetch(handle, "GET", "/runs");
      expect(noToken.status).toBe(401);
      expect((noToken.body.error as { code: string }).code).toBe("E2000");
      const wrongToken = await jsonFetch(handle, "GET", "/runs", { token: "not-the-token" });
      expect(wrongToken.status).toBe(401);
      const withToken = await jsonFetch(handle, "GET", "/runs", { token: "pairing-token-1" });
      expect(withToken.status).toBe(200);
    } finally {
      await handle.stop({ force: true });
    }
  });

  test("unknown routes and unknown runs answer with stable codes", async () => {
    const ws = await makeWorkspace(ALLOW_YAML);
    const handle = await startDaemon({ workspaceDir: ws, port: 0, token: "t" });
    try {
      const unknown = await jsonFetch(handle, "GET", "/definitely-not-a-route", { token: "t" });
      expect(unknown.status).toBe(404);
      expect((unknown.body.error as { code: string }).code).toBe("E2002");
      const noRun = await jsonFetch(handle, "GET", "/runs/crn_run_01ABCDEFGHJKMNPQRSTVWXYZ", { token: "t" });
      expect(noRun.status).toBe(404);
      expect((noRun.body.error as { code: string }).code).toBe("E2003");
    } finally {
      await handle.stop({ force: true });
    }
  });
});

describe("daemon: run lifecycle over the wire", () => {
  test("agent run: 201 → journal fold → receipt; models/tools surfaces", async () => {
    const ws = await makeWorkspace(ALLOW_YAML);
    const handle = await startDaemon({ workspaceDir: ws, port: 0, token: "t" });
    try {
      const started = await jsonFetch(handle, "POST", "/runs", { token: "t", body: { kind: "agent", goal: "echo over the wire", planner: "inline", steps: echoSteps } });
      expect(started.status).toBe(201);
      const runId = (started.body as { run_id: string }).run_id;
      expect(started.body).toMatchObject({ kind: "agent" });

      const view = await waitFor(async () => {
        const r = await jsonFetch(handle, "GET", `/runs/${runId}`, { token: "t" });
        if (r.status !== 200) return null;
        const v = r.body as { status: string; journal_ok: boolean; receipt: unknown; metrics: unknown; agent: { outcome: string | null } | null };
        return v.status === "closed" ? v : null;
      });
      expect(view.journal_ok).toBe(true);
      expect(view.agent?.outcome).toBe("goal");
      expect(view.receipt).not.toBeNull();
      expect(view.metrics).not.toBeNull();

      const list = await jsonFetch(handle, "GET", "/runs", { token: "t" });
      expect((list.body.runs as Array<{ run_id: string }>).some((r) => r.run_id === runId)).toBe(true);

      const tools = await jsonFetch(handle, "GET", "/tools", { token: "t" });
      const toolNames = (tools.body.tools as Array<{ name: string }>).map((t) => t.name);
      expect(toolNames).toContain("echo");
      expect(toolNames).toContain("clock.read");
      const models = await jsonFetch(handle, "GET", "/models", { token: "t" });
      expect((models.body.models as Array<{ provider: string }>).some((m) => m.provider === "mockbrain")).toBe(true);
      const one = await jsonFetch(handle, "GET", "/models/mockbrain/mock-1", { token: "t" });
      expect(one.status).toBe(200);
      expect(one.body).toMatchObject({ provider: "mockbrain", logical: "mockbrain/mock-1" });
    } finally {
      await handle.stop({ force: true });
    }
  });

  test("SSE: replay from cursor honors the journal; follow ends at the receipt", async () => {
    const ws = await makeWorkspace(ALLOW_YAML);
    const handle = await startDaemon({ workspaceDir: ws, port: 0, token: "t" });
    try {
      const started = await jsonFetch(handle, "POST", "/runs", { token: "t", body: { kind: "agent", goal: "stream me", planner: "inline", steps: echoSteps } });
      const runId = (started.body as { run_id: string }).run_id;
      await waitFor(async () => {
        const r = await jsonFetch(handle, "GET", `/runs/${runId}`, { token: "t" });
        return r.status === 200 && (r.body as { status: string }).status === "closed" ? true : null;
      });

      // Full replay: every journaled envelope, in order.
      const full = await fetch(`http://127.0.0.1:${handle.port}/runs/${runId}/events?follow=false`, { headers: { Authorization: "Bearer t" } });
      const fullText = await full.text();
      const fullEnvelopes = fullText.split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)) as { seq: number; type: string });
      expect(fullEnvelopes.length).toBeGreaterThan(3);
      expect(fullEnvelopes[0]?.type).toBe("run.opened");
      expect(fullText.trim().endsWith("event: end\ndata: {}")).toBe(true);
      const seqs = fullEnvelopes.map((e) => e.seq);
      expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);

      // Cursor replay: seq strictly after the first envelope.
      const partial = await fetch(`http://127.0.0.1:${handle.port}/runs/${runId}/events?follow=false&cursor=${seqs[0]}`, { headers: { Authorization: "Bearer t" } });
      const partialEnvelopes = (await partial.text()).split("\n\n").filter((f) => f.startsWith("data: ")).map((f) => JSON.parse(f.slice(6)) as { seq: number });
      expect(partialEnvelopes.every((e) => e.seq > (seqs[0] as number))).toBe(true);
      expect(partialEnvelopes.length).toBe(seqs.length - 1);

      // Follow mode terminates once the run is sealed (receipt on the journal).
      const followed = await fetch(`http://127.0.0.1:${handle.port}/runs/${runId}/events`, { headers: { Authorization: "Bearer t" } });
      const followedText = await followed.text();
      expect(followedText).toContain("event: end");
    } finally {
      await handle.stop({ force: true });
    }
  });

  test("durable gates over the wire: prompt pauses → answer elevates → continue completes", async () => {
    const ws = await makeWorkspace(PROMPT_YAML);
    const handle = await startDaemon({ workspaceDir: ws, port: 0, token: "t" });
    try {
      const started = await jsonFetch(handle, "POST", "/runs", { token: "t", body: { kind: "agent", goal: "needs authority", planner: "inline", steps: [{ kind: "tool", tool: "echo", args: { value: "authorized" } }] } });
      const runId = (started.body as { run_id: string }).run_id;
      const paused = await waitFor(async () => {
        const r = await jsonFetch(handle, "GET", `/runs/${runId}`, { token: "t" });
        const v = r.body as { status: string; open_gates: Array<{ gate_id: string; question: string }> };
        return v.status === "awaiting_gate" && v.open_gates.length === 1 ? v : null;
      });
      const gateId = paused.open_gates[0]!.gate_id;

      const answered = await jsonFetch(handle, "POST", `/runs/${runId}/answer`, { token: "t", body: { gate_id: gateId, answer: { approved: true } } });
      expect(answered.status).toBe(200);
      expect((answered.body as { approved: boolean }).approved).toBe(true);

      const continued = await jsonFetch(handle, "POST", `/runs/${runId}/continue`, { token: "t", body: {} });
      expect(continued.status).toBe(202);

      const done = await waitFor(async () => {
        const r = await jsonFetch(handle, "GET", `/runs/${runId}`, { token: "t" });
        const v = r.body as { status: string; agent: { outcome: string | null } | null };
        return v.status === "closed" ? v : null;
      });
      // The elevation law completed the run: approval is durable authority.
      expect(done.agent?.outcome).toBe("goal");
    } finally {
      await handle.stop({ force: true });
    }
  });

  test("cancellation: awaiting runs deny their gate and close with a receipt; closed runs refuse", async () => {
    const ws = await makeWorkspace(PROMPT_YAML);
    const handle = await startDaemon({ workspaceDir: ws, port: 0, token: "t" });
    try {
      const started = await jsonFetch(handle, "POST", "/runs", { token: "t", body: { kind: "agent", goal: "will be cancelled", planner: "inline", steps: [{ kind: "tool", tool: "echo", args: { value: "x" } }] } });
      const runId = (started.body as { run_id: string }).run_id;
      await waitFor(async () => {
        const r = await jsonFetch(handle, "GET", `/runs/${runId}`, { token: "t" });
        return (r.body as { status: string }).status === "awaiting_gate" ? true : null;
      });
      const cancelled = await jsonFetch(handle, "POST", `/runs/${runId}/cancel`, { token: "t" });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.receipt).not.toBeNull();
      const again = await jsonFetch(handle, "POST", `/runs/${runId}/cancel`, { token: "t" });
      expect(again.status).toBe(400);
      expect((again.body.error as { code: string }).code).toBe("E1600");
    } finally {
      await handle.stop({ force: true });
    }
  });

  test("workflow run over the wire: DAG executes and closes with outputs", async () => {
    const ws = await makeWorkspace(ALLOW_YAML);
    const handle = await startDaemon({ workspaceDir: ws, port: 0, token: "t" });
    try {
      const dag = {
        id: "wire-dag",
        nodes: [
          { id: "a", deps: [], step: { kind: "tool", tool: "echo", args: { value: "alpha" } } },
          { id: "b", deps: ["a"], step: { kind: "note", text: "after alpha" } },
        ],
      };
      const started = await jsonFetch(handle, "POST", "/runs", { token: "t", body: { kind: "workflow", dag } });
      expect(started.status).toBe(201);
      const runId = (started.body as { run_id: string }).run_id;
      const done = await waitFor(async () => {
        const r = await jsonFetch(handle, "GET", `/runs/${runId}`, { token: "t" });
        const v = r.body as { status: string; workflow: { outcome: string | null; completedNodes: string[] } | null };
        return v.status === "closed" ? v : null;
      });
      expect(done.workflow?.outcome).toBe("completed");
      expect(done.workflow?.completedNodes).toEqual(["a", "b"]);
    } finally {
      await handle.stop({ force: true });
    }
  });
});

describe("daemon: shutdown echo guard + CLI serve", () => {
  test("POST /shutdown refuses a wrong echo and honors the right one", async () => {
    const ws = await makeWorkspace(ALLOW_YAML);
    const handle = await startDaemon({ workspaceDir: ws, port: 0, token: "echo-me" });
    const wrong = await jsonFetch(handle, "POST", "/shutdown", { token: "echo-me", body: { token: "different" } });
    expect(wrong.status).toBe(403);
    expect((wrong.body.error as { code: string }).code).toBe("E2004");
    const right = await jsonFetch(handle, "POST", "/shutdown", { token: "echo-me", body: { token: "echo-me" } });
    expect(right.status).toBe(200);
    await handle.stopped;
    let refused = false;
    try {
      await fetch(`http://127.0.0.1:${handle.port}/health`);
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });

  test("`vae serve` binds, prints the token once (json), and stops on shutdown", async () => {
    const ws = await makeWorkspace(ALLOW_YAML);
    const lines: Array<Record<string, unknown>> = [];
    const serving = runCli(["serve", "--port", "0", "--json"], { out: (l) => lines.push(JSON.parse(l) as Record<string, unknown>), err: () => undefined }, ws);
    const banner = await waitFor(async () => {
      const line = lines.find((l) => l.command === "serve" && typeof l.token === "string");
      return line ?? null;
    });
    const port = parseInt(String((banner as { listening: string }).listening).split(":")[1] ?? "0", 10);
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    const shutdown = await fetch(`http://127.0.0.1:${port}/shutdown`, {
      method: "POST",
      headers: { Authorization: `Bearer ${banner!.token as string}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token: banner!.token as string }),
    });
    expect(shutdown.status).toBe(200);
    const result = await serving;
    expect(result.code).toBe(0);
  });
});

/* ───────── the packages route group (MS-6 wire parity, ASCENSION XXVI+) ───────────── */

const PACKAGE_YAML = `schemaVersion: "0.1"
project:
  name: daemon-packages
  description: "wire parity for the packages route group"
package:
  include:
    - docs
    - prompts/p.md
telemetry:
  enabled: false
`;

async function makePackageWorkspace(): Promise<string> {
  const ws = await makeWorkspace(PACKAGE_YAML);
  await mkdir(join(ws, "docs"), { recursive: true });
  await mkdir(join(ws, "prompts"), { recursive: true });
  await writeFile(join(ws, "docs", "a.md"), "# A\nwire-parity doc\n");
  await writeFile(join(ws, "prompts", "p.md"), "PROMPT: answer with citations\n");
  return ws;
}

async function journalTypes(ws: string, runId: string): Promise<string[]> {
  const read = await readJournal(RunHarness.journalPathFor(ws, runId));
  return read.records.filter((r): r is EvtRecord => r.k === "evt").map((r) => r.env.type);
}

async function onlyRunId(ws: string): Promise<string> {
  const runs = await listJournals(join(ws, ".vaerion", "journal"));
  expect(runs.length).toBe(1);
  return runs[0]!.run_id;
}

describe("daemon: the packages route group (pack/verify/import — ADR-0016 wire parity)", () => {
  test("the generated contract advertises exactly the implemented package routes", () => {
    const spec = generateOpenApi() as { paths: Record<string, unknown>; tags: Array<{ name: string }> };
    for (const p of ["/packages/pack", "/packages/verify", "/packages/import"]) {
      expect(spec.paths[p]).toBeDefined();
    }
    expect(spec.tags.some((t) => t.name === "packages")).toBe(true);
  });

  test("pack over the wire journals the SAME event contract as `vae package build`", async () => {
    // CLI journey.
    const cliWs = await makePackageWorkspace();
    const cliResult = await runCli(["package", "build"], { out: () => undefined, err: () => undefined }, cliWs);
    expect(cliResult.code).toBe(0);
    const cliTypes = await journalTypes(cliWs, await onlyRunId(cliWs));
    expect(cliTypes).toContain("package.built");

    // Wire journey — dry_run FIRST: plan only, nothing written, nothing journaled.
    const wireWs = await makePackageWorkspace();
    const handle = await startDaemon({ workspaceDir: wireWs, port: 0, token: "pkg" });
    try {
      const dry = await jsonFetch(handle, "POST", "/packages/pack", { token: "pkg", body: { dry_run: true } });
      expect(dry.status).toBe(200);
      expect(dry.body.dry_run).toBe(true);
      expect(dry.body.side_effects).toBe(0);
      await expect(readFile(join(wireWs, String(dry.body.out)))).rejects.toThrow();
      expect((await listJournals(join(wireWs, ".vaerion", "journal"))).length).toBe(0);

      const res = await jsonFetch(handle, "POST", "/packages/pack", { token: "pkg", body: {} });
      expect(res.status).toBe(200);
      expect(res.body.ok === undefined).toBe(true); // plan shape, not a verify report
      expect(res.body.bundle_blake3).toBeString();
      expect(res.body.journal_verified).toBe(true);
      const wireTypes = await journalTypes(wireWs, String(res.body.run_id));
      expect(wireTypes).toEqual(cliTypes); // the Machine Parity invariant, over the wire
      expect((await listJournals(join(wireWs, ".vaerion", "journal"))).length).toBe(1); // only the real pack
    } finally {
      await handle.stop({ force: true });
    }
  });

  test("pack without a package block is refused with E1600 (the CLI's own law)", async () => {
    const ws = await makeWorkspace(ALLOW_YAML);
    const handle = await startDaemon({ workspaceDir: ws, port: 0, token: "pkg" });
    try {
      const res = await jsonFetch(handle, "POST", "/packages/pack", { token: "pkg", body: {} });
      expect(res.status).toBe(400);
      expect((res.body.error as { code?: string }).code).toBe("E1600");
    } finally {
      await handle.stop({ force: true });
    }
  });

  test("verify over the wire passes a real bundle and refuses a tampered one", async () => {
    const ws = await makePackageWorkspace();
    const handle = await startDaemon({ workspaceDir: ws, port: 0, token: "pkg" });
    try {
      const pack = await jsonFetch(handle, "POST", "/packages/pack", { token: "pkg", body: {} });
      expect(pack.status).toBe(200);
      const bundleRel = String(pack.body.out);

      const good = await jsonFetch(handle, "POST", "/packages/verify", { token: "pkg", body: { path: bundleRel } });
      expect(good.status).toBe(200);
      expect(good.body.ok).toBe(true);
      expect(good.body.code).toBeUndefined();
      expect(Number(good.body.entries_verified)).toBeGreaterThan(0);
      expect(good.body.journal_verified).toBe(true);
      expect(await journalTypes(ws, String(good.body.run_id))).toContain("package.verified");

      // dry_run verify: report only — no new journal.
      const before = (await listJournals(join(ws, ".vaerion", "journal"))).length;
      const dry = await jsonFetch(handle, "POST", "/packages/verify", { token: "pkg", body: { path: bundleRel, dry_run: true } });
      expect(dry.status).toBe(200);
      expect(dry.body.dry_run).toBe(true);
      expect((await listJournals(join(ws, ".vaerion", "journal"))).length).toBe(before);

      // Tamper: flip one payload byte — the pure check must refuse.
      const bytes = await readFile(join(ws, bundleRel));
      expect(bytes.length).toBeGreaterThan(0);
      const last = bytes.length - 1;
      bytes[last] = (bytes[last] ?? 0) ^ 0xff;
      const badRel = "bad.vxn";
      await writeFile(join(ws, badRel), bytes);
      const bad = await jsonFetch(handle, "POST", "/packages/verify", { token: "pkg", body: { path: badRel } });
      expect(bad.status).toBe(200); // an honest negative report, not a transport error
      expect(bad.body.ok).toBe(false);
      expect(bad.body.code).toBe("E2206");
      expect(Array.isArray(bad.body.findings)).toBe(true);

      // The path law: traversal outside the workspace is refused.
      const outside = await jsonFetch(handle, "POST", "/packages/verify", { token: "pkg", body: { path: "../outside.vxn" } });
      expect(outside.status).toBe(400);
      expect((outside.body.error as { code?: string }).code).toBe("E2204");
    } finally {
      await handle.stop({ force: true });
    }
  });

  test("import admits a verified bundle through the SDK client and refuses a tampered one", async () => {
    // Produce a bundle in a source workspace via the CLI.
    const srcWs = await makePackageWorkspace();
    const built = await runCli(["package", "build"], { out: () => undefined, err: () => undefined }, srcWs);
    expect(built.code).toBe(0);
    const bundleBytes = await readFile(join(srcWs, ".vaerion", "package", "daemon-packages.vxn"));

    const ws = await makePackageWorkspace();
    await mkdir(join(ws, "incoming"), { recursive: true });
    await writeFile(join(ws, "incoming", "daemon-packages.vxn"), bundleBytes);

    const handle = await startDaemon({ workspaceDir: ws, port: 0, token: "pkg" });
    try {
      const client = new VaeDaemonClient({ base: `http://127.0.0.1:${handle.port}`, token: "pkg" });

      // dry-run import: report what would be admitted, write nothing.
      const dry = (await client.packageImport({ path: "incoming/daemon-packages.vxn", dryRun: true })) as Record<string, unknown>;
      expect(dry.dry_run).toBe(true);
      expect(dry.would_admit).toBe(join(".vaerion", "package", "daemon-packages.vxn"));

      // Real admission through the sanctioned client site.
      const done = (await client.packageImport({ path: "incoming/daemon-packages.vxn" })) as Record<string, unknown>;
      expect(done.admitted).toBe(join(".vaerion", "package", "daemon-packages.vxn"));
      expect(done.journal_verified).toBe(true);
      const admittedBytes = await readFile(join(ws, String(done.admitted)));
      expect(Buffer.from(admittedBytes).equals(Buffer.from(bundleBytes))).toBe(true);
      expect(await journalTypes(ws, String(done.run_id))).toContain("package.imported");

      // The admitted bundle verifies against the importing workspace.
      const verified = (await client.packageVerify({ path: String(done.admitted) })) as Record<string, unknown>;
      expect(verified.ok).toBe(true);

      // A tampered bundle is NEVER admitted (verify-first law, E2206).
      const evil = Buffer.from(bundleBytes);
      expect(evil.length).toBeGreaterThan(0);
      const evilLast = evil.length - 1;
      evil[evilLast] = (evil[evilLast] ?? 0) ^ 0xff;
      await writeFile(join(ws, "incoming", "evil.vxn"), evil);
      try {
        await client.packageImport({ path: "incoming/evil.vxn" });
        expect.unreachable();
      } catch (err) {
        expect((err as { code?: string }).code).toBe("E2206");
      }
      await expect(readFile(join(ws, ".vaerion", "package", "evil.vxn"))).rejects.toThrow();
    } finally {
      await handle.stop({ force: true });
    }
  });
});
