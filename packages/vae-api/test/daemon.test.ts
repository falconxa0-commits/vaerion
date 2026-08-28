import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixedClock } from "vae-foundation";
import { openEngineContext, WorkspaceService, RunService } from "vae-agent";
import { startDaemon, tokensMatch, openapiDocument, mintToken } from "../src/index.ts";

const clock = fixedClock(1_700_000_000_000);

function workspaceWithRun(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "vae-api-"));
  new WorkspaceService().init(dir, { clock });
  const ctx = openEngineContext({ cwd: dir, clock, env: {} });
  new RunService(ctx).run("selfcheck");
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("pairing token (D17.9)", () => {
  it("mints once, reuses, and compares in constant time", () => {
    const dir = mkdtempSync(join(tmpdir(), "vae-token-"));
    try {
      const file = join(dir, "token");
      const t1 = tokensMatch;
      void t1;
      const token = mintToken(file);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(mintToken(file)).toBe(token); // reuse, not re-mint
      expect(tokensMatch(token, token)).toBeTrue();
      expect(tokensMatch("wrong", token)).toBeFalse();
      expect(tokensMatch(undefined, token)).toBeFalse();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("daemon (D7.2, D17.7, D17.9)", () => {
  it("serves health, runs, journal stream, and spec over loopback", async () => {
    const { dir, cleanup } = workspaceWithRun();
    try {
      const ctx = openEngineContext({ cwd: dir, clock, env: {} });
      const daemon = startDaemon(ctx, { port: 0, hostname: "127.0.0.1" });

      // Health is open, envelope-shaped.
      const health = await fetch(`${daemon.url}/v1/health`);
      expect(health.status).toBe(200);
      const healthBody = (await health.json()) as { v: number; type: string; payload: { ok: boolean } };
      expect(healthBody.v).toBe(1);
      expect(healthBody.payload.ok).toBeTrue();

      // Everything else requires the token.
      const noAuth = await fetch(`${daemon.url}/v1/runs`);
      expect(noAuth.status).toBe(401);
      const badAuth = await fetch(`${daemon.url}/v1/runs`, { headers: { authorization: "Bearer nope" } });
      expect(badAuth.status).toBe(401);

      const auth = { authorization: `Bearer ${daemon.token}` };
      const runs = await fetch(`${daemon.url}/v1/runs`, { headers: auth });
      expect(runs.status).toBe(200);
      const runsBody = (await runs.json()) as { payload: { runs: { runId: string; status: string }[] } };
      expect(runsBody.payload.runs.length).toBe(1);
      expect(runsBody.payload.runs[0]!.status).toBe("completed");

      // NDJSON journal stream, envelope-aligned (D17.8 posture).
      const runId = runsBody.payload.runs[0]!.runId;
      const stream = await fetch(`${daemon.url}/v1/runs/${runId}/journal`, { headers: auth });
      expect(stream.headers.get("content-type")).toContain("application/x-ndjson");
      const text = await stream.text();
      const lines = text.trim().split("\n");
      expect(lines.length).toBe(8); // started + 3×(decision, completed) + final
      const first = JSON.parse(lines[0]!) as { type: string; run_id: string };
      expect(first.type).toBe("journal.entry.appended");
      expect(first.run_id).toBe(runId);

      // Spec endpoint emits the OpenAPI contract (D17.1).
      const spec = await fetch(`${daemon.url}/v1/spec`, { headers: auth });
      const specBody = (await spec.json()) as { payload: { openapi: { openapi: string; paths: Record<string, unknown> } } };
      expect(specBody.payload.openapi.openapi).toBe("3.1.0");
      expect(Object.keys(specBody.payload.openapi.paths)).toContain("/v1/runs");

      daemon.stop();
    } finally {
      cleanup();
    }
  });

  it("the emitted document includes the ratification metadata", () => {
    const doc = openapiDocument("127.0.0.1", 7897) as { info: { version: string }; servers: { url: string }[] };
    expect(doc.info.version).toBe("0.1.0-ms.0");
    expect(doc.servers[0]!.url).toBe("http://127.0.0.1:7897");
  });
});
