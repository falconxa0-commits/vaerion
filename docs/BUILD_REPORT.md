# BUILD REPORT — MS-0 Skeleton and Law-in-Repo

**Repository:** vaerion (single-version monorepo) · **Engine version:** 0.1.0-ms.0 · **Constitution:** VAERION_CONSTITUTION_v1.0 (in-repo as `CONSTITUTION.md`, D4.7)

## What was built

Fourteen `vae-*` units (D6.2) in the ratified L0–L4 layer law (D6.4),
plus the spec directory (D6.3), golden fixtures (D20.2), verification
courts, CI (D20.8 minus journeys), and a working `vae` binary with the
Daily Seven honoring the Five Guarantees.

| # | Unit | Layer | Built (real, tested — nothing pretends) |
|---|---|---|---|
| 1 | `vae-foundation` | L0 | Envelope v1 + schema guard, 32-code E#### catalog (contract-tested against `spec/errors.yaml`), exit alphabet, monotonic ULID, Clock abstraction, canonical JSON, blake3 (official-vector verified), boundary redaction, receipt contract, decimal-string money |
| 2 | `vae-config` | L0 | VaerYaml strict-subset parser (anchors/aliases/tags/multi-doc/tab/block-scalar refused), versioned schema (unknown keys refused), layered resolution (defaults < engine < profile < project < env < flag) with leaf-level provenance, pinned run snapshots, workspace discovery |
| 3 | `vae-store` | L1 | NDJSON journal with blake3 chain (gapless seq, genesis linkage, tamper detection), audit sister chain, content-addressed blob store (`blake3:` refs), stateless event spine (redaction at publish, consumer-failure containment), single-writer registry |
| 4 | `vae-capabilities` | L1 | Pure decision function (deterministic, property-testable), fail-closed, deny-beats-allow, audit-failure=denial, durable park-gate queue, Refusal Log, journal-backed audit sink |
| 5 | `vae-tools` | L1 | Versioned registry, strict input contracts (fail-closed validation), effect classes, retry policies, typed failure taxonomy (retryable/fatal/refusal), engine builtins (`journal.verify`, `config.validate`, `blobs.verify`) behind ports |
| 6 | `vae-gateway` | L1 | Provider ports, explicit fallback chains only (E2009), circuit breaker state machine (5/30s → open 30s, half-open probe law), recording postures (full default), versioned pricing tables. **Zero network code** |
| 7 | `vae-intel` | L2 | Ports + data contracts for symbols/chunks/vectors/query DSL — implementation is MS-4; an unimplemented port has no implementation to fake |
| 8 | `vae-context` | L2 | One Context Path types, provenance records (blake3 fingerprints), untrusted-content fencing, pack contract with mandatory exclusion reasons, three scopes, **research capability foundation** (principal, declaration, sources, evidence, connector registry — empty by default, fail-closed) |
| 9 | `vae-ext-host` | L2 | Extension manifest validation, compatibility ranges (E2006), lifecycle state machine (registered→active→disabled→removed), isolation boundary port (sandbox is MS-6) |
| 10 | `vae-workflow` | L2 | Plan validation (E1008: duplicates, unknown deps, cycles), deterministic dependency-first scheduling, plan fingerprints, durable checkpoint store, park semantics types |
| 11 | `vae-agent` | L2 | Budget meter (conservation invariant, hard stop → partial receipt), journaled-decision law wrapper (decide→journal→act), engine services: init, run, resume, doctor, journal, explain |
| 12 | `vae-package` | L2 | .vxn manifest contract, deterministic fingerprinting, digest well-formedness; build/sign/verify is MS-6 |
| 13 | `vae-api` | L3 | Loopback-only daemon (Bun.serve), pairing token (0600, constant-time compare), canonical envelope responses, NDJSON journal streams, runtime OpenAPI emission (spec/openapi.json contract-diffed in CI) |
| 14 | `vae-cli` | L4 | The `vae` binary (alias `vaerion`): Daily Seven, hand-rolled deterministic arg parsing, three renderings (human/plain/json), receipts before exit, `vae help E####` error curriculum |

Supporting structure: `spec/` (11 contracts), `fixtures/` (5 golden CLI
fixtures + envelope samples), `tools/` (layerlint, fixture runner,
secrets court, telemetry court, constitution court, OpenAPI emitter),
`docs/` (architecture, onboarding, ADR-0001, roadmap status, reports),
`.github/workflows/ci.yml`, `sdks/typescript` (typed envelope client,
MS-5 conformance-locked).

## Why it exists

MS-0 is "Skeleton and Law-in-Repo" (Stage 22): a repository whose shape
enforces the constitution, with gates operational before features. The
Founder's order extended the floor with a 50/50 foundation — real
engine mechanics (spine, journal, broker, executor) and real developer
experience (CLI, daemon, SDK prep, fixtures, docs) — so the first
version already behaves like a trustworthy engine: everything above is
**implemented and tested, never stubbed or faked**. Where a subsystem
belongs to a later milestone, the crate declares its ports and prints
its honest inventory (e.g., `INTEL_STATUS`, `EXT_HOST_STATUS`).

## Constitutional decisions satisfied

- **Stage 6:** D6.1 single version; D6.2 fourteen `vae-` units; D6.3 spec/ + daylight; D6.4 layerlint live and blocking.
- **Stage 3 / Stage 18:** D3.1 binary+alias; D3.2 Daily Seven; D3.3 Guarantees; D3.7/D18.3 one envelope three renderings; D3.8/D18.2 E#### + Fix; D18.5 non-interactive refusal; D18.6 exit alphabet; D18.7 machine mode discipline; D18.9 receipts+dry-run; D18.10 teaching help; D18.11 top-level = Daily Seven; D18.12 deterministic outputs.
- **Stage 9:** D9.1 journal=log, spine=fan-out; D9.2 gapless seq; D9.3 actor+cause; D9.4 redaction at publish; D9.5 blob_ref; D9.6 at-least-once + idempotent consumers.
- **Stage 10:** D10.1 fail-closed; D10.2 deny-beats-allow; D10.3 pure decisions; D10.4 durable park; D10.5 diff-only policy; D10.6 core traverses broker (engine tools declare capabilities); D10.7 audit failure=denial.
- **Stage 11:** D11.1 single writer; D11.2 ULID scheduling; D11.3 sequential execution; D11.4 decide→journal→act; D11.5 budget hard stop → partial receipt; D11.6 checkpoints before effects.
- **Stage 12:** D12.1 blake3 chains (tamper-detection proven in tests); D12.2 audit sister chain same format; D12.4 drift refusal (resume verifies plan+config fingerprints).
- **Stage 16:** D16.1 registry; D16.2 fail-closed validation; D16.4 broker-mediated invocation; D16.6 journaled invocations; D16.8 typed failures; D16.10 declared retry policy.
- **Stage 17:** D17.1 OpenAPI emitted and contract-diffed; D17.6 error contract across surfaces; D17.7 envelope-only responses; D17.9 loopback + pairing token.
- **Stage 19:** D19.1 precedence+provenance; D19.2 unknown keys refused; D19.4 profiles; D19.6 env mapping; D19.7 pinned snapshots; D19.10 refuse on invalid.
- **Stage 14 / research order:** D14.3 provenance + fencing; research as a declared, broker-mediated, fail-closed capability with zero network code.
- **Stage 20:** D20.1 guarantees conformance suite (CLI); D20.2 fixtures as precedent; D20.3 determinism double-run; D20.5 property tests (chain, breaker, budget conservation posture, decision purity); D20.8 gates minus journeys; D20.9 layerlint in CI.
- **Article XII culture:** violations typed C1–C3; the catalog, courts, and gates make enforcement mechanical, not discretionary (Article XIV).

## What remains (next milestone)

**MS-1 — Spine and Journal** (Stage 22): chaos kill-during-append with
verifiable chains, cross-process writer locks, redacting exporter,
explicit reference-aware GC, full D20.5 property sweep. See
`docs/roadmap-status.md` for the complete law-visible deferral table.
