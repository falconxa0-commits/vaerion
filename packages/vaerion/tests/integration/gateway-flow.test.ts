/**
 * Vaerion Model Gateway — constitutional integration flow (MS-3).
 *
 * The law under test: EVERY model invocation crosses the single gate —
 *   decide (model.invoke) → journal → act (adapter → sanctioned transport)
 *   decide (secret.read)  → journal → resolve (call time only)
 *   meter (gateway.invoke.recorded | failed) on the spine.
 *
 * Hermetic by construction: temp workspaces, fixed clock, seeded ids,
 * cassette/scripted transports, MockBrain. The network is never touched.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FixedClock, SeededRng } from "../../src/kernel/clock.ts";
import { SeededIdGen, crn } from "../../src/kernel/ids.ts";
import { blake3HexOf } from "../../src/kernel/hash.ts";
import { RunHarness } from "../../src/runtime/run.ts";
import { readJournal } from "../../src/journal/reader.ts";
import { verifyJournal } from "../../src/journal/verify.ts";
import { readRefusals } from "../../src/broker/refusal-log.ts";
import { validateConfig, type VaerionConfig } from "../../src/config/config.ts";
import { graphFromConfig } from "../../src/broker/engine.ts";
import { GatewayService, GatewayGatePrompt } from "../../src/gateway/service.ts";
import { meteringFromRecords } from "../../src/gateway/metering.ts";
import { loadCassette, cassetteTransport } from "../../src/gateway/cassette.ts";
import type { GatewayTransport, TransportChunk, TransportRequest, TransportResponse } from "../../src/gateway/types.ts";
import type { JournalRecord } from "../../src/journal/records.ts";
import type { PolicyContract } from "../../src/broker/contracts/decision.ts";

const TRACE_ID = "t_gateway_test";
const T0 = 1735689600000;
const CASSETTE_DIR = join(import.meta.dir, "..", "..", "fixtures", "cassettes");

const workspaces: string[] = [];
afterAll(async () => {
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
});

function configWith(overrides: Partial<VaerionConfig> = {}): VaerionConfig {
  return validateConfig({
    schemaVersion: "0.1",
    project: { name: "gateway-it", description: "integration" },
    gateway: {
      providers: { mockbrain: { enabled: true, models: ["mock-1"] }, anthropic: { enabled: true, models: ["claude-3-5-sonnet-latest"] } },
      ...({} as Record<string, unknown>),
    },
    // ADR-0013: names only, with scoped grants — the human ceiling holds the
    // declared names; values resolve at call time through the injected port.
    secrets: { ANTHROPIC_API_KEY: { grant: ["human"] } },
    telemetry: { enabled: false },
    ...overrides,
  });
}

const fixedSecretPort = (value: string | null) => ({
  name: "fixed-test-port",
  resolve: (_name: string) => Promise.resolve(value),
});

async function makeServiceAndHarness(opts: {
  config: VaerionConfig;
  transport: GatewayTransport;
  secrets?: { name: string; resolve: (n: string) => Promise<string | null> };
  breakerThreshold?: number;
  retry?: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number };
}) {
  const clock = new FixedClock(T0);
  const idGen = new SeededIdGen(() => clock.nowMs(), new SeededRng(42));
  const runId = crn("run", idGen.next());
  const ws = await mkdtemp(join(tmpdir(), "vaerion-gw-"));
  workspaces.push(ws);
  const graph = graphFromConfig(opts.config, `graph_test_${runId}`);
  const harness = await RunHarness.create({ workspaceDir: ws, runId, traceId: TRACE_ID, configFingerprint: "cfg_gw_test", clock, idGen, permissionGraph: graph });
  const service = new GatewayService({
    clock,
    rng: new SeededRng(42),
    idGen,
    transport: opts.transport,
    secrets: opts.secrets ?? fixedSecretPort("sk-test-key"),
    breakerThreshold: opts.breakerThreshold,
    retry: opts.retry ?? { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2 },
  });
  return { clock, idGen, ws, runId, harness, service };
}

// The canonical local-human principal: graphFromConfig grants the "human"
// node the model.invoke ceiling scopes (gateway.providers) + secret names.
const humanPrincipal = { kind: "human" as const, id: "human" };
const chatRequest = (overrides: Record<string, unknown> = {}) => ({
  op: "chat" as const,
  model: "mockbrain/mock-1",
  messages: [{ role: "user" as const, content: "integration hello" }],
  seed: 42,
  ...overrides,
});

const allowModelPolicy: PolicyContract = {
  policy_id: "allow-all-test",
  version: 1,
  rules: [
    { id: "allow-model", principalKinds: ["human"], domain: "model.invoke", scope: "*", effect: "allow", rationale: "test allow" },
    { id: "allow-secret", principalKinds: ["human"], domain: "secret.read", scope: "*", effect: "allow", rationale: "test allow" },
  ],
};

/* ───────────────────────────  the allow flow  ───────────────────────── */

describe("gateway single-gate flow (allow path)", () => {
  test("mockbrain invoke: decide → journal → act → meter; journal verifies; cost is honest 0", async () => {
    const { runId, ws, harness, service } = await makeServiceAndHarness({ config: configWith(), transport: cassetteTransport([]) });
    const result = await service.invoke(harness, {
      request: chatRequest(),
      principal: humanPrincipal,
      policy: { policy_id: "allow-all-test", version: 1, rules: [{ id: "allow-model", principalKinds: ["human"], domain: "model.invoke", scope: "*", effect: "allow", rationale: "test allow" }] },
      requestId: "req_01AllowFlowTestId000000",
      intent: "integration allow flow",
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    const closed = await harness.close("allow flow complete");
    expect(closed.verify.ok).toBe(true);
    expect(result.provider).toBe("mockbrain");
    expect(result.text.startsWith("mock(seed=42):")).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.usage).not.toBeNull();
    expect(result.cost).toEqual({ inputMicroUsd: 0, outputMicroUsd: 0, totalMicroUsd: 0 }); // wildcard pricing: honest 0
    expect(result.textHash).toBe(await blake3HexOf(result.text));

    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    const decisions = read.records.filter((r) => r.k === "decision");
    expect(decisions).toHaveLength(1); // model.invoke decided once (mockbrain needs no secret)
    const recorded = read.records.filter((r): r is Extract<JournalRecord, { k: "evt" }> => r.k === "evt" && r.env.type === "gateway.invoke.recorded");
    expect(recorded).toHaveLength(1);
    const payload = recorded[0]!.env.payload as Record<string, unknown>;
    expect(payload.model).toBe("mockbrain/mock-1");
    expect(payload.decision_id).toBe((decisions[0] as { decision: { decision_id: string } }).decision.decision_id);
    expect(payload.usage).toEqual(result.usage);
    expect(payload.text_hash).toBe(result.textHash);
    expect(await verifyJournal(RunHarness.journalPathFor(ws, runId))).toMatchObject({ ok: true, torn: false });

    const metering = meteringFromRecords(read.records);
    expect(metering.invocations).toBe(1);
    expect(metering.failed).toBe(0);
  });

  test("full cassette replay through the service: anthropic cost = 102 µUSD, text hash journaled", async () => {
    const cassette = await loadCassette(join(CASSETTE_DIR, "anthropic-chat-basic-v1.json"));
    const { runId, ws, harness, service } = await makeServiceAndHarness({ config: configWith(), transport: cassetteTransport([cassette]), secrets: fixedSecretPort("sk-live-shaped-key") });
    const result = await service.invoke(harness, {
      request: { op: "chat", model: "anthropic/claude-3-5-sonnet-latest", messages: [{ role: "user", content: "Say hello in one word." }], maxOutputTokens: 64 },
      principal: humanPrincipal,
      policy: allowModelPolicy,
      requestId: "req_02CassetteTestId00000",
      intent: "cassette replay flow",
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    await harness.close("cassette flow complete");
    expect(result.text).toBe("Hello");
    expect(result.usage).toEqual({ inputTokens: 9, outputTokens: 5 });
    expect(result.cost!.inputMicroUsd).toBe(27); // 9 × 3 µUSD
    expect(result.cost!.outputMicroUsd).toBe(75); // 5 × 15 µUSD
    expect(result.cost!.totalMicroUsd).toBe(102);
    expect(result.attempts).toBe(1);

    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    const decisions = read.records.filter((r) => r.k === "decision");
    expect(decisions).toHaveLength(2); // model.invoke + secret.read — both broker-mediated
    const recorded = read.records.find((r): r is Extract<JournalRecord, { k: "evt" }> => r.k === "evt" && r.env.type === "gateway.invoke.recorded");
    expect((recorded!.env.payload as Record<string, unknown>).text).toBe("Hello");
    expect((recorded!.env.payload as Record<string, unknown>).text_hash).toBe(await blake3HexOf("Hello"));
    // the secret value never reached the journal
    const raw = JSON.stringify(read.records);
    expect(raw).not.toContain("sk-live-shaped-key");
  });
});

/* ───────────────────────────  the deny flow  ────────────────────────── */

describe("gateway single-gate flow (deny path)", () => {
  test("policy deny: journaled decision + refusal log entry; no invocation, no metering", async () => {
    const { runId, ws, harness, service } = await makeServiceAndHarness({ config: configWith(), transport: cassetteTransport([]) });
    let threw: unknown = null;
    try {
      await service.invoke(harness, {
        request: chatRequest(),
        principal: humanPrincipal,
        policy: { policy_id: "deny-test", version: 1, rules: [{ id: "deny-model", principalKinds: ["human"], domain: "model.invoke", scope: "*", effect: "deny", rationale: "no model calls in this workspace" }] },
        requestId: "req_03DenyFlowTestId0000000",
        intent: "integration deny flow",
        budget: { tokensUsed: 0, microUsdUsed: 0 },
      });
    } catch (err) {
      threw = err;
    }
    expect((threw as { code?: string }).code).toBe("E1300");
    await harness.close("denied flow closed");

    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    expect(read.records.some((r) => r.k === "evt" && r.env.type === "gateway.invoke.recorded")).toBe(false);
    const refusals = await readRefusals(join(ws, ".vaerion", "refusals.log"), { runId });
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatchObject({ domain: "model.invoke", scope: "mockbrain/mock-1", reason_code: "E1300" });
  });

  test("ceiling deny: a model outside gateway.providers is refused E1300 before any adapter runs", async () => {
    const { harness, service } = await makeServiceAndHarness({ config: configWith(), transport: cassetteTransport([]) });
    let threw: unknown = null;
    try {
      await service.invoke(harness, {
        request: chatRequest({ model: "openai/gpt-4o" }), // openai NOT declared in this config
        principal: humanPrincipal,
        policy: { policy_id: "allow-all-test", version: 1, rules: [{ id: "allow-model", principalKinds: ["human"], domain: "model.invoke", scope: "*", effect: "allow", rationale: "test allow" }] },
        requestId: "req_04CeilingTestId0000000",
        intent: "ceiling law",
        budget: { tokensUsed: 0, microUsdUsed: 0 },
      });
    } catch (err) {
      threw = err;
    }
    expect((threw as { code?: string }).code).toBe("E1300");
    await harness.close("ceiling deny closed");
  });
});

/* ──────────────────────────  the prompt flow  ───────────────────────── */

describe("gateway single-gate flow (prompt path — human authority)", () => {
  test("prompt policy pauses with a durable gate via GatewayGatePrompt; nothing is invoked", async () => {
    const { runId, harness, service } = await makeServiceAndHarness({ config: configWith(), transport: cassetteTransport([]) });
    let threw: unknown = null;
    try {
      await service.invoke(harness, {
        request: chatRequest(),
        principal: humanPrincipal,
        policy: {
          policy_id: "prompt-test",
          version: 1,
          rules: [{ id: "prompt-model", principalKinds: ["human"], domain: "model.invoke", scope: "*", effect: "prompt", gateLabel: "Model invocation needs approval", rationale: "human authority checkpoint" }],
        },
        requestId: "req_05PromptTestId00000000",
        intent: "integration prompt flow",
        budget: { tokensUsed: 0, microUsdUsed: 0 },
      });
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(GatewayGatePrompt);
    const prompt = threw as GatewayGatePrompt;
    expect(prompt.gate.state).toBe("open");
    expect(prompt.gate.decision_id).toBe(prompt.record.decision_id);
    expect(prompt.decision.kind).toBe("prompt");
    // the run PAUSES (never auto-sealed): the harness is released with the
    // gate open — the gate record in the journal survives process death (R-A4).
    await harness.release();
  });
});

/* ───────────────────────────  budget law  ──────────────────────────── */

describe("budget law (E1703 — loud, never silent)", () => {
  test("pre-check: an exhausted budget refuses BEFORE the broker decision", async () => {
    const { runId, ws, harness, service } = await makeServiceAndHarness({ config: configWith(), transport: cassetteTransport([]) });
    let threw: unknown = null;
    try {
      await service.invoke(harness, {
        request: chatRequest(),
        principal: humanPrincipal,
        policy: { policy_id: "allow-all-test", version: 1, rules: [{ id: "allow-model", principalKinds: ["human"], domain: "model.invoke", scope: "*", effect: "allow", rationale: "allow" }] },
        requestId: "req_06BudgetPreTestId000000",
        intent: "budget pre-check",
        budget: { tokensUsed: 1000, tokensPerRun: 1000, microUsdUsed: 0 },
      });
    } catch (err) {
      threw = err;
    }
    expect((threw as { code?: string }).code).toBe("E1703");
    // nothing was decided or metered — the run journal holds only the opening
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    expect(read.records.some((r) => r.k === "decision")).toBe(false);
    await harness.close("budget pre-check refusal closed");
  });

  test("post-check: an over-budget invocation stays journaled (spend is real), then stops loudly", async () => {
    const { runId, ws, harness, service } = await makeServiceAndHarness({ config: configWith(), transport: cassetteTransport([]) });
    let threw: unknown = null;
    try {
      await service.invoke(harness, {
        request: chatRequest(),
        principal: humanPrincipal,
        policy: { policy_id: "allow-all-test", version: 1, rules: [{ id: "allow-model", principalKinds: ["human"], domain: "model.invoke", scope: "*", effect: "allow", rationale: "allow" }] },
        requestId: "req_07BudgetPostTestId000000",
        intent: "budget post-check",
        budget: { tokensUsed: 0, tokensPerRun: 5, microUsdUsed: 0 }, // 5-token ceiling; the call needs more
      });
    } catch (err) {
      threw = err;
    }
    expect((threw as { code?: string }).code).toBe("E1703");
    expect((threw as Error).message).toContain("raise the budget");
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    expect(read.records.some((r) => r.k === "evt" && r.env.type === "gateway.invoke.recorded")).toBe(true); // journaled, never hidden
    await harness.close("budget post-check stop closed");
  });
});

/* ──────────────────────  retry + breaker behavior  ──────────────────── */

describe("retry + circuit breaker (R-MG2)", () => {
  const failingTransport = (): GatewayTransport => ({
    name: "always-refused",
    async send(_req: TransportRequest): Promise<TransportResponse> {
      throw new (await import("../../src/kernel/errors.ts")).VaerionError("E1706", "connection refused (scripted)");
    },
  });

  test("transport refusals are retried (attempts>1), journaled as failed, and open the breaker", async () => {
    const { harness, service, runId, ws } = await makeServiceAndHarness({
      config: configWith(),
      transport: failingTransport(),
      breakerThreshold: 2,
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    });
    // A provider whose adapter ACTUALLY crosses the transport (anthropic —
    // mockbrain touches no transport by law, so it can never exercise this).
    const policy: PolicyContract = allowModelPolicy;
    for (let i = 0; i < 2; i++) {
      let threw: unknown = null;
      try {
        await service.invoke(harness, {
          request: { op: "chat", model: "anthropic/claude-3-5-sonnet-latest", messages: [{ role: "user", content: "breaker flow" }] },
          principal: humanPrincipal,
          policy,
          requestId: `req_08Breaker${i}TestId000000`,
          intent: "breaker flow",
          budget: { tokensUsed: 0, microUsdUsed: 0 },
        });
      } catch (err) {
        threw = err;
      }
      expect((threw as { code?: string }).code).toBe("E1706");
    }
    // two failed invocations × threshold 2 ⇒ breaker open
    expect(service.breakerSnapshots()).toEqual([{ provider: "anthropic", state: "open", consecutiveFailures: 2 }]);
    // third attempt refused by the breaker, not the transport
    let threw: unknown = null;
    try {
      await service.invoke(harness, {
        request: { op: "chat", model: "anthropic/claude-3-5-sonnet-latest", messages: [{ role: "user", content: "breaker open" }] },
        principal: humanPrincipal,
        policy,
        requestId: "req_09BreakerOpenTest000000",
        intent: "breaker open",
        budget: { tokensUsed: 0, microUsdUsed: 0 },
      });
    } catch (err) {
      threw = err;
    }
    expect((threw as { code?: string }).code).toBe("E1705");
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    const failed = read.records.filter((r): r is Extract<JournalRecord, { k: "evt" }> => r.k === "evt" && r.env.type === "gateway.invoke.failed");
    expect(failed).toHaveLength(3);
    expect(failed[2]!.env.payload).toMatchObject({ error_code: "E1705" });
    const metering = meteringFromRecords(read.records);
    expect(metering.failed).toBe(3);
    expect(metering.invocations).toBe(0);
    await harness.close("breaker flow closed");
  });

  test("retry succeeds after a transient refusal: attempts=2, breaker stays closed", async () => {
    const cassette = await loadCassette(join(CASSETTE_DIR, "anthropic-chat-basic-v1.json"));
    let sends = 0;
    const flaky: GatewayTransport = {
      name: "flaky-then-cassette",
      async send(req: TransportRequest): Promise<TransportResponse> {
        sends++;
        if (sends === 1) throw new (await import("../../src/kernel/errors.ts")).VaerionError("E1706", "transient (scripted)");
        return cassetteTransport([cassette]).send(req);
      },
    };
    const { harness, service } = await makeServiceAndHarness({
      config: configWith(),
      transport: flaky,
      secrets: fixedSecretPort("sk-live-shaped-key"),
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    });
    const result = await service.invoke(harness, {
      request: { op: "chat", model: "anthropic/claude-3-5-sonnet-latest", messages: [{ role: "user", content: "Say hello in one word." }], maxOutputTokens: 64 },
      principal: humanPrincipal,
      policy: allowModelPolicy,
      requestId: "req_10RetrySuccessTest00000",
      intent: "retry-then-success",
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    expect(result.attempts).toBe(2);
    expect(result.text).toBe("Hello");
    expect(service.breakerSnapshots()).toEqual([{ provider: "anthropic", state: "closed", consecutiveFailures: 0 }]);
    await harness.close("retry success closed");
  });
});

/* ──────────────────────  secrets + redaction law  ───────────────────── */

describe("secrets boundary + outbound redaction (R-MG4/R-MG5)", () => {
  test("missing secret: broker allows the read, resolution fails E1704, failure journaled", async () => {
    const { runId, ws, harness, service } = await makeServiceAndHarness({ config: configWith(), transport: cassetteTransport([]), secrets: fixedSecretPort(null) });
    let threw: unknown = null;
    try {
      await service.invoke(harness, {
        request: { op: "chat", model: "anthropic/claude-3-5-sonnet-latest", messages: [{ role: "user", content: "hi" }] },
        principal: humanPrincipal,
        policy: {
          policy_id: "allow-all-test",
          version: 1,
          rules: [
            { id: "allow-model", principalKinds: ["human"], domain: "model.invoke", scope: "*", effect: "allow", rationale: "allow" },
            { id: "allow-secret", principalKinds: ["human"], domain: "secret.read", scope: "*", effect: "allow", rationale: "allow" },
          ],
        },
        requestId: "req_11SecretMissTestId000000",
        intent: "secret miss flow",
        budget: { tokensUsed: 0, microUsdUsed: 0 },
      });
    } catch (err) {
      threw = err;
    }
    expect((threw as { code?: string }).code).toBe("E1704");
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    // the secret.read decision happened (broker-mediated) BEFORE the loud failure
    expect(read.records.some((r) => r.k === "decision" && (r as { decision?: { domain?: string } }).decision?.domain === "secret.read")).toBe(true);
    expect(read.records.some((r) => r.k === "evt" && r.env.type === "gateway.invoke.failed")).toBe(true);
    await harness.close("secret miss closed");
  });

  test("R-MG5: secret-shaped content is scrubbed from the OUTBOUND payload before the transport", async () => {
    const secretShaped = "sk-abcdef1234567890abcdef";
    let capturedBody: string | null = null;
    // Scripted anthropic-shaped 200 stream; the body is captured for inspection.
    const capturingTransport: GatewayTransport = {
      name: "capturing-anthropic",
      async send(req: TransportRequest): Promise<TransportResponse> {
        capturedBody = req.body;
        const chunks: AsyncIterable<TransportChunk> = {
          async *[Symbol.asyncIterator]() {
            yield { text: 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\n' };
            yield { text: 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\n' };
            yield { text: 'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n' };
            yield { text: 'event: message_stop\ndata: {"type":"message_stop"}\n\n' };
          },
        };
        return { status: 200, headers: {}, chunks };
      },
    };
    const { harness, service } = await makeServiceAndHarness({
      config: configWith(),
      transport: capturingTransport,
      secrets: fixedSecretPort("sk-live-shaped-key"),
    });
    const result = await service.invoke(harness, {
      request: { op: "chat", model: "anthropic/claude-3-5-sonnet-latest", messages: [{ role: "user", content: `please remember ${secretShaped} for later` }], maxOutputTokens: 16 },
      principal: humanPrincipal,
      policy: allowModelPolicy,
      requestId: "req_12OutboundRedactTest0000",
      intent: "outbound redaction flow",
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    await harness.close("outbound redaction closed");
    expect(result.text).toContain("ok");
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!).not.toContain(secretShaped); // the secret NEVER left the machine
    expect(capturedBody!).toContain(`[REDACTED len=${secretShaped.length}]`); // deterministic scrub marker
  });

  test("R-MG5 end-to-end: a secret shape never passes through the gateway at all", async () => {
    const secretShaped = "sk-zzzz9999zzzz9999zzz";
    const { runId, ws, harness, service } = await makeServiceAndHarness({ config: configWith(), transport: cassetteTransport([]) });
    const result = await service.invoke(harness, {
      request: chatRequest({ messages: [{ role: "user" as const, content: `echo ${secretShaped}` }] }),
      principal: humanPrincipal,
      policy: allowModelPolicy,
      requestId: "req_13JournalRedactTest00000",
      intent: "journal redaction",
      budget: { tokensUsed: 0, microUsdUsed: 0 },
    });
    await harness.close("journal redaction closed");
    // the outbound middleware scrubbed the payload BEFORE the adapter saw it,
    // so the assembled text (mockbrain echoes its input) carries the marker:
    expect(result.text).not.toContain(secretShaped);
    expect(result.text).toContain(`[REDACTED len=${secretShaped.length}]`);
    const read = await readJournal(RunHarness.journalPathFor(ws, runId));
    const recorded = read.records.find((r): r is Extract<JournalRecord, { k: "evt" }> => r.k === "evt" && r.env.type === "gateway.invoke.recorded");
    const journaledText = (recorded!.env.payload as Record<string, unknown>).text as string;
    expect(journaledText).not.toContain(secretShaped); // the journal NEVER holds the secret
    const raw = JSON.stringify(read.records);
    expect(raw).not.toContain(secretShaped);
  });
});
