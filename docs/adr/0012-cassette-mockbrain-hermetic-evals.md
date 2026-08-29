# ADR-0012: Cassette/MockBrain hermetic eval methodology

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

The engine's behavior depends on model output, which is nondeterministic,
rate-limited, and priced. CI that calls live providers is flaky, slow, and
expensive, and it cannot reproduce failures deterministically — violating
the determinism doctrine (P2) for the very tests that must gate merges. At
the same time, evals that never see real model behavior drift into fiction.

## Decision

1. AI-facing tests run hermetically against two deterministic devices:
   - Cassettes: recorded provider HTTP transcripts replayed verbatim,
     including streaming chunk boundaries and error responses.
   - MockBrain: a seeded virtual provider implementing the model port
     (ADR: ModelProvider surface), producing scripted, seed-deterministic
     outputs (text, tool calls, usage) without network.
2. PR-CI uses only cassettes and MockBrain; hermeticity rules apply — no
   network, no wall-clock, no ambient randomness outside injected ports.
3. A weekly shadow suite runs scenario suites against live providers and is
   report-only: it flags behavioral drift (schema, tool-call shape, refusal
   patterns) for human review and cassette re-recording, and never gates.
4. Golden fixtures for evals regenerate only via an explicit bless command
   that renders diffs for review; silent golden updates are forbidden.
5. Cassette files are committed fixtures with stable IDs; a change to a
   cassette is a reviewed contract change, not a test detail.

## Consequences

- Positive: deterministic, free, fast PR-CI; reproducible failure reports
  ("rerun with this seed against this cassette").
- Positive: drift between providers and the engine's expectations is
  observed on a schedule instead of by user bug report.
- Negative: cassettes rot as providers evolve; re-recording is a standing
  maintenance cost tied to the provider-churn risk (R-1).
- Negative: hermetic evals under-approximate live model variance; the
  report-only shadow suite is the compensating control and must not be
  allowed to lapse.
