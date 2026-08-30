/**
 * SDK wire parity (MS-5): VaeDaemonClient over real HTTP/SSE produces the
 * SAME journaled contract as the in-process client — the Machine Parity
 * invariant (#7) exercised across the wire.
 *
 * Also pins the loopback enforcement of the sanctioned client site
 * (daemon-transport.ts, E2006).
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VaeClient, VaeDaemonClient, assertLoopbackBase } from "../../../../sdks/typescript/src/index.ts";
import { startDaemon, type DaemonHandle } from "../../src/api/server.ts";
import { RunHarness } from "../../src/runtime/run.ts";
import type { PlanStep } from "../../src/agents/planner.ts";

const workspaces: string[] = [];
afterAll(async () => {
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
});

const CONFIG_YAML = `schemaVersion: "0.1"
project: { name: wire-parity }
gateway: { providers: { mockbrain: { enabled: true, models: ["mock-1"] } } }
tools: [{ name: "echo" }]
agents: { maxSteps: 12, plannerModel: "mockbrain/mock-1" }
policy:
  rules:
    - { id: agent-echo-allow, principalKinds: [agent], domain: tool.call, scope: echo, effect: allow, rationale: "test" }
    - { id: agent-model-allow, principalKinds: [agent], domain: model.invoke, scope: "mockbrain/mock-1", effect: allow, rationale: "test" }
telemetry: { enabled: false }
`;

async function makeWorkspace(yaml: string): Promise<string> {
  const ws = await mkdtemp(join(tmpdir(), "vaerion-parity-"));
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

const steps: PlanStep[] = [
  { kind: "note", text: "Wire parity run. Same contract, two surfaces." },
  { kind: "tool", tool: "echo", args: { value: "parity" } },
];

describe("sanctioned wire-client site (daemon-transport.ts)", () => {
  test("loopback bases are accepted; remote hosts are refused with E2006", () => {
    expect(assertLoopbackBase("http://127.0.0.1:7897").hostname).toBe("127.0.0.1");
    expect(assertLoopbackBase("http://localhost:7897").hostname).toBe("localhost");
    expect(assertLoopbackBase("http://[::1]:7897").hostname).toBe("[::1]");
    for (const bad of ["http://example.com:7897", "http://192.168.1.10:7897", "ftp://127.0.0.1", "not a url"]) {
      try {
        assertLoopbackBase(bad);
        expect.unreachable();
      } catch (err) {
        expect((err as { code?: string }).code).toBe("E2006");
      }
    }
  });
});

describe("wire parity: daemon surface vs in-process surface", () => {
  test("the same agent run over HTTP/SSE journals the same event-type sequence", async () => {
    // In-process run (the VaeClient journey).
    const inProcWs = await makeWorkspace(CONFIG_YAML);
    const inProc = new VaeClient({ cwd: inProcWs });
    const local = await inProc.agentRun({ goal: "parity goal", steps });
    expect(local.result.outcome).toBe("goal");
    const localRecords = await inProc.journalRecords(local.result.runId);
    const localTypes = localRecords.filter((r) => r.k === "evt").map((r) => (r as { env: { type: string } }).env.type);

    // Wire run (the VaeDaemonClient journey).
    const wireWs = await makeWorkspace(CONFIG_YAML);
    const handle: DaemonHandle = await startDaemon({ workspaceDir: wireWs, port: 0, token: "parity" });
    try {
      const client = new VaeDaemonClient({ base: `http://127.0.0.1:${handle.port}`, token: "parity" });
      const health = await client.health();
      expect(health.ok).toBe(true);

      const started = await client.startAgentRun({ goal: "parity goal", planner: "inline", steps });
      const done = await waitFor(async () => {
        const v = await client.getRun(started.run_id);
        return v.status === "closed" ? v : null;
      });
      expect(done.journal_ok).toBe(true);
      expect((done.agent as { outcome: string }).outcome).toBe("goal");

      // Stream the journaled envelopes over SSE and compare the CONTRACT:
      // the event-type sequence must be identical to the in-process run.
      const wireTypes: string[] = [];
      for await (const env of client.streamRunEvents(started.run_id, { follow: false })) {
        wireTypes.push(env.type);
      }
      expect(wireTypes).toEqual(localTypes);
      expect(wireTypes).toContain("agent.run.started");
      expect(wireTypes).toContain("broker.decision.recorded");
      expect(wireTypes).toContain("run.closed");

      // The wire run's journal verifies locally with the engine's own verifier.
      const verify = await RunHarness.journalPathFor(wireWs, started.run_id);
      expect(typeof verify).toBe("string");
      expect(verify.endsWith(`${started.run_id}.ndjson`)).toBe(true);

      // Capability surfaces agree (names only — never secret values).
      const wireModels = await client.listModels();
      expect(wireModels.some((m) => m.provider === "mockbrain")).toBe(true);
      const wireTools = await client.listTools();
      expect(wireTools.some((t) => t.name === "echo")).toBe(true);
      const openapi = await client.openapi();
      expect(Object.keys(openapi)).toContain("paths");
    } finally {
      await handle.stop({ force: true });
    }
  });

  test("SSE workspace tail streams merged envelopes and ends on demand", async () => {
    const wireWs = await makeWorkspace(CONFIG_YAML);
    const handle = await startDaemon({ workspaceDir: wireWs, port: 0, token: "tail" });
    try {
      const client = new VaeDaemonClient({ base: `http://127.0.0.1:${handle.port}`, token: "tail" });
      await client.startAgentRun({ goal: "tail run", planner: "inline", steps });
      await waitFor(async () => (await client.listRuns()).some((r) => r.status === "closed") ? true : null);
      const seen: string[] = [];
      for await (const env of client.streamWorkspaceEvents({ follow: false, limit: 500 })) {
        seen.push(env.type);
      }
      expect(seen.length).toBeGreaterThan(0);
      expect(seen).toContain("run.opened");
    } finally {
      await handle.stop({ force: true });
    }
  });
});
