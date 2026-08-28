/**
 * vae-store — journal entry format v1 (D9.3, D12.1).
 *
 * The entry shape is a constitutional promise (Article IX): additive
 * field additions only within v1. Every entry carries actor + cause,
 * chains to its predecessor with blake3, and keeps blobs out of line
 * (blob_ref law, D9.5).
 */

import type { Json } from "vae-foundation";
import { blake3Text, canonicalJson } from "vae-foundation";
import type { Cause, PrincipalRef } from "vae-foundation";

export const JOURNAL_ENTRY_VERSION = 1 as const;
export const GENESIS = "GENESIS";

export interface JournalEntryInput {
  readonly seq: number;
  readonly ts: string;
  readonly type: string;
  readonly actor: PrincipalRef;
  readonly cause: Cause;
  readonly payload: Json;
  readonly blob_refs?: string[];
}

export interface JournalEntry extends JournalEntryInput {
  readonly v: typeof JOURNAL_ENTRY_VERSION;
  readonly prev: string;
  readonly hash: string;
}

/** The canonical hash input: the entry without its `hash` field. */
export function entryHashInput(entry: Omit<JournalEntry, "hash">): string {
  const { hash: _omitted, ...rest } = entry as JournalEntry;
  void _omitted;
  return canonicalJson(rest);
}

export function computeEntryHash(entry: Omit<JournalEntry, "hash">): string {
  return blake3Text(entryHashInput(entry));
}

/** Chain a new entry onto `prevHash` — pure, deterministic. */
export function chainEntry(input: JournalEntryInput, prevHash: string): JournalEntry {
  const withoutHash = {
    v: JOURNAL_ENTRY_VERSION,
    seq: input.seq,
    ts: input.ts,
    type: input.type,
    actor: input.actor,
    cause: input.cause,
    payload: input.payload,
    ...(input.blob_refs !== undefined ? { blob_refs: input.blob_refs } : {}),
    prev: prevHash,
  };
  return { ...withoutHash, hash: computeEntryHash(withoutHash) };
}
