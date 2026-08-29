/**
 * Cassette recorder (ADR-0012) — MS-3 wire transcripts.
 *
 * Law: a cassette is a RECORDED provider transcript, committed as a fixture
 * with a stable id. This script records the four v0.1 baseline transcripts:
 * the wire chunks are authored from the providers' documented streaming
 * formats (as pinned in the adapter header comments), and the request
 * fingerprint is computed through the REAL pipeline — the adapter itself
 * builds the request against a recording transport, so the fingerprint is
 * of the exact bytes the adapter emits. Replaying these cassettes exercises
 * the adapters hermetically; touching the network in CI remains forbidden.
 *
 * Run: bun run packages/vaerion/scripts/record-cassettes.ts
 * (only run deliberately — it rewrites fixture files, which is a reviewed
 * contract change, never a test detail)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { requestFingerprint, type Cassette } from "../src/gateway/cassette.ts";
import type { GatewayTransport, TransportRequest, TransportResponse, ProviderAdapter, ProviderContext, ModelRequest } from "../src/gateway/types.ts";
import { anthropicAdapter } from "../src/gateway/adapters/anthropic.ts";
import { openaiAdapter } from "../src/gateway/adapters/openai.ts";
import { ollamaAdapter } from "../src/gateway/adapters/ollama.ts";
import { FixedClock, SeededRng } from "../src/kernel/clock.ts";

const FIXTURE_DIR = join(import.meta.dir, "..", "fixtures", "cassettes");

/** Authored wire transcripts (documented provider streaming formats). */
const ANTHROPIC_SSE: string[] = [
  'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_rec","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-latest","usage":{"input_tokens":9,"output_tokens":1}}}\n\n',
  'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
  'event: ping\ndata: {"type":"ping"}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}\n\n',
  'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":5}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
];

const OPENAI_CHAT_SSE: string[] = [
  'data: {"id":"chatcmpl-rec","object":"chat.completion.chunk","created":1735689600,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"Hel"},"finish_reason":null}]}\n\n',
  'data: {"id":"chatcmpl-rec","object":"chat.completion.chunk","created":1735689600,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"lo"},"finish_reason":null}]}\n\n',
  'data: {"id":"chatcmpl-rec","object":"chat.completion.chunk","created":1735689600,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
  'data: {"id":"chatcmpl-rec","object":"chat.completion.chunk","created":1735689600,"model":"gpt-4o","choices":[],"usage":{"prompt_tokens":11,"completion_tokens":2,"total_tokens":13}}\n\n',
  "data: [DONE]\n\n",
];

const OPENAI_EMBED_JSON: string[] = [
  '{"object":"list","data":[{"object":"embedding","index":0,"embedding":[0.0125,-0.0375,0.0625,0.0875]}],"model":"text-embedding-3-small","usage":{"prompt_tokens":2,"total_tokens":2}}',
];

const OLLAMA_NDJSON: string[] = [
  '{"model":"llama3.2","created_at":"2026-08-29T12:00:00Z","message":{"role":"assistant","content":"Hel"},"done":false}\n',
  '{"model":"llama3.2","created_at":"2026-08-29T12:00:01Z","message":{"role":"assistant","content":"lo"},"done":false}\n',
  '{"model":"llama3.2","created_at":"2026-08-29T12:00:02Z","message":{"role":"assistant","content":""},"done_reason":"stop","done":true,"prompt_eval_count":9,"eval_count":2}\n',
];

/** Record one adapter invocation: capture the real request, pair with authored chunks. */
async function record(adapter: ProviderAdapter, op: string, cassetteId: string, req: ModelRequest, chunks: string[]): Promise<Cassette> {
  let captured: TransportRequest | null = null;
  const transport: GatewayTransport = {
    name: "recorder",
    async send(req2: TransportRequest): Promise<TransportResponse> {
      captured = req2;
      const iterable: AsyncIterable<{ text: string }> = {
        async *[Symbol.asyncIterator]() {
          for (const text of chunks) yield { text };
        },
      };
      return { status: 200, headers: {}, chunks: iterable };
    },
  };
  const ctx: ProviderContext = {
    clock: new FixedClock(1735689600000),
    rng: new SeededRng(42),
    transport,
    secret: adapter.requiresSecret ? "sk-test-record-only" : null,
  };
  const stream = await adapter.open(req, ctx);
  // Consume fully (the recorder IS the transport; nothing leaves the machine).
  for await (const _frame of stream) void _frame;
  if (captured === null) throw new Error(`recorder: ${cassetteId} captured no request`);
  const realRequest: TransportRequest = captured;
  return {
    cassette_id: cassetteId,
    provider: adapter.provider,
    op,
    request_fingerprint: await requestFingerprint(realRequest),
    status: 200,
    chunks,
  };
}

async function main(): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true });
  const cassettes: Cassette[] = [];

  cassettes.push(
    await record(
      anthropicAdapter,
      "chat",
      "anthropic-chat-basic-v1",
      { op: "chat", model: "anthropic/claude-3-5-sonnet-latest", messages: [{ role: "user", content: "Say hello in one word." }], maxOutputTokens: 64 },
      ANTHROPIC_SSE,
    ),
  );
  cassettes.push(
    await record(
      openaiAdapter,
      "chat",
      "openai-chat-basic-v1",
      { op: "chat", model: "openai/gpt-4o", messages: [{ role: "user", content: "Say hello in one word." }], maxOutputTokens: 64 },
      OPENAI_CHAT_SSE,
    ),
  );
  cassettes.push(
    await record(
      openaiAdapter,
      "embed",
      "openai-embed-basic-v1",
      { op: "embed", model: "openai/text-embedding-3-small", input: ["hello world"] },
      OPENAI_EMBED_JSON,
    ),
  );
  cassettes.push(
    await record(
      ollamaAdapter,
      "chat",
      "ollama-chat-basic-v1",
      { op: "chat", model: "ollama/llama3.2", messages: [{ role: "user", content: "Say hello in one word." }] },
      OLLAMA_NDJSON,
    ),
  );

  for (const cassette of cassettes) {
    const path = join(FIXTURE_DIR, `${cassette.cassette_id}.json`);
    await writeFile(path, `${JSON.stringify(cassette, null, 2)}\n`, "utf8");
    console.log(`recorded ${cassette.cassette_id} (${cassette.chunks.length} chunks) → ${path}`);
  }
}

await main();
