# ADR-0006: Event-sourced run journals + checkpoint chaining

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

Runs must be deterministic (Sacred Invariant 3): a run replays to identical
state given the same journal and seeds. Runs also crash — the engine must
resume them without inventing state, and must never lose events silently
(P9). The journal is therefore not a log of convenience; it is the truth from
which state, receipts, and audits are derived.

## Decision

1. Runs are event-sourced (D-B). Each run persists an append-only,
   hash-chained NDJSON journal (`.vaerion/journal/<run_id>.ndjson`).
2. The chain is blake3 (D-I): `hash = blake3(canonical(record sans hash))`;
   `prev` links to the previous record's hash, with 64 zeros as the genesis
   link. Records carry a 1-based chain index `i`.
3. One writer per journal, enforced by an exclusive-create lock with
   stale-owner detection (D-G). The writer allocates per-run, gapless,
   monotonic envelope sequence numbers; call sites never choose `seq`.
4. Record kinds are fixed by contract: `meta` (header, recovery, export
   notes), `evt` (one spine envelope), `decision` (journaled broker
   decision), `gate` (durable human gate), `snapshot` (checkpoint state
   bag), `receipt` (closing receipt). The schema is published as
   `spec/schemas/journal-record.schema.json`.
5. Recovery is auditable: a torn tail is truncated and re-sealed with a
   `recovery` meta record; verification (`verify`) walks the chain and
   reports the first broken index. Silent truncation is forbidden.
6. Snapshots are accelerators, never truth: restore prefers snapshots but
   falls back to full replay, and a snapshot that disagrees with the journal
   is discarded (`E1501`).
7. Every run closes with a receipt computed as a fold over its journal, so a
   receipt can never disagree with it.

## Consequences

- Positive: replay, resume, audit, and receipts all derive from one artifact;
  chaos kill/resume tests have a precise correctness oracle.
- Positive: NDJSON is greppable, diffable, and user-prunable with ordinary
  tools.
- Negative: append-only chains make retroactive edits impossible by design —
  corrections happen as new records, not rewrites.
- Negative: single-writer serialization bounds per-run throughput; the engine
  pays a lock round-trip per append by law.
