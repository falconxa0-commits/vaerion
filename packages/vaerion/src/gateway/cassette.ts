/**
 * Vaerion — cassette replay transport (ADR-0012).
 *
 * A cassette is a RECORDED provider transcript: the request fingerprint and
 * the raw wire chunks in their recorded order (chunk boundaries included).
 * Replaying one reproduces the provider conversation byte-for-byte — the
 * hermetic, deterministic, free PR-CI device. Cassettes are committed
 * fixtures with stable ids; changing one is a reviewed contract change,
 * never a test detail. Golden updates happen only via the explicit bless
 * path (`VAE_BLESS=1`), never silently.
 *
 * Cassette JSON shape (fixtures/cassettes/<id>.json):
 *   { "cassette_id": string, "provider": string, "op": string,
 *     "request_fingerprint": blake3-hex,
 *     "chunks": [string, ...],
 *     "status": number }
 */

import { readFile } from "node:fs/promises";
import { blake3HexOf } from "../kernel/hash.ts";
import { canonicalJson } from "../kernel/canonical.ts";
import { VaerionError } from "../kernel/errors.ts";
import type { GatewayTransport, TransportChunk, TransportRequest, TransportResponse } from "./types.ts";

export interface Cassette {
  cassette_id: string;
  provider: string;
  op: string;
  /** blake3 over the canonicalized logical request (method+host+path+body). */
  request_fingerprint: string;
  status: number;
  /** Raw wire chunks in recorded order. */
  chunks: string[];
}

export function assertCassetteShape(value: unknown): asserts value is Cassette {
  const c = value as Partial<Cassette> | null;
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E1702", `cassette shape invalid: ${why}`);
  };
  if (!c || typeof c !== "object") fail("cassette must be an object");
  if (typeof c.cassette_id !== "string" || c.cassette_id.length === 0) fail("cassette_id missing");
  if (typeof c.provider !== "string" || c.provider.length === 0) fail("provider missing");
  if (typeof c.op !== "string" || c.op.length === 0) fail("op missing");
  if (typeof c.request_fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(c.request_fingerprint)) fail("request_fingerprint must be blake3 hex");
  if (!Array.isArray(c.chunks) || c.chunks.some((s) => typeof s !== "string")) fail("chunks must be an array of strings");
  if (typeof c.status !== "number") fail("status must be a number");
}

/** Canonical fingerprint of a logical request (stable across transports). */
export async function requestFingerprint(req: TransportRequest): Promise<string> {
  return blake3HexOf(canonicalJson({ host: req.host, path: req.path, method: req.method, body: req.body }));
}

function textChunksToIterable(chunks: readonly string[]): AsyncIterable<TransportChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of chunks) yield { text };
    },
  };
}

/**
 * Build a cassette replay transport over a fixed cassette set. Replay law:
 *   - the cassette whose fingerprint matches the request is returned;
 *   - NO fingerprint match ⇒ fail closed (E1702) — a missing recording is
 *     a loud defect, never an excuse to touch the network.
 */
export function cassetteTransport(cassettes: readonly Cassette[]): GatewayTransport {
  // Replay law starts with shape law: every cassette is validated loudly at
  // construction — a malformed fixture is a contract defect, not a replay miss.
  for (const cassette of cassettes) assertCassetteShape(cassette);
  const byFingerprint = new Map(cassettes.map((c) => [c.request_fingerprint, c] as const));
  return {
    name: "cassette",
    async send(req: TransportRequest): Promise<TransportResponse> {
      const fp = await requestFingerprint(req);
      const hit = byFingerprint.get(fp);
      if (hit === undefined) {
        throw new VaerionError("E1702", `no cassette recorded for request fingerprint ${fp.slice(0, 12)}… (host ${req.host}, path ${req.path}) — record it or fix the request; never bypass the replay law`, { host: req.host, path: req.path });
      }
      return {
        status: hit.status,
        headers: { "x-vaerion-cassette": hit.cassette_id },
        chunks: textChunksToIterable(hit.chunks),
      };
    },
  };
}

/** Load a cassette fixture from disk (shape-validated, loud on drift). */
export async function loadCassette(path: string): Promise<Cassette> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    throw new VaerionError("E1702", `cassette not readable at ${path}: ${(err as Error).message}`);
  }
  const parsed: unknown = JSON.parse(raw);
  assertCassetteShape(parsed);
  return parsed;
}
