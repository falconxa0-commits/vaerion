# ADR-0018: Engine substrate for the reference implementation: TypeScript on Bun

| | |
|---|---|
| Status | Proposed — pending Founder ratification |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

The ratified constitution is language-agnostic. Its load-bearing law — one
event spine of versioned envelopes, append-only blake3-chained NDJSON
journals with a single writer, a fail-closed permission broker with journaled
decisions and durable gates, deterministic replay, receipts folded from
journals, blob CAS, and contracts published additively in `spec/` — binds
behavior, not implementation language. Nothing in the constitution or the
decision register (D-A through D-O) requires a particular runtime.

The original Master Blueprint proposed Rust for the core, motivated by
shipping goals: single static cross-platform binaries, WASI component
hosting via wasmtime, fearless parallelism in the indexer, and
binary-size/latency budgets. Those goals remain the intent for shipping
milestones. However, the current engineering environment is fixed and
verified: it provides Bun 1.3.14 with TypeScript 5, first-class TypeScript
execution, and a working toolchain — and MS-0/MS-1 (skeleton, law-in-repo,
runtime spine) must actually run and be verified here, not merely be
described.

The honest risk is self-deception: a plan that claims Rust verification that
did not occur, or code that cannot execute in its own environment. The
constitution values verification (every release ships verification reports;
chaos suites must be green) over aspiration.

## Decision (proposed)

1. MS-0 and MS-1 are implemented in TypeScript on Bun (the reference
   implementation substrate actually present in this environment): the
   kernel (errors, hash, canonical JSON, clock, ids), spine (envelope,
   registry, bus, serialization), journal (writer, reader, verify, replay,
   recovery, lock), blob CAS, receipts, broker contracts, research
   subsystem, and config layer, with unit/integration/chaos verification
   executed by the real runtime.
2. Rust remains the intended substrate for shipping milestones (MS-3
   onward: Model Gateway, agent executor at scale, daemon, packaging),
   pending a Founder-ratified ADR that either confirms or replaces that
   intent. No Rust decision is rescinded here; none is pretended either.
3. Substrate neutrality is preserved by law, not by hope: the journal format
   (NDJSON + blake3 chain per D-I), the envelope v1 schema, the event
   registry, the error catalog, and all broker/research/receipt contracts
   are defined in `spec/` and are language-neutral. The TypeScript code is a
   mirror of those contracts, so re-platforming ports behavior against
   stable law instead of rewriting under way (P11).
4. Golden fixtures (journals, receipts, bundles) produced by the TypeScript
   implementation double as cross-substrate conformance vectors for any
   future implementation.

## Consequences

- Positive (honesty): all MS-0/MS-1 verification is real — the code runs,
  the chaos suite executes, the receipts verify — because the substrate is
  the environment's own.
- Positive: contracts-first discipline (ADR-0003) means the re-platform
  cost is bounded by contracts: port the mirror, replay the goldens, keep
  the law.
- Negative: the blueprint's runtime performance, binary-size, and
  single-static-binary goals are NOT met by this substrate and are NOT
  claimed for MS-0/MS-1 artifacts; they remain attached to the shipping
  substrate decision, explicitly deferred to Founder ratification.
- Negative: two substrates across the program would divide tooling and
  review expertise; this ADR accepts that risk only for the skeleton and
  spine phase, and only because verification demands it.
- Neutral: nothing in the constitution is interpreted or amended by this
  record; it is an engineering substrate proposal beneath ratified law,
  and it lapses into implementation only upon Founder ratification.
