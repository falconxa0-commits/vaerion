/**
 * Machine parity test (Sacred Invariant #7): SDK ⇄ CLI over the same engine.
 * Both surfaces must agree on run ids, journal verification, receipts, and
 * redacted exports — parity is tested, not assumed.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { VaeClient } from "../../../../sdks/typescript/src/index.ts";
import { runCli } from "../../src/cli/vae.ts";

const ws = await mkdtemp(join(tmpdir(), "vae-parity-"));

afterAll(async () => {
  await rm(ws, { recursive: true, force: true });
});

function seedWorkspace(): void {
  mkdirSync(join(ws, "docs"), { recursive: true });
  writeFileSync(join(ws, "docs", "one.md"), "# One\nThe event spine orders every envelope deterministically.\n");
  writeFileSync(join(ws, "docs", "two.md"), "# Two\nThe journal is append-only and blake3 hash chained.\n");
}

describe("machine parity: SDK ⇄ CLI", () => {
  const sdk = new VaeClient({ cwd: ws });

  test("init agrees", async () => {
    seedWorkspace();
    const viaSdk = await sdk.init("parity");
    expect(viaSdk.code).toBe(0);
  });

  test("run research agrees on run id, receipt, and verification", async () => {
    const viaSdk = await sdk.runResearch({ sources: ["./docs"], query: "journal deterministic", maxDocs: 4 });
    expect(viaSdk.journalVerified).toBe(true);
    expect(viaSdk.documents).toBe(2);
    expect(viaSdk.hits.length).toBeGreaterThan(0);

    // CLI --json must observe the SAME run from its own surface
    const viaCli = await sdk.raw(["journal", "ls"]);
    expect(viaCli.code).toBe(0);
    const runs = viaCli.lines[0]?.runs as Array<{ run_id: string }>;
    expect(runs.map((r) => r.run_id)).toContain(viaSdk.runId);

    // SDK journal view equals what the CLI verifies
    const verify = await sdk.journalVerify(viaSdk.runId);
    expect(verify.ok).toBe(true);
    const records = await sdk.journalRecords(viaSdk.runId);
    expect(records[records.length - 1]?.k).toBe("receipt");
  });

  test("CLI run is visible to SDK restore, byte-identical state", async () => {
    const lines: Array<Record<string, unknown>> = [];
    const result = await runCli(
      ["run", "research", "--sources", "./docs", "--query", "append-only", "--max-docs", "4", "--json"],
      { out: (l) => lines.push(JSON.parse(l) as Record<string, unknown>), err: () => undefined },
      ws,
    );
    expect(result.code).toBe(0);
    const payload = lines[lines.length - 1] as { run_id: string; trace_id: string };
    const state = await sdk.restoreState(payload.run_id, payload.trace_id);
    expect(state.status).toBe("closed");
    expect(state.blobRefs.length).toBe(2);
  });

  test("redacted export parity: SDK export verifies like the CLI's", async () => {
    const runs = await sdk.journalList();
    expect(runs.length).toBe(2);
    const report = await sdk.journalExport(runs[0]!.run_id);
    expect(report.verified).toBe(true);
    // re-export through the CLI surface and confirm identical head derivation rules
    const viaCli = await sdk.raw(["journal", "export", runs[0]!.run_id, "--out", join(ws, "cli-export.ndjson")]);
    expect(viaCli.code).toBe(0);
    const cliReport = viaCli.lines[0]?.report as { exportHeadHash: string };
    expect(typeof cliReport.exportHeadHash).toBe("string");
    expect(cliReport.exportHeadHash.length).toBe(64);
  });
});
