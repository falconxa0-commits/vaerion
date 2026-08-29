/**
 * Vaerion — gateway transport seam (THE single sanctioned egress site).
 *
 * Constitutional position (C1 / D-K / D-J): the engine contains no ambient
 * network. This file is the ONE module allowed to carry endpoint URLs and
 * call `fetch` — the constitutional-check allowlists exactly this path. It
 * is reached ONLY behind a journaled broker decision (`model.invoke`,
 * decide→journal→act) so every byte that leaves the machine is authorized,
 * attributed, and metered. Nothing here is telemetry: providers receive
 * exactly the declared invocation payload and nothing else.
 *
 * Host keys are resolved here (and only here) to endpoints:
 *   anthropic → the Anthropic Messages API origin
 *   openai    → the OpenAI API origin
 *   ollama    → the local Ollama daemon (loopback)
 */

import { VaerionError } from "../kernel/errors.ts";
import type { GatewayTransport, TransportChunk, TransportRequest, TransportResponse } from "./types.ts";

/** Host-key → endpoint base map. The only endpoint knowledge in the engine. */
const ENDPOINTS: Readonly<Record<string, string>> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  ollama: "http://127.0.0.1:11434",
};

export function endpointForHost(host: string): string {
  const base = ENDPOINTS[host];
  if (base === undefined) {
    throw new VaerionError("E1601", `no endpoint declared for host key "${host}"`, { host });
  }
  return base;
}

function sseBodyToChunks(body: ReadableStream<Uint8Array> | null): AsyncIterable<TransportChunk> {
  const stream = body;
  return {
    async *[Symbol.asyncIterator]() {
      if (stream === null) return;
      const decoder = new TextDecoder();
      for await (const piece of stream) {
        yield { text: decoder.decode(piece, { stream: true }) };
      }
      const tail = decoder.decode();
      if (tail.length > 0) yield { text: tail };
    },
  };
}

/**
 * Production transport (declared provider egress only). Never used by tests
 * (ADR-0012 hermeticity): CI injects cassette/scripted transports instead.
 */
export const fetchTransport: GatewayTransport = {
  name: "fetch",
  async send(req: TransportRequest): Promise<TransportResponse> {
    const base = endpointForHost(req.host);
    const url = `${base}${req.path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
    } catch (err) {
      // Network-level refusal (DNS, unreachable, aborted) — loud, coded.
      throw new VaerionError("E1706", `transport refused for ${req.host}${req.path}: ${(err as Error).message}`, { host: req.host, path: req.path });
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      chunks: sseBodyToChunks(response.body),
    };
  },
};
