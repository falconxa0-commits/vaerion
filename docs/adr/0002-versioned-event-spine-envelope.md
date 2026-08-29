# ADR-0002: Versioned event-spine envelope; additive-only evolution

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

Every surface of the engine — CLI renderers, journal, replay, receipts, HTTP
streams, SDK iterators, eval harnesses — is a projection of one ordered event
spine (constitution, Sacred Invariant 1). That makes the envelope the single
most widely consumed contract in the system. Any breaking change to its shape
would cascade into every surface at once and would invalidate existing
journals, which are durable user data.

Attribution is non-negotiable: every event must say who caused it (actor) and
why it exists (cause). Ordering must be trustworthy: consumers replay journals
and resume from cursors, so per-run sequence numbers must be gapless,
monotonic, and 1-based, allocated by the run's single journal writer — never
chosen at call sites.

## Decision

1. The envelope is versioned (`v`) and normatively specified in
   `spec/schemas/envelope.schema.json` (currently v1).
2. Envelope v1 carries exactly: `v`, `type`, `seq`, `ts` (RFC3339 UTC with
   millisecond precision), `trace_id`, `span_id`, `actor {kind, id}`,
   `cause {kind, ref}`, and `payload`. All fields are required; unknown
   fields are rejected; `actor` and `cause` are never optional (nothing
   happens without a who and a why).
3. Evolution within v1 is additive-only: new optional fields and new
   registered event types may be added; existing fields may not be removed or
   re-typed. Removal requires a major envelope version.
4. Event types are registered in `spec/events/registry.json` before they can
   be emitted (no ambient events). At read time, unknown types are forwarded
   untouched by intermediaries (forward-compat duty).
5. `seq` is allocated exclusively by the run's single journal writer.

## Consequences

- Positive: journals, streams, and SDKs can be built once against a stable
  shape; old journals remain readable by newer engines within v1.
- Positive: forward-compat duty lets mixed-version components interoperate on
  one spine without tearing.
- Negative: fixing a mistake in the v1 shape is slow — it requires
  deprecation windows and, ultimately, a new major version with projection
  adapters.
- Negative: the registry gate adds ceremony to introducing new event types;
  this is accepted as the price of "no ambient events".
