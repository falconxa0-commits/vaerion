/**
 * Vaerion Model Gateway — provider adapter tests (MS-3).
 *
 * Law under test: adapters map provider wire shapes onto the normalized
 * StreamFrame contract (R-MG1) and NOTHING downstream sees provider shapes.
 * All wire traffic here replays through committed cassettes (ADR-0012) or
 * scripted transports — the network is never touched.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { VaerionError, type ErrorCode } from "../../src/kernel/errors.ts";
import { FixedClock, SeededRng } from "../../src/kernel/clock.ts";
import { GENESIS_HASH } from "../../src/kernel/hash.ts";
import { loadCassette, cassetteTransport } from "../../src/gateway/cassette.ts";
import type { GatewayTransport, StreamFrame, TransportChunk, TransportRequest, TransportResponse } from "../../src/gateway/types.ts";
import { mapAnthropicEvent } from "../../src/gateway/adapters/anthropic.ts";
import { mapOpenAiEvent } from "../../src/gateway/adapters/openai.ts";
import { mapOllamaEvent } from "../../src/gateway/adapters/ollama.ts";
import { anthropicAdapter } from "../../src/gateway/adapters/anthropic.ts";
import { openaiAdapter } from "../../src/gateway/adapters/openai.ts";
import { ollamaAdapter } from "../../src/gateway/adapters/ollama.ts";

const CASSETTE_DIR = join(import.meta.dir, "..", "..", "fixtures", "cassettes");
const T0 = 1735689600000;

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

async function framesViaCassette(
  adapter: (typeof anthropicAdapter | typeof openaiAdapter | typeof ollamaAdapter),
  req: Parameters<typeof anthropicAdapter.open>[0],
  cassetteFile: string,
  secret: string | null,
): Promise<StreamFrame[]> {
  const cassette = await loadCassette(join(CASSETTE_DIR, cassetteFile));
  const transport = cassetteTransport([cassette]);
  const stream = await adapter.open(req, { clock: new FixedClock(T0), rng: new SeededRng(42), transport, secret });
  const frames: StreamFrame[] = [];
  for await (const frame of stream) frames.push(frame);
  return frames;
}

/* ───────────────────  wire event mappers (pure)  ────────────────────── */

describe("anthropic wire mapper", () => {
  test("message_start → usage baseline; text_delta → text frames; ping ignored", () => {
    expect(mapAnthropicEvent({ type: "message_start", message: { usage: { input_tokens: 9 } } })).toEqual([
      { frame: { type: "usage", inputTokens: 9, outputTokens: 0 } },
    ]);
    expect(mapAnthropicEvent({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } })).toEqual([
      { frame: { type: "text", delta: "Hel" } },
    ]);
    expect(mapAnthropicEvent({ type: "ping" })).toEqual([]);
    expect(mapAnthropicEvent({ type: "message_stop" })).toEqual([]);
    expect(mapAnthropicEvent({ type: "totally_new_provider_event" })).toEqual([]); // forward-compat: no-op
  });

  test("tool_use blocks map to tool_call frames (start + input_json_delta args)", () => {
    const start = mapAnthropicEvent({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "get_weather" } });
    expect(start).toEqual([{ frame: { type: "tool_call", index: 1, id: "toolu_1", name: "get_weather", argsDelta: "" } }]);
    const args = mapAnthropicEvent({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"city":"Oslo"}' } });
    expect(args).toEqual([{ frame: { type: "tool_call", index: 1, id: null, name: null, argsDelta: '{"city":"Oslo"}' } }]);
  });

  test("message_delta yields an output-token partial (coalesced before yield) + done", () => {
    const mapped = mapAnthropicEvent({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } });
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toEqual({ partial: "output", outputTokens: 5 });
    expect(mapped[1]).toEqual({ frame: { type: "done", stopReason: "end_turn" } });
  });

  test("error events map to error frames; missing type fails closed E1702", () => {
    const mapped = mapAnthropicEvent({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
    expect(mapped).toEqual([{ frame: { type: "error", code: "overloaded_error", message: "Overloaded" } }]);
    expectCodeSync(() => mapAnthropicEvent({ nope: true }), "E1702");
    expectCodeSync(() => mapAnthropicEvent(null), "E1702");
  });
});

describe("openai wire mapper", () => {
  test("delta.content → text; tool_calls → tool_call; finish_reason → done", () => {
    expect(mapOpenAiEvent({ choices: [{ index: 0, delta: { content: "Hel" } }] })).toEqual([{ type: "text", delta: "Hel" }]);
    expect(
      mapOpenAiEvent({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "f", arguments: "{\"x\":1}" } }] } }] }),
    ).toEqual([{ type: "tool_call", index: 0, id: "call_1", name: "f", argsDelta: '{"x":1}' }]);
    expect(mapOpenAiEvent({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })).toEqual([{ type: "done", stopReason: "stop" }]);
    expect(mapOpenAiEvent({ done: true })).toEqual([{ type: "done", stopReason: null }]); // [DONE] terminator
  });

  test("usage chunk (empty choices) maps usage; error objects map error frames", () => {
    expect(mapOpenAiEvent({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 2 } })).toEqual([
      { type: "usage", inputTokens: 11, outputTokens: 2 },
    ]);
    expect(mapOpenAiEvent({ error: { code: "rate_limit", message: "slow down" } })).toEqual([
      { type: "error", code: "rate_limit", message: "slow down" },
    ]);
    expectCodeSync(() => mapOpenAiEvent("not-an-object"), "E1702");
  });
});

describe("ollama wire mapper", () => {
  test("message.content → text; terminal line carries usage + done_reason", () => {
    expect(mapOllamaEvent({ message: { role: "assistant", content: "Hel" }, done: false })).toEqual([{ type: "text", delta: "Hel" }]);
    expect(mapOllamaEvent({ message: { role: "assistant", content: "" }, done: true, prompt_eval_count: 9, eval_count: 2, done_reason: "stop" })).toEqual([
      { type: "usage", inputTokens: 9, outputTokens: 2 },
      { type: "done", stopReason: "stop" },
    ]);
    expect(mapOllamaEvent({ error: "model not found" })).toEqual([{ type: "error", code: "provider_error", message: "model not found" }]);
    expectCodeSync(() => mapOllamaEvent(42), "E1702");
  });
});

/* ──────────────────  cassette replay through adapters  ───────────────── */

describe("adapters over committed cassettes (ADR-0012 hermetic replay)", () => {
  test("anthropic chat: SSE → normalized text/usage/done; coalesced usage 9in/5out", async () => {
    const frames = await framesViaCassette(
      anthropicAdapter,
      { op: "chat", model: "anthropic/claude-3-5-sonnet-latest", messages: [{ role: "user", content: "Say hello in one word." }], maxOutputTokens: 64 },
      "anthropic-chat-basic-v1.json",
      "sk-test-key-value",
    );
    expect(frames.some((f) => f.type === "text" && f.delta === "Hel")).toBe(true);
    expect(frames.some((f) => f.type === "text" && f.delta === "lo")).toBe(true);
    const usage = frames.filter((f): f is Extract<StreamFrame, { type: "usage" }> => f.type === "usage").at(-1)!; // last-usage law (service lastUsage)
    expect(usage).toEqual({ type: "usage", inputTokens: 9, outputTokens: 5 }); // coalesced from message_start + message_delta
    expect(frames.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
  });

  test("openai chat: SSE incl. [DONE] → text/usage/done", async () => {
    const frames = await framesViaCassette(
      openaiAdapter,
      { op: "chat", model: "openai/gpt-4o", messages: [{ role: "user", content: "Say hello in one word." }], maxOutputTokens: 64 },
      "openai-chat-basic-v1.json",
      "sk-test-key-value",
    );
    const usage = frames.find((f) => f.type === "usage") as Extract<StreamFrame, { type: "usage" }>;
    expect(usage).toEqual({ type: "usage", inputTokens: 11, outputTokens: 2 });
    expect(frames.at(-1)).toMatchObject({ type: "done", stopReason: null }); // [DONE] carries no reason
  });

  test("openai embed: JSON body → embedding frames + usage + done", async () => {
    const frames = await framesViaCassette(
      openaiAdapter,
      { op: "embed", model: "openai/text-embedding-3-small", input: ["hello world"] },
      "openai-embed-basic-v1.json",
      "sk-test-key-value",
    );
    const embeddings = frames.filter((f): f is Extract<StreamFrame, { type: "embedding" }> => f.type === "embedding");
    expect(embeddings).toHaveLength(1);
    expect(embeddings[0]!.vector).toEqual([0.0125, -0.0375, 0.0625, 0.0875]);
    expect(frames.some((f) => f.type === "usage" && f.inputTokens === 2 && f.outputTokens === 0)).toBe(true);
    expect(frames.at(-1)).toMatchObject({ type: "done", stopReason: null });
  });

  test("ollama chat: NDJSON → text/usage/done (local, no secret)", async () => {
    const frames = await framesViaCassette(
      ollamaAdapter,
      { op: "chat", model: "ollama/llama3.2", messages: [{ role: "user", content: "Say hello in one word." }] },
      "ollama-chat-basic-v1.json",
      null,
    );
    expect(frames.filter((f) => f.type === "text").map((f) => (f as { delta: string }).delta).join("")).toBe("Hello");
    const usage = frames.find((f) => f.type === "usage") as Extract<StreamFrame, { type: "usage" }>;
    expect(usage).toEqual({ type: "usage", inputTokens: 9, outputTokens: 2 });
    expect(frames.at(-1)).toMatchObject({ type: "done", stopReason: "stop" });
  });

  test("capability matrices are declared honestly per provider", () => {
    expect(anthropicAdapter.ops.has("chat")).toBe(true);
    expect(anthropicAdapter.ops.has("embed")).toBe(false); // no embeddings API — declared, never faked
    expect(anthropicAdapter.secretName).toBe("ANTHROPIC_API_KEY");
    expect(openaiAdapter.ops.has("embed")).toBe(true);
    expect(openaiAdapter.ops.has("rerank")).toBe(false);
    expect(ollamaAdapter.requiresSecret).toBe(false);
    expect(ollamaAdapter.secretName).toBeNull();
  });

  test("non-200 responses fail loudly E1601 with a truncated body (never retried as success)", async () => {
    const scripted: GatewayTransport = {
      name: "scripted-500",
      async send(_req: TransportRequest): Promise<TransportResponse> {
        const chunks: AsyncIterable<TransportChunk> = {
          async *[Symbol.asyncIterator]() {
            yield { text: '{"error":{"message":"overloaded"}}' };
          },
        };
        return { status: 529, headers: {}, chunks };
      },
    };
    let threw: unknown = null;
    try {
      await anthropicAdapter.open(
        { op: "chat", model: "anthropic/claude-3-5-sonnet-latest", messages: [{ role: "user", content: "hi" }] },
        { clock: new FixedClock(T0), rng: new SeededRng(1), transport: scripted, secret: "k" },
      );
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(VaerionError);
    expect((threw as VaerionError).code).toBe("E1601");
    expect((threw as Error).message).toContain("529");
  });

  test("stream error frames from ollama surface as E1601 (provider reported failure)", async () => {
    const scripted: GatewayTransport = {
      name: "scripted-ollama-error",
      async send(): Promise<TransportResponse> {
        const chunks: AsyncIterable<TransportChunk> = {
          async *[Symbol.asyncIterator]() {
            yield { text: '{"error":"model \'nope\' not found"}\n' };
          },
        };
        return { status: 200, headers: {}, chunks };
      },
    };
    let threw: unknown = null;
    const stream = await ollamaAdapter.open(
      { op: "chat", model: "ollama/nope", messages: [{ role: "user", content: "hi" }] },
      { clock: new FixedClock(T0), rng: new SeededRng(1), transport: scripted, secret: null },
    );
    try {
      for await (const _frame of stream) void _frame;
    } catch (err) {
      threw = err;
    }
    expect(threw).toBeInstanceOf(VaerionError);
    expect((threw as VaerionError).code).toBe("E1601");
  });
});
