import { describe, expect, it } from "bun:test";
import { VaeClient, SdkError, type Envelope } from "../src/index.ts";
import { startDaemon } from "../../../packages/vae-api/src/index.ts";
import { openEngineContext, WorkspaceService, RunService } from "../../../packages/vae-agent/src/index.ts";
import { fixedClock } from "../../../packages/vae-foundation/src/index.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const clock = fixedClock(1_700_000_000_000);

describe("SDK client (D17.7, D17.9 posture)", () => {
  it("reads health, runs, and streams the journal over the daemon", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vae-sdk-"));
    try {
      new WorkspaceService().init(dir, { clock });
      const ctx = openEngineContext({ cwd: dir, clock, env: {} });
      const run = new RunService(ctx).run("selfcheck");
      const daemon = startDaemon(ctx, { port: 0, hostname: "127.0.0.1" });

      const client = new VaeClient({ baseUrl: daemon.url, token: daemon.token });
      const health = await client.health();
      expect(health.v).toBe(1);

      const runs = await client.runs();
      const list = (runs.payload as { runs: { runId: string; status: string }[] }).runs;
      expect(list.length).toBe(1);

      const events: Envelope[] = [];
      for await (const ev of client.journal(run.runId)) events.push(ev);
      expect(events.length).toBe(8);
      expect(events[0]!.type).toBe("journal.entry.appended");

      // Errors are typed with the engine's E#### contract (D17.6).
      const bad = new VaeClient({ baseUrl: daemon.url, token: "wrong" });
      await bad.runs().then(
        () => { throw new Error("should have refused"); },
        (e: unknown) => {
          expect(e).toBeInstanceOf(SdkError);
          expect((e as SdkError).code).toBe("E2013");
        },
      );

      daemon.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
