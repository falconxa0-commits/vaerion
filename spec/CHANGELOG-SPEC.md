# SPEC CHANGELOG

All changes to files under `spec/` are recorded here. Evolution is
additive-only within a major version; removals require a major bump and a
deprecation window. Every entry requires two approvals on the change itself.

## 0.1.0 — 2026-08-29

Initial publication of the contract set. Additive initial release; no prior
versions exist, so nothing is deprecated or removed.

Published contracts:

- `schemas/envelope.schema.json` — event spine envelope, version 1: required
  `v`, `type`, `seq`, `ts` (RFC3339 UTC, millisecond precision), `trace_id`,
  `span_id`, `actor {kind, id}`, `cause {kind, ref}`, `payload`; journal-read
  form requires `seq >= 1`.
- `schemas/journal-record.schema.json` — hash-chained journal record, version
  1: kinds `meta`, `evt`, `decision`, `gate`, `snapshot`, `receipt` over the
  common chain fields `k`, `i`, `prev`, `hash`.
- `events/registry.json` — event type registry, version 1 (envelope v1): the
  initial registered set across run lifecycle, spine/journal, receipts,
  broker, research, tools, and store prefixes. Additive-only going forward.
- `errors.yaml` — diagnostic catalog, version 1: the initial E#### ranges
  (1xxx journal/persistence, 11xx event spine, 12xx configuration, 13xx
  permission broker, 14xx research, 15xx runtime/restore, 16xx
  surface/usage, 19xx internal invariants), each entry carrying `name`,
  `summary`, and `fix`.
- `schemas/vaerion-yaml.schema.json` — configuration schema 0.1
  (`schemaVersion: "0.1"`): strict unknown-key rejection, zero-telemetry
  structure (`telemetry.enabled` const false), declared permission ceilings
  and research capabilities.
- `schemas/capability-declaration.schema.json`,
  `schemas/broker-decision.schema.json`, `schemas/gate.schema.json` —
  broker contracts, version 1 (frozen ahead of the broker engine per
  ADR-0004): declared-before-requested capabilities, fail-closed decisions
  (`allow` / `deny {E1300,E1301}` / `prompt`), and durable human gates.
- `schemas/evidence-record.schema.json` — research evidence record, version
  1: blob-ref-by-reference (`blake3`), fenced excerpts, mandatory provenance.
- `schemas/receipt.schema.json` — run receipt, version 1: journal-derived
  counts, blob refs, and head hash.

Notes:

- Envelope `type` values are constrained by `events/registry.json` at emit
  time; the envelope schema intentionally admits any event type string to
  preserve the read-time forward-compat duty (unknown types are forwarded
  untouched).
- This initial set is the mirror target for the runtime modules verified in
  MS-1; `tools/verify.ts` asserts spec/mirror sync.
