# ADR-0011: tokio+axum+tower stack

| | |
|---|---|
| Status | Superseded — by ADR-0018 (substrate) and ADR-0020 (daemon HTTP mechanism on the TypeScript substrate); the Rust runtime goals this record served remain attached to the ADR-0018 migration path |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

The public API daemon (ADR-0010) needs an HTTP stack in the engine's core
language: concurrent request handling, long-lived event streaming (SSE),
middleware composition for auth and redaction, and extractor ergonomics that
map cleanly onto the service traits without leaking domain logic into the
transport layer. The stack must be mature enough to trust with security
middleware.

Scope mark: this decision applies when the daemon lands (MS-5); it is not
exercised in MS-1, whose verification runs in-process without an HTTP
listener. The acceptance here pins the choice so later milestones do not
re-litigate it.

## Decision

1. Async runtime: tokio. Rejected alternatives: thread-per-core stacks —
   ecosystem breadth (axum/hyper), mature debugging and profiling tooling,
   and headroom far beyond local-scale load carried the decision.
2. HTTP framework: axum, with handlers restricted to serde mapping onto
   service traits — no business logic in routes.
3. Middleware: tower layers for authentication (pairing token), redaction,
   and SSE event framing. Redaction middleware runs before publication of
   any gateway-derived event, so nothing unredacted crosses the wire.
4. Streaming: server-sent events with cursor replay, mirroring the journal
   cursor semantics, so a stream consumer and a journal consumer share
   resume behavior.

## Consequences

- Positive: composability of auth/redaction as typed middleware keeps the
  security path reviewable in one place.
- Positive: extractor-based handlers make contract violations a compile-time
  concern rather than a routing-time one.
- Negative: an async runtime is a heavyweight dependency for a binary that
  may spend most of its life as a pure CLI; the runtime is loaded
  lazily-shaped (daemon path only) where practical.
- Negative: framework churn (axum majors) requires pinning discipline in the
  lockfile and contract tests over the wire format, not the framework API.
