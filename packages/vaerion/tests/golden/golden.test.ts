/**
 * Golden fixtures — contract governance (Stage 20 §12.5).
 *
 * Goldens regenerate ONLY via explicit bless: `VAE_BLESS=1 bun test tests/golden/`.
 * Every other run must reproduce the committed bytes exactly. Any diff means
 * the contract moved and demands review before merge.
 *
 * Fixtures pin: envelope encoding, the journal hash chain over a fixed
 * seed/clock (the blake3 chain itself), redaction output, and receipt shape.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixedClock, SeededRng } from "../../src/kernel/clock.ts";
import { SeededIdGen, crn } from "../../src/kernel/ids.ts";
import { draftEnvelope } from "../../src/spine/envelope.ts";
import { encodeEnvelope } from "../../src/spine/serialization.ts";
import { RunHarness } from "../../src/runtime/run.ts";
import { readJournal } from "../../src/journal/reader.ts";
import { redactDeep } from "../../src/kernel/redact.ts";
import { RefusalLogWriter, verifyRefusalLog } from "../../src/broker/refusal-log.ts";

const FIXTURE_DIR = join(import.meta.dir, "..", "..", "fixtures", "golden");
const BLESS = process.env.VAE_BLESS === "1";

async function loadFixture(name: string): Promise<string> {
  return readFile(join(FIXTURE_DIR, name), "utf8");
}
async function saveFixture(name: string, content: string): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true });
  await writeFile(join(FIXTURE_DIR, name), content, "utf8");
}

// Synchronous compare helper (fixtures are small).
function compareGolden(name: string, actual: string, expected: string): void {
  expect(`${name}\n${actual}`).toBe(`${name}\n${expected}`);
}

const ws = await mkdtemp(join(tmpdir(), "vae-golden-"));
const clock = new FixedClock(1735689600000);
const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(2026));
const runId = crn("run", idGen.next());

beforeAll(async () => {
  const h = await RunHarness.create({ workspaceDir: ws, runId, traceId: "t_golden", configFingerprint: "cfg_golden", clock, idGen });
  await h.emit("run.state.changed", { to: "working" });
  await h.emit("store.blob.put", { blob_ref: { alg: "blake3", hash: "aa".repeat(32), size: 8 } }, { kind: "tool", id: "tool_gold" }, { kind: "envelope", ref: "1" });
  await h.close("golden run complete");
});

afterAll(async () => {
  await rm(ws, { recursive: true, force: true });
});

describe("golden: envelope encoding", () => {
  test("envelope v1 canonical line is byte-stable", async () => {
    const env = draftEnvelope({
      type: "tool.call.completed",
      traceId: "t_golden",
      spanId: "s_gold0001",
      actor: { kind: "tool", id: "tool_gold" },
      cause: { kind: "envelope", ref: "1" },
      payload: { tool: "fs.write", bytes_delta: 128 },
      clock,
    });
    const line = encodeEnvelope({ ...env, seq: 41 });
    const expected = BLESS ? line : await loadFixture("envelope-v1.golden.json");
    if (BLESS) await saveFixture("envelope-v1.golden.json", line);
    else compareGolden("envelope-v1.golden.json", line, expected);
  });
});

describe("golden: journal hash chain", () => {
  test("the blake3 chain over a fixed seed is byte-stable", async () => {
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    const compact = read.records.map((r) => ({ k: r.k, i: r.i, hash: r.hash }));
    const actual = JSON.stringify(compact, null, 2) + "\n";
    if (BLESS) {
      await saveFixture("journal-chain.golden.json", actual);
      return;
    }
    const expected = await loadFixture("journal-chain.golden.json");
    compareGolden("journal-chain.golden.json", actual, expected);
  });

  test("chain linkage: every prev equals the previous hash, genesis = zeros", async () => {
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    expect(read.records[0]!.prev).toBe("0".repeat(64));
    for (let i = 1; i < read.records.length; i++) {
      expect(read.records[i]!.prev).toBe(read.records[i - 1]!.hash);
    }
  });
});

describe("golden: redaction", () => {
  test("redaction output is deterministic and secret-free", async () => {
    const sample = {
      msg: "deploy with ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890 done",
      api_key: "raw-secret-value",
      nested: { authorization: "Bearer abcdef1234567890abcd" },
    };
    const actual = JSON.stringify(redactDeep(sample), null, 2) + "\n";
    if (BLESS) {
      await saveFixture("redaction.golden.json", actual);
      return;
    }
    const expected = await loadFixture("redaction.golden.json");
    compareGolden("redaction.golden.json", actual, expected);
    expect(actual).not.toContain("ghp_ABCDEF");
    expect(actual).not.toContain("raw-secret-value");
  });
});

describe("golden: receipt", () => {
  test("receipt shape over the golden run", async () => {
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    const receiptRec = read.records.find((r) => r.k === "receipt") as { receipt: Record<string, unknown> } | undefined;
    expect(receiptRec).toBeDefined();
    const r = receiptRec!.receipt as Record<string, unknown>;
    const stable = {
      counts: r.counts,
      trace_id: r.trace_id,
      engine_version: r.engine_version,
      config_fingerprint: r.config_fingerprint,
      summary: r.summary,
    };
    const actual = JSON.stringify(stable, null, 2) + "\n";
    if (BLESS) {
      await saveFixture("receipt.golden.json", actual);
      return;
    }
    const expected = await loadFixture("receipt.golden.json");
    compareGolden("receipt.golden.json", actual, expected);
  });
});

describe("golden: refusal log chain", () => {
  test("the blake3 refusal chain over a fixed seed is byte-stable", async () => {
    const refusalsDir = join(ws, "refusals");
    const path = join(refusalsDir, "refusals.log");
    const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(99));
    const w = await RefusalLogWriter.open(path, null, clock);
    const denyOf = (requestId: string, reasonCode: "E1300" | "E1301", reason: string, policy: string) => ({
      decision_id: idGen.next(),
      request_id: requestId,
      run_id: runId,
      trace_id: "t_golden",
      principal: { kind: "agent" as const, id: "agent_gold" },
      domain: "net.connect" as const,
      scope: "api.example.com",
      intent: "call the declared API",
      decision: { kind: "deny" as const, reason_code: reasonCode, reason, policy },
      decided_at: clock.nowIso(),
    });
    await w.append({ runId, record: denyOf("rq_g1", "E1300", "declared host ceiling refuses", "graph_gold:ceiling") });
    await w.append({ runId, record: denyOf("rq_g2", "E1301", "no policy rule matched — broker fails closed", "policy_gold:default-deny") });
    await w.close();

    const raw = await readFile(path, "utf8");
    const compact = raw.split("\n").filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as Record<string, unknown>)
      .map((e) => ({ i: e.i, prev: e.prev, hash: e.hash, reason_code: e.reason_code, policy: e.policy }));
    const actual = JSON.stringify(compact, null, 2) + "\n";
    if (BLESS) {
      await saveFixture("refusal.golden.json", actual);
      return;
    }
    const expected = await loadFixture("refusal.golden.json");
    compareGolden("refusal.golden.json", actual, expected);

    const report = await verifyRefusalLog(path);
    expect(report.ok).toBe(true);
    expect(report.entries).toBe(2);
  });
});
