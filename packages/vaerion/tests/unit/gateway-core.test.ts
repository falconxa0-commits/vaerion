/**
 * Vaerion Model Gateway — core unit tests (MS-3).
 *
 * Deterministic by construction: fixed clock, seeded rng, no network, no
 * Date.now/Math.random. Every assertion pins a constitutional property of
 * the gateway law (D-J, R-MG1..R-MG5, ADR-0012, ADR-0013):
 *   - transport seam isolation and model-id parsing (fail-closed E1700);
 *   - normalized stream contract enforcement (E1702);
 *   - retry only around connection establishment, deterministic full jitter;
 *   - breaker opening/cooldown/half-open via the injected clock (E1705);
 *   - integer micro-USD pricing with half-up rounding (never floats);
 *   - metering as a pure journal fold (order-free, replay-compatible);
 *   - secrets: names only in config, values resolved at call time (E1704);
 *   - broker ceilings from vaerion.yaml gateway.providers (fail-closed).
 */

import { describe, expect, test } from "bun:test";
import { FixedClock, SeededRng, SystemClock } from "../../src/kernel/clock.ts";
import { VaerionError, type ErrorCode } from "../../src/kernel/errors.ts";
import { validateConfig, policyFromConfig } from "../../src/config/config.ts";
import { graphFromConfig } from "../../src/broker/engine.ts";
import { grantsFor } from "../../src/broker/contracts/permission-graph.ts";
import { GENESIS_HASH } from "../../src/kernel/hash.ts";
import {
  assembleText,
  assertStreamFrame,
  parseModelId,
  type StreamFrame,
} from "../../src/gateway/types.ts";
import { SseParser, parseNdjsonChunks, parseSseChunks } from "../../src/gateway/adapters/sse.ts";
import { backoffDelayMs, CircuitBreaker, isRetryable, TransportRetries, DEFAULT_RETRY } from "../../src/gateway/breaker.ts";
import { addCosts, costOf, formatMicroUsd, priceFor } from "../../src/gateway/pricing.ts";
import { meteringFromRecords } from "../../src/gateway/metering.ts";
import { envSecretPort, requireResolvedSecret } from "../../src/gateway/secrets.ts";
import { mockBrainAdapter, estimateTokens, MOCKBRAIN_EMBED_DIM } from "../../src/gateway/mockbrain.ts";
import { cassetteTransport, requestFingerprint, type Cassette } from "../../src/gateway/cassette.ts";
import type { JournalRecord } from "../../src/journal/records.ts";

const T0 = 1735689600000;
const clock = new FixedClock(T0);

function expectCodeSync(fn: () => unknown, code: ErrorCode): void {
  let threw: unknown = null;
  try {
    fn();
  } catch (err) {
    threw = err;
  }
  expect(threw).toBeInstanceOf(VaerionError);
  expect((threw as VaerionError).code).toBe(code);
}

async function expectCodeAsync(fn: () => Promise<unknown> | unknown, code: ErrorCode): Promise<void> {
  let threw: unknown = null;
  try {
    await fn();
  } catch (err) {
    threw = err;
  }
  expect(threw).toBeInstanceOf(VaerionError);
  expect((threw as VaerionError).code).toBe(code);
}

/* ──────────────────────  model ids + stream contract  ───────────────── */

describe("gateway model ids and stream contract", () => {
  test("parseModelId splits provider/model-id; malformed fails closed E1700", () => {
    expect(parseModelId("anthropic/claude-3-5-sonnet-latest")).toEqual({ provider: "anthropic", modelId: "claude-3-5-sonnet-latest" });
    expect(parseModelId("mockbrain/mock-1")).toEqual({ provider: "mockbrain", modelId: "mock-1" });
    expectCodeSync(() => parseModelId("no-slash"), "E1700");
    expectCodeSync(() => parseModelId("/leading"), "E1700");
    expectCodeSync(() => parseModelId("trailing/"), "E1700");
  });

  test("assertStreamFrame: valid frames pass, malformed throw E1702", () => {
    const valid: StreamFrame[] = [
      { type: "text", delta: "x" },
      { type: "tool_call", index: 0, id: null, name: null, argsDelta: "" },
      { type: "embedding", index: 0, vector: [1] },
      { type: "rerank", index: 0, score: 0.5 },
      { type: "usage", inputTokens: 1, outputTokens: 2 },
      { type: "error", code: "x", message: "y" },
      { type: "done", stopReason: null },
    ];
    for (const frame of valid) expect(() => assertStreamFrame(frame)).not.toThrow();
    expectCodeSync(() => assertStreamFrame(null), "E1702");
    expectCodeSync(() => assertStreamFrame({}), "E1702");
    expectCodeSync(() => assertStreamFrame({ type: "wat" }), "E1702");
    expectCodeSync(() => assertStreamFrame({ type: "text" }), "E1702");
    expectCodeSync(() => assertStreamFrame({ type: "usage", inputTokens: -1, outputTokens: 0 }), "E1702");
    expectCodeSync(() => assertStreamFrame({ type: "usage", inputTokens: 1.5, outputTokens: 0 }), "E1702");
  });

  test("assembleText joins text frames only", () => {
    const frames: StreamFrame[] = [
      { type: "text", delta: "a" },
      { type: "usage", inputTokens: 1, outputTokens: 1 },
      { type: "text", delta: "b" },
      { type: "done", stopReason: "end_turn" },
    ];
    expect(assembleText(frames)).toBe("ab");
    expect(assembleText([])).toBe("");
  });
});

/* ────────────────────────────  wire parsers  ────────────────────────── */

describe("SSE + NDJSON parsers (chunking invariance)", () => {
  const SSE_WIRE =
    ': keep-alive\n\nevent: a\ndata: {"n":1}\n\ndata: line1\ndata: line2\n\ndata: [DONE]\n\n';

  test("SSE parser is chunk-split invariant (every boundary, 1..n chars)", () => {
    const whole = new SseParser();
    const wholeEvents = whole.feed(SSE_WIRE).concat(whole.flush());
    expect(wholeEvents).toHaveLength(3); // the comment-only keep-alive block carries no data
    expect(wholeEvents[0]).toEqual({ event: "a", data: '{"n":1}' });
    expect(wholeEvents[1]).toEqual({ event: "", data: "line1\nline2" });
    expect(wholeEvents[2]).toEqual({ event: "", data: "[DONE]" });

    for (let size = 1; size <= 7; size++) {
      const parser = new SseParser();
      let events: Array<{ event: string; data: string }> = [];
      for (let i = 0; i < SSE_WIRE.length; i += size) events = events.concat(parser.feed(SSE_WIRE.slice(i, i + size)));
      events = events.concat(parser.flush());
      expect(events).toEqual(wholeEvents);
    }
  });

  test("SSE parser honors CRLF block terminators", () => {
    const parser = new SseParser();
    const events = parser.feed('event: x\r\ndata: 1\r\n\r\ndata: 2\r\n\r\n').concat(parser.flush());
    expect(events).toEqual([{ event: "x", data: "1" }, { event: "", data: "2" }]);
  });

  test("parseSseChunks maps [DONE] to {done:true}; malformed JSON reported loudly", () => {
    const parsed = parseSseChunks(['data: {"a":1}\n\n', "data: not-json\n\n", "data: [DONE]\n\n"]);
    expect(parsed[0]).toEqual({ ok: true, value: { a: 1 } });
    expect(parsed[1]!.ok).toBe(false);
    expect(parsed[2]).toEqual({ ok: true, value: { done: true } });
  });

  test("NDJSON parser is chunk-split invariant across chunk arrays", () => {
    const wire = '{"a":1}\n{"b":2}\n{"c":[1,2,3]}\n';
    const whole = parseNdjsonChunks([wire]);
    expect(whole.map((p) => (p.ok ? p.value : null))).toEqual([{ a: 1 }, { b: 2 }, { c: [1, 2, 3] }]);
    for (let size = 1; size <= 5; size++) {
      const chunks: string[] = [];
      for (let i = 0; i < wire.length; i += size) chunks.push(wire.slice(i, i + size));
      expect(parseNdjsonChunks(chunks)).toEqual(whole);
    }
    // a JSON line split across chunks buffers until the newline completes it
    const split = parseNdjsonChunks(['{"a":', '1}\n', '{"b":2}\n']);
    expect(split.map((p) => (p.ok ? p.value : null))).toEqual([{ a: 1 }, { b: 2 }]);
    // malformed lines are loud, never skipped silently
    const bad = parseNdjsonChunks(['not-json\n']);
    expect(bad[0]!.ok).toBe(false);
  });
});

/* ──────────────────────  retry, backoff, breaker  ───────────────────── */

describe("retry + circuit breaker (R-MG2)", () => {
  test("backoffDelayMs is deterministic per seeded rng and bounded by the cap", () => {
    const policy = { maxAttempts: 3, baseDelayMs: 200, maxDelayMs: 900 };
    const a = backoffDelayMs(policy, 0, new SeededRng(7));
    const b = backoffDelayMs(policy, 0, new SeededRng(7));
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(200); // attempt 0 cap = base
    const far = backoffDelayMs(policy, 9, new SeededRng(7));
    expect(far).toBeLessThanOrEqual(900); // capped by maxDelayMs
    expect(backoffDelayMs({ ...policy, baseDelayMs: 0 }, 0, new SeededRng(7))).toBe(0);
  });

  test("isRetryable: transport refusal + provider unavailable yes; law failures never", () => {
    expect(isRetryable(new VaerionError("E1706", "refused"))).toBe(true);
    expect(isRetryable(new VaerionError("E1601", "unavailable"))).toBe(true);
    expect(isRetryable(new VaerionError("E1300", "denied"))).toBe(false);
    expect(isRetryable(new VaerionError("E1703", "budget"))).toBe(false);
    expect(isRetryable(new Error("plain"))).toBe(false);
  });

  test("TransportRetries retries retryable errors, counts attempts, gives up at maxAttempts", async () => {
    let calls = 0;
    const flaky = new TransportRetries({ maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 4 }, clock, new SeededRng(1));
    const value = await flaky.run(async () => {
      calls++;
      if (calls < 3) throw new VaerionError("E1706", "refused");
      return "ok";
    });
    expect(value).toBe("ok");
    expect(calls).toBe(3);
    expect(flaky.attemptsUsed).toBe(3);

    let hardCalls = 0;
    const law = new TransportRetries(DEFAULT_RETRY, clock, new SeededRng(1));
    await expectCodeAsync(
      () =>
        law.run(async () => {
          hardCalls++;
          throw new VaerionError("E1300", "denied");
        }),
      "E1300",
    );
    expect(hardCalls).toBe(1); // law is never retried
    expect(law.attemptsUsed).toBe(1);
  });

  test("CircuitBreaker: opens after threshold, refuses E1705, cools to half_open, heals", () => {
    const breaker = new CircuitBreaker("anthropic", clock, { threshold: 3, cooldownMs: 100 });
    expect(breaker.state).toBe("closed");
    breaker.admit();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe("closed");
    breaker.recordFailure();
    expect(breaker.state).toBe("open");
    expect(() => breaker.admit()).toThrow(/circuit breaker for "anthropic" is open/);
    let threw: unknown = null;
    try {
      breaker.admit();
    } catch (err) {
      threw = err;
    }
    expect((threw as VaerionError).code).toBe("E1705");

    clock.advance(99);
    expect(breaker.state).toBe("open");
    clock.advance(1);
    expect(breaker.state).toBe("half_open");
    breaker.admit(); // the single probe is admitted
    breaker.recordFailure();
    expect(breaker.state).toBe("open"); // failed probe re-opens

    clock.advance(100);
    expect(breaker.state).toBe("half_open");
    breaker.admit();
    breaker.recordSuccess();
    expect(breaker.state).toBe("closed");
    expect(breaker.snapshot()).toMatchObject({ provider: "anthropic", state: "closed", consecutiveFailures: 0 });
  });
});

/* ──────────────────────────  pricing + metering  ────────────────────── */

describe("pricing (integer micro-USD, R-MG3)", () => {
  test("costOf computes exact integer micro-USD with half-up rounding", () => {
    // anthropic sonnet: 3_000_000 in / 15_000_000 out µUSD per MTok.
    const cost = costOf("anthropic/claude-3-5-sonnet-latest", "chat", { inputTokens: 1000, outputTokens: 500 });
    expect(cost).toEqual({ inputMicroUsd: 3000, outputMicroUsd: 7500, totalMicroUsd: 10500 });
    // 1 token at 3_000_000/MTok = 3 µUSD exactly.
    expect(costOf("anthropic/claude-3-5-sonnet-latest", "chat", { inputTokens: 1, outputTokens: 0 })!.inputMicroUsd).toBe(3);
    // half-up on the EXACT rational: gpt-4o-mini input 10 tokens = 1.5 µUSD → 2.
    expect(costOf("openai/gpt-4o-mini", "chat", { inputTokens: 10, outputTokens: 0 })!.inputMicroUsd).toBe(2);
    // large exact product: 1667 output tokens on sonnet = 25_005 µUSD exactly.
    expect(costOf("anthropic/claude-3-5-sonnet-latest", "chat", { inputTokens: 0, outputTokens: 1667 })!.outputMicroUsd).toBe(25_005);
  });

  test("wildcard pricing: ollama/mockbrain are 0 (honest local), unknown is null (never faked free)", () => {
    expect(costOf("ollama/llama3.2", "chat", { inputTokens: 100, outputTokens: 100 })).toEqual({ inputMicroUsd: 0, outputMicroUsd: 0, totalMicroUsd: 0 });
    expect(costOf("mockbrain/mock-1", "chat", { inputTokens: 10, outputTokens: 10 })).toEqual({ inputMicroUsd: 0, outputMicroUsd: 0, totalMicroUsd: 0 });
    expect(priceFor("unknown-provider/xyz", "chat")).toBeNull();
    expect(costOf("unknown-provider/xyz", "chat", { inputTokens: 5, outputTokens: 5 })).toBeNull();
    // op mismatch is unpriced (embed price ≠ chat price).
    expect(priceFor("anthropic/claude-3-5-sonnet-latest", "embed")).toBeNull();
  });

  test("formatMicroUsd renders deterministic display strings", () => {
    expect(formatMicroUsd(10500)).toBe("$0.0105");
    expect(formatMicroUsd(0)).toBe("$0.0");
    expect(formatMicroUsd(1_000_000)).toBe("$1.0");
  });

  test("addCosts sums integer costs; null only when both null", () => {
    const a = { inputMicroUsd: 1, outputMicroUsd: 2, totalMicroUsd: 3 };
    expect(addCosts(a, a)).toEqual({ inputMicroUsd: 2, outputMicroUsd: 4, totalMicroUsd: 6 });
    expect(addCosts(null, null)).toBeNull();
    expect(addCosts(a, null)).toEqual(a);
  });

  test("meteringFromRecords is an order-free pure fold over journal records", () => {
    const rec = (i: number, type: string, payload: Record<string, unknown>): JournalRecord =>
      ({ k: "evt", i, env: { type, payload }, hash: GENESIS_HASH, prev: GENESIS_HASH }) as unknown as JournalRecord;
    const usage = { inputTokens: 10, outputTokens: 5 };
    const cost = { inputMicroUsd: 30, outputMicroUsd: 75, totalMicroUsd: 105 };
    const records = [
      rec(0, "gateway.invoke.recorded", { model: "a/m1", usage, cost }),
      rec(1, "gateway.invoke.failed", { model: "a/m1", error_code: "E1706" }),
      rec(2, "gateway.invoke.recorded", { model: "b/m2", usage, cost: null }),
      rec(3, "gateway.invoke.recorded", { model: "a/m1", usage, cost }),
      rec(4, "research.evidence.recorded", { evidence: {} }), // other events ignored
    ];
    const rollup = meteringFromRecords(records);
    expect(rollup.invocations).toBe(3);
    expect(rollup.failed).toBe(1);
    expect(rollup.inputTokens).toBe(30);
    expect(rollup.outputTokens).toBe(15);
    expect(rollup.totalMicroUsd).toBe(210);
    expect(rollup.unpriced).toBe(1);
    expect(rollup.byModel["a/m1"]).toEqual({ invocations: 2, failed: 1, inputTokens: 20, outputTokens: 10, totalMicroUsd: 210 });
    expect(rollup.byModel["b/m2"]).toEqual({ invocations: 1, failed: 0, inputTokens: 10, outputTokens: 5, totalMicroUsd: 0 });
    // order-free: reversed fold yields identical numbers
    const reversed = meteringFromRecords([...records].reverse());
    expect(reversed.invocations).toBe(rollup.invocations);
    expect(reversed.totalMicroUsd).toBe(rollup.totalMicroUsd);
    expect(reversed.byModel).toEqual(rollup.byModel);
    expect(meteringFromRecords([]).invocations).toBe(0);
  });
});

/* ────────────────────────────  secrets (ADR-0013)  ──────────────────── */

describe("secrets boundary (R-MG4, ADR-0013)", () => {
  const ORIGINAL = process.env.VAERION_TEST_SECRET;

  test("envSecretPort resolves names from the environment at call time", async () => {
    process.env.VAERION_TEST_SECRET = "value-only-in-memory";
    expect(await envSecretPort.resolve("VAERION_TEST_SECRET")).toBe("value-only-in-memory");
    expect(await envSecretPort.resolve("VAERION_TEST_MISSING")).toBeNull();
  });

  test("requireResolvedSecret fails loudly E1704 and carries the NAME, never a value", () => {
    let threw: unknown = null;
    try {
      requireResolvedSecret("MY_SECRET_NAME", null);
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(VaerionError);
    expect((threw as VaerionError).code).toBe("E1704");
    expect((threw as Error).message).toContain("MY_SECRET_NAME");
    expect(requireResolvedSecret("N", "v")).toBe("v");
    process.env.VAERION_TEST_SECRET = ORIGINAL;
  });
});

/* ─────────────────────  config ceilings + graph law  ────────────────── */

describe("gateway config → broker ceilings (fail-closed)", () => {
  const baseConfig = {
    schemaVersion: "0.1",
    project: { name: "gw", description: "gateway ceiling tests" },
    gateway: {
      providers: {
        mockbrain: { enabled: true, models: ["mock-1", "mock-2"] },
        anthropic: { enabled: false, models: ["claude-3-5-sonnet-latest"] },
      },
      budgets: { tokensPerRun: 1000, microUsdPerRun: 5_000_000 },
    },
    secrets: { ANTHROPIC_API_KEY: { grant: ["agent:*", "human:cli"] } },
    telemetry: { enabled: false },
  };

  test("validateConfig accepts a well-formed gateway/secrets declaration", () => {
    const config = validateConfig(baseConfig);
    expect(config.gateway?.providers?.mockbrain?.enabled).toBe(true);
    expect(config.secrets?.ANTHROPIC_API_KEY?.grant).toEqual(["agent:*", "human:cli"]);
  });

  test("validateConfig rejects unknown providers/keys and malformed values (loud, coded)", () => {
    expectCodeSync(() => validateConfig({ ...baseConfig, gateway: { providers: { mistral: { enabled: true } } } }), "E1201");
    expectCodeSync(() => validateConfig({ ...baseConfig, gateway: { providers: { mockbrain: { enabled: true, temperature: 1 } } } }), "E1201");
    expectCodeSync(() => validateConfig({ ...baseConfig, gateway: { providers: { mockbrain: { enabled: "yes" } } } }), "E1202");
    expectCodeSync(() => validateConfig({ ...baseConfig, gateway: { providers: { mockbrain: { enabled: true, models: [1] } } } }), "E1202");
    expectCodeSync(() => validateConfig({ ...baseConfig, gateway: { budgets: { tokensPerRun: 1.5 } } }), "E1202");
    expectCodeSync(() => validateConfig({ ...baseConfig, gateway: { budgets: { perRun: 1 } } }), "E1201");
    expectCodeSync(() => validateConfig({ ...baseConfig, secrets: { "bad-name": { grant: ["*"] } } }), "E1202");
    expectCodeSync(() => validateConfig({ ...baseConfig, secrets: { NO_GRANT: {} } }), "E1202");
  });

  test("graphFromConfig grants model.invoke scopes ONLY for enabled providers with declared models", () => {
    const config = validateConfig(baseConfig);
    const graph = graphFromConfig(config, "graph_test");
    const humanGrants = grantsFor(graph, "human");
    const mockGrant = humanGrants.find((c) => c.domain === "model.invoke");
    expect(mockGrant).toBeDefined();
    expect(mockGrant!.scopes).toEqual(["mockbrain/mock-1", "mockbrain/mock-2"]); // disabled anthropic contributes nothing
    const secretGrant = humanGrants.find((c) => c.domain === "secret.read");
    expect(secretGrant!.scopes).toEqual(["ANTHROPIC_API_KEY"]);
  });

  test("policyFromConfig carries the structural human model.invoke allow (ceiling still applies)", () => {
    const policy = policyFromConfig(validateConfig(baseConfig));
    const rule = policy.rules.find((r) => r.id === "human-model-invoke-allow");
    expect(rule).toBeDefined();
    expect(rule!.effect).toBe("allow");
    expect(rule!.domain).toBe("model.invoke");
    expect(rule!.principalKinds).toEqual(["human"]);
  });
});

/* ─────────────────────────  MockBrain (ADR-0012)  ───────────────────── */

describe("MockBrain — the seeded virtual provider", () => {
  const ctx = {
    clock: new SystemClock(),
    rng: new SeededRng(42),
    transport: cassetteTransport([]), // MockBrain touches no transport; presence proves isolation
    secret: null,
  };

  async function framesOf(req: Parameters<typeof mockBrainAdapter.open>[0]): Promise<StreamFrame[]> {
    const stream = await mockBrainAdapter.open(req, ctx);
    const out: StreamFrame[] = [];
    for await (const frame of stream) out.push(frame);
    return out;
  }

  test("same seed + same request ⇒ byte-identical normalized stream", async () => {
    const req = { op: "chat" as const, model: "mockbrain/mock-1", messages: [{ role: "user" as const, content: "determinism check" }], seed: 42 };
    const a = await framesOf(req);
    const b = await framesOf({ ...req, messages: [{ role: "user", content: "determinism check" }] });
    expect(a).toEqual(b);
    expect(assembleText(a)).toBe(assembleText(b));
    // a different seed produces different text
    const c = await framesOf({ ...req, seed: 43 });
    expect(assembleText(c)).not.toBe(assembleText(a));
  });

  test("chat stream carries text, usage (4-chars/token estimate), and a done frame", async () => {
    const frames = await framesOf({ op: "chat", model: "mockbrain/mock-1", messages: [{ role: "user", content: "hello" }], seed: 7 });
    const text = assembleText(frames);
    expect(text.startsWith("mock(seed=7):")).toBe(true);
    const usage = frames.find((f) => f.type === "usage") as Extract<StreamFrame, { type: "usage" }>;
    expect(usage.inputTokens).toBe(estimateTokens("hello"));
    expect(usage.outputTokens).toBe(estimateTokens(text));
    expect(frames.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
  });

  test("embed vectors are dim-64, deterministic, and value-bounded", async () => {
    const frames = await framesOf({ op: "embed", model: "mockbrain/mock-1", input: ["alpha", "beta"], seed: 3 });
    const embeddings = frames.filter((f): f is Extract<StreamFrame, { type: "embedding" }> => f.type === "embedding");
    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]!.vector).toHaveLength(MOCKBRAIN_EMBED_DIM);
    for (const v of embeddings[0]!.vector) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
    const again = await framesOf({ op: "embed", model: "mockbrain/mock-1", input: ["alpha", "beta"], seed: 3 });
    expect(again).toEqual(frames);
  });

  test("rerank scores deterministic, inside [0,1], equal content ⇒ equal score", async () => {
    const req = { op: "rerank" as const, model: "mockbrain/mock-1", query: "vectordb recall", documents: ["vectordb recall", "compiler pipelines", "vectordb recall"], seed: 1 };
    const frames = await framesOf(req);
    const ranks = frames.filter((f): f is Extract<StreamFrame, { type: "rerank" }> => f.type === "rerank");
    expect(ranks).toHaveLength(3);
    for (const rank of ranks) {
      expect(rank.score).toBeGreaterThanOrEqual(0);
      expect(rank.score).toBeLessThanOrEqual(1); // a similarity above 1 is a contract lie
    }
    // identical contents ⇒ identical scores, adjacent in the deterministic order
    expect(ranks[0]!.score).toBe(1); // exact query/content match
    expect(ranks[1]!.score).toBe(1);
    expect(ranks[2]!.score).toBeLessThan(1);
    const again = await framesOf(req);
    expect(again).toEqual(frames);
  });

  test("capability matrix is declared honestly (chat+embed+rerank, no secret)", () => {
    expect(mockBrainAdapter.provider).toBe("mockbrain");
    expect([...mockBrainAdapter.ops].sort()).toEqual(["chat", "embed", "rerank"]);
    expect(mockBrainAdapter.requiresSecret).toBe(false);
    expect(mockBrainAdapter.secretName).toBeNull();
  });
});

/* ─────────────────────────  cassette replay law  ────────────────────── */

describe("cassette transport (ADR-0012)", () => {
  const cassette: Cassette = {
    cassette_id: "unit-cassette-v1",
    provider: "anthropic",
    op: "chat",
    request_fingerprint: "aa".repeat(32),
    status: 200,
    chunks: ['data: {"x":1}\n\n'],
  };

  test("replay matches by request fingerprint and serves the recorded chunks", async () => {
    const fingerprint = await requestFingerprint({ host: "anthropic", path: "/v1/messages", method: "POST", headers: {}, body: "exact-bytes" });
    const transport = cassetteTransport([{ ...cassette, request_fingerprint: fingerprint }]);
    const response = await transport.send({ host: "anthropic", path: "/v1/messages", method: "POST", headers: {}, body: "exact-bytes" });
    expect(response.status).toBe(200);
    expect(response.headers["x-vaerion-cassette"]).toBe("unit-cassette-v1");
    const texts: string[] = [];
    for await (const chunk of response.chunks) texts.push(chunk.text);
    expect(texts).toEqual(['data: {"x":1}\n\n']);
  });

  test("no fingerprint match fails closed E1702 — never an excuse to touch the network", async () => {
    const transport = cassetteTransport([cassette]);
    await expectCodeAsync(() => transport.send({ host: "anthropic", path: "/v1/messages", method: "POST", headers: {}, body: "different" }), "E1702");
  });

  test("assertCassetteShape rejects malformed cassettes loudly", () => {
    expect(() => cassetteTransport([{ ...cassette, request_fingerprint: "short" }])).toThrow(/request_fingerprint/);
    expect(() => cassetteTransport([{ ...cassette, chunks: "not-array" as unknown as string[] }])).toThrow(/chunks/);
  });
});
