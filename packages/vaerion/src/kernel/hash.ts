/**
 * Vaerion kernel — hashing.
 *
 * Law: the journal and audit ledgers are blake3-chained (ratified decision).
 * hash-wasm provides the blake3 implementation; this module is the ONLY place
 * the engine touches it, so the substrate can be swapped by ADR without
 * touching chain logic.
 */

import { blake3 as blake3Hash } from "hash-wasm";

export type HashHex = string; // lowercase hex, 64 chars for blake3-256

export const GENESIS_HASH: HashHex = "0".repeat(64);

export async function blake3HexOf(data: string | Uint8Array): Promise<HashHex> {
  return (await blake3Hash(data)).toLowerCase();
}

export function isHashHex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
