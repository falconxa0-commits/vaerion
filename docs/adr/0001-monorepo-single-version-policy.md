# ADR-0001: Monorepo + workspace single-version policy

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

The Vaerion engine is composed of many tightly coupled units: the foundation
(config, envelope, errors, ids), L1 primitives (store, broker, tools, gateway),
L2 domain services, the public API, the CLI, and the SDKs. These units evolve
together because they share the contracts in `spec/` and the invariants of the
constitution. Distributing them across separate repositories would force
explicit cross-repo version negotiation on every change, and version skew
between, say, the journal writer and the receipt generator would be a
determinism hazard rather than a mere inconvenience.

A monorepo without version discipline, however, breeds its own disease:
per-package versions drift, changelogs diverge, and "which combination is
tested?" becomes unanswerable.

## Decision

1. The engine lives in a single repository with a workspace manifest that
   governs all engine packages. Dependency resolution is workspace-internal;
   engine packages always consume each other at the workspace version.
2. All engine packages carry one version number and are released in lockstep.
   There are no independent release trains for engine packages in v0.1.
3. Contract artifacts under `spec/` (schemas, event registry, error catalog,
   config schema) are versioned as contracts (see ADR-0002, ADR-0003) but are
   distributed with the same lockstep binary/package releases; their
   independent version numbers track additive contract evolution, not
   independent shipping.
4. Structure is protected: a new subsystem package requires a registered ADR
   updating the ownership table; generated artifacts are derived, never
   hand-edited.

## Consequences

- Positive: one commit can move a contract, its runtime mirror, and its
  consumers atomically; CI tests the exact combination users receive; the
  layer model is enforceable by a single lint gate.
- Positive: users reason about one version ("the engine is at X"), which keeps
  support and verification reports honest.
- Negative: a fix to one small package forces a full-engine release; release
  notes must therefore be well-structured per package.
- Negative: the repository is the concurrency bottleneck; large refactors need
  coordination rather than forks.
- Neutral: user projects are still free to consume only the SDK packages; the
  policy governs how we build, not what users may install.
