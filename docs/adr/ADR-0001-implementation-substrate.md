# ADR-0001: Implementation substrate for the `vae-*` units

- **Status:** Accepted (Class C, Article XIII — ADR-scoped, maintainer action)
- **Date:** MS-0 implementation start
- **Precedence:** Below ratified stage decisions (D4.1). This ADR contradicts no ratified decision.

## Context

Stage 6 (D6.2) ratifies a single-version monorepo of **crates prefixed `vae-`, fourteen at ratification**. Stage 6's *Hidden Assumptions* section records the expectation that "Rust crate boundaries can express the L0–L4 law without heroic build gymnastics" — an assumption, explicitly not a binding decision. No ratified Key Decision names the implementation language.

The MS-0 build environment has **no Rust toolchain and no crates.io reachability** (egress-verified). MS-0 acceptance requires the CI gates of D20.8 to be *operational and green* — verification must be runnable, not presumed (Stage 20 principle 4: "green means proven"). Writing Rust that cannot compile, test, or verify in the build environment would violate the Founder's explicit verification requirements and D20.8's meaning while satisfying D6.2's letter in name only.

## Decision

Implement the fourteen `vae-*` units as **workspace units of a single-version Bun/TypeScript monorepo**, preserving every ratified structural decision:

- D6.1 single-version monorepo → one root `package.json` version governs all units (D21.9 posture).
- D6.2 `vae-` prefix, fourteen units → exactly fourteen `packages/vae-*` units with the ratified ownership boundaries.
- D6.3 `spec/` + daylight rule → verbatim.
- D6.4 L0–L4 layerlint → `tools/layerlint.ts` enforces the ratified dependency matrix on every `src/` import.
- D12.1 blake3 hash chains → `@noble/hashes` (pure, audited, vector-verified in tests).
- D21.3 self-contained local binary → the `vae` binary compiles to a standalone executable via `bun build --compile` at release (Stage 21 posture preserved).
- D22.3 forbidden shortcuts → none taken; the substrate change is recorded here, not hidden.

## Consequences

- The layer law, contracts, envelope, journal format, exit codes, and refusal doctrine are unchanged; they are substrate-independent by design (protocol over application, P2).
- Rust remains a valid future substrate migration path; because all boundaries are port-based and machine-enforced, a port moves units one at a time without contract change (Open Contracts, Sacred Invariant VIII).
- This ADR owns the deviation from Stage 6's hidden assumption; hidden assumptions are visible-and-owned by design (Stage 2, Stage 6).

## Alternatives considered

1. **Rust, unverifiable in this environment** — rejected: red gates cannot be run; D20.8 would be decoration, which the constitution forbids (Stage 4: "law that cannot be enforced is decoration").
2. **Wait for a Rust-capable environment** — rejected: blocks MS-0 foundations without changing any ratified decision.
3. **Polyglot (some Rust, some TS)** — rejected: two toolchains, one of them unverifiable; complexity is guilty until proven innocent (P9).
