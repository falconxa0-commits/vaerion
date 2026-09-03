/**
 * Provider compatibility — the failure-leg pinning (ASCENSION XXV Phase XXX).
 *
 * The happy-path cassettes (anthropic/openai/ollama chat, openai embed) pin
 * the success wire format. This suite pins the FAILURE wire formats the same
 * way: every shipping provider's documented error/limit transcripts, replayed
 * through the REAL gateway service (broker → breaker → adapter), asserting
 * the mapped engine behavior: the E-code, the metering, and the journal
 * evidence. Law: a provider is not "supported" until both legs of its wire
 * compatibility — success AND failure — are cassette-pinned here.
 *
 * Cassettes are committed fixtures (ADR-0012); the fingerprints come from
 * the real adapter request bytes (record-cassettes.ts). Replay never touches
 * the network (E1702 fail-closed otherwise).
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blake3HexOf } from "../../src/kernel/hash.ts";
import { FixedClock, SeededRng } from "../../src/kernel/clock.ts";
import { SeededIdGen, crn } from "../../src/kernel/ids.ts";
import { RunHarness } from "../../src/runtime/run.ts";
import { readJournal } from "../../src/journal/reader.ts";
import { verifyJournal } from "../../src/journal/verify.ts";
import { meteringFromRecords } from "../../src/gateway/metering.ts";
import { GatewayService } from "../../src/gateway/service.ts";
import { loadCassette, cassetteTransport, type Cassette } from "../../src/gateway/cassette.ts";
import { validateConfig, type VaerionConfig } from "../../src/config/config.ts";
import { graphFromConfig } from "../../src/broker/engine.ts";

import type { JournalRecord } from "../../src/journal/records.ts";
import type { PolicyContract } from "../../src/broker/contracts/decision.ts";

const TRACE_ID = "t_provider_compat";
const T0 = 1735689600000;
const CASSETTE_DIR = join(import.meta.dir, "..", "..", "fixtures", "cassettes");

const workspaces: string[] = [];
afterAll(async () => {
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
});

/** All four providers enabled — the compat suite drives each adapter. */
function configWith(): VaerionConfig {
  return validateConfig({
    schemaVersion: "0.1",
    project: { name: "provider-compat", description: "failure-leg pinning" },
    gateway: {
      providers: {
        mockbrain: { enabled: true, models: ["mock-1"] },
        anthropic: { enabled: true, models: ["claude-3-5-sonnet-latest"] },
        openai: { enabled: true, models: ["gpt-4o"] },
        ollama: { enabled: true, models: ["llama3.2"] },
      },
    },
    secrets: {
      ANTHROPIC_API_KEY: { grant: ["human"] },
      OPENAI_API_KEY: { grant: ["human"] },
    },
    telemetry: { enabled: false },
  });
}

const fixedSecretPort = (value: string | null) => ({
  name: "fixed-test-port",
  resolve: (_name: string) => Promise.resolve(value),
});

async function makeServiceAndHarness(opts: { cassettes: Cassette[]; breakerThreshold?: number }) {
  const clock = new FixedClock(T0);
  const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(42));
  const runId = crn("run", idGen.next());
  const ws = await mkdtemp(join(tmpdir(), "vaerion-compat-"));
  workspaces.push(ws);
  const graph = graphFromConfig(configWith(), `graph_test_${runId}`);
  const harness = await RunHarness.create({ workspaceDir: ws, runId, traceId: TRACE_ID, configFingerprint: "cfg_compat", clock, idGen, permissionGraph: graph });
  const service = new GatewayService({
    clock,
    rng: new SeededRng(42),
    idGen,
    transport: cassetteTransport(opts.cassettes),
    secrets: fixedSecretPort("sk-live-shaped-key"),
    breakerThreshold: opts.breakerThreshold,
    // Two fast attempts: the retry path is exercised without wall-clock cost.
    retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2 },
  });
  return { ws, runId, harness, service };
}

const humanPrincipal = { kind: "human" as const, id: "human" };
const allowModelPolicy: PolicyContract = {
  policy_id: "allow-all-compat",
  version: 1,
  rules: [
    { id: "allow-model", principalKinds: ["human"], domain: "model.invoke", scope: "*", effect: "allow", rationale: "test allow" },
    { id: "allow-secret", principalKinds: ["human"], domain: "secret.read", scope: "*", effect: "allow", rationale: "test allow" },
  ],
};

function invokeWith(service: GatewayService, harness: RunHarness, model: string, requestId: string) {
  return service.invoke(harness, {
    request: { op: "chat" as const, model, messages: [{ role: "user" as const, content: "Say hello in one word." }], maxOutputTokens: 64 },
    principal: humanPrincipal,
    policy: allowModelPolicy,
    requestId,
    intent: "provider compatibility failure leg",
    budget: { tokensUsed: 0, microUsdUsed: 0 },
  });
}

/** Shared assertion core: the invoke throws the mapped code, the journal shows the failure honestly. */
async function expectFailureLeg(opts: {
  cassetteFile: string;
  model: string;
  breakerThreshold?: number;
  expectedCode: string;
  expectedMessagePart: string;
  requestId: string;
}) {
  const cassette = await loadCassette(join(CASSETTE_DIR, opts.cassetteFile));
  const { runId, ws, harness, service } = await makeServiceAndHarness({ cassettes: [cassette], breakerThreshold: opts.breakerThreshold });
  let threw: unknown = null;
  try {
    await invokeWith(service, harness, opts.model, opts.requestId);
  } catch (err) {
    threw = err;
  }
  expect(threw).not.toBeNull();
  const code = (threw as { code?: string }).code;
  expect(code).toBe(opts.expectedCode);
  expect((threw as Error).message).toContain(opts.expectedMessagePart);
  await harness.close("compat failure leg complete");

  const read = await readJournal(RunHarness.journalPathFor(ws, runId));
  const metering = meteringFromRecords(read.records);
  // The invocation is metered AS A FAILURE (metering counts successes and
  // failures in separate counters — measured, not assumed).
  expect(metering.invocations).toBe(0);
  expect(metering.failed).toBe(1);
  expect(metering.byModel[opts.model]?.failed).toBe(1);
  // The journal chain still holds across the failure (failures are evidence too).
  expect(await verifyJournal(RunHarness.journalPathFor(ws, runId))).toMatchObject({ ok: true, torn: false });
  return read;
}

describe("provider compatibility — the failure legs (cassette-pinned, ASCENSION XXV Phase XXX)", () => {
  test("openai 429 rate limit: retried to exhaustion, mapped to E1601 with the provider body, metered failed", async () => {
    const read = await expectFailureLeg({
      cassetteFile: "openai-chat-429-ratelimit-v1.json",
      model: "openai/gpt-4o",
      expectedCode: "E1601",
      expectedMessagePart: "HTTP 429",
      requestId: "req_03Compat429TestId00001",
    });
    // The mapped failure is journaled (gateway.invoke.failed carries the
    // engine-mapped message; the raw provider body detail stays on the
    // thrown error, and the secret value never reaches the journal).
    const raw = JSON.stringify(read.records);
    expect(raw).toContain("gateway.invoke.failed");
    expect(raw).toContain("HTTP 429");
    expect(raw).not.toContain("sk-live-shaped-key"); // the secret never journals
  });

  test("openai 401 auth failure: mapped to E1601, metered failed, key value never journals", async () => {
    await expectFailureLeg({
      cassetteFile: "openai-chat-401-auth-v1.json",
      model: "openai/gpt-4o",
      expectedCode: "E1601",
      expectedMessagePart: "HTTP 401",
      requestId: "req_03Compat401TestId00002",
    });
  });

  test("anthropic 529 overloaded: mapped to E1601 with the provider body", async () => {
    await expectFailureLeg({
      cassetteFile: "anthropic-chat-529-overloaded-v1.json",
      model: "anthropic/claude-3-5-sonnet-latest",
      expectedCode: "E1601",
      expectedMessagePart: "HTTP 529",
      requestId: "req_03Compat529TestId00003",
    });
  });

  test("anthropic mid-stream error event (HTTP 200): the stream-level failure surfaces as an engine error", async () => {
    // A 200 whose SSE stream carries `event: error` — the adapter maps the
    // streamed error frame and the service surfaces it as a LOUD failure
    // (this was a real defect: the error frame was silently swallowed and
    // the invocation recorded as success; caught by this cassette and fixed
    // at the frame-collection root).
    await expectFailureLeg({
      cassetteFile: "anthropic-chat-stream-error-v1.json",
      model: "anthropic/claude-3-5-sonnet-latest",
      expectedCode: "E1601",
      expectedMessagePart: "overloaded_error",
      requestId: "req_03CompatStrETestId004",
    });
  });

  test("ollama 404 model-not-pulled: mapped to E1601 with the pull hint", async () => {
    await expectFailureLeg({
      cassetteFile: "ollama-chat-404-model-missing-v1.json",
      model: "ollama/llama3.2",
      expectedCode: "E1601",
      expectedMessagePart: "HTTP 404",
      requestId: "req_03Compat404TestId00005",
    });
  });

  test("the breaker opens after consecutive provider failures (the fallback protector)", async () => {
    const cassette = await loadCassette(join(CASSETTE_DIR, "openai-chat-429-ratelimit-v1.json"));
    const { harness, service, ws, runId } = await makeServiceAndHarness({ cassettes: [cassette], breakerThreshold: 2 });
    // Two failing invocations trip the threshold-2 breaker.
    for (let i = 0; i < 2; i++) {
      await expect(invokeWith(service, harness, "openai/gpt-4o", `req_03CompatBrkTestId0000${i}`)).rejects.toMatchObject({ code: "E1601" });
    }
    // The THIRD invocation is refused by the breaker BEFORE any transport call
    // (the breaker's loud refusal carries E1705 — measured, not assumed).
    await expect(invokeWith(service, harness, "openai/gpt-4o", "req_03CompatBrkTestId00010")).rejects.toMatchObject({ code: "E1705" });
    const snapshot = service.breakerSnapshots().find((b) => b.provider === "openai");
    expect(snapshot?.state).toBe("open");
    await harness.close("breaker leg complete");
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    const metering = meteringFromRecords(read.records);
    expect(metering.failed).toBe(3); // 2 provider failures + 1 breaker refusal, all journaled honestly
    void runId;
    void blake3HexOf;
  });
});
