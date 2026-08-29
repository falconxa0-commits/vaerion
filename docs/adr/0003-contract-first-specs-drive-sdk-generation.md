# ADR-0003: Contract-first specs drive SDK generation

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

The constitution guarantees Machine Parity (Sacred Invariant 7): the CLI, the
API, and the SDKs honor the same contracts, and an "API gap" is impossible by
construction. Hand-synced enums and types across a runtime mirror, two SDK
languages, and documentation are a known failure mode: they drift silently,
and drift is discovered by users, not by CI.

The engine already treats contracts as protocol (P3): envelopes, schemas, the
event registry, the error catalog, and the config schema are versioned,
additive-only within a major, and governed with deprecation windows.

## Decision

1. `spec/` is the single source of truth for wire-level contracts. The
   runtime module is a mirror of `spec/`, never the reverse; verification
   asserts mirror and spec stay in sync.
2. The initial contract set is: envelope schema (v1), journal record schema
   (v1), event registry (v1), error catalog (v1), config schema (0.1), and
   the broker, research, and receipt schemas.
3. SDK types are generated from the published schemas; generated code carries
   a header naming the generator and the spec revision. Hand-editing
   generated artifacts is a defect.
4. `spec/` changes require two approvals (contract discipline) and a
   `CHANGELOG-SPEC.md` entry. Evolution is additive-only within a major;
   deprecation windows precede removal at majors.
5. Contract-diff checks run in CI and block drift between spec, runtime
   mirrors, and generated SDK types.

## Consequences

- Positive: parity is enforced mechanically rather than aspirationally; docs
  and error catalogs are generated from the same source users hit at runtime.
- Positive: re-platforming or adding an SDK is bounded by contracts, since
  the contract is the definition and the implementations are mirrors.
- Negative: codegen and verification infrastructure must exist from the start
  (MS-0), before most features; this front-loads tooling work.
- Negative: contract changes are slower — two approvals, changelog, golden
  updates — which is accepted as the cost of "protocol over application".
