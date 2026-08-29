# Vaerion Contracts — `spec/`

This directory is the **single source of truth** for every wire-level contract
of the Vaerion engine: schemas, the event registry, the error catalog, and the
configuration schema. Runtime code is a *mirror* of what is published here —
never the reverse. Verification asserts that mirrors and specs stay in sync;
where they disagree, this directory is authoritative and the code is a defect.

## Governing rules

1. **Additive-only evolution within a major.** Fields, event types, and error
   codes are added; they are never removed, renumbered, or re-typed inside a
   major version. Removal requires a major version and a deprecation window.
2. **Two-approval change discipline.** Any change to a file in this directory
   requires two approvals on the change, plus an entry in
   `CHANGELOG-SPEC.md`. A spec change without a changelog entry is rejected.
3. **No ambient events, no ambient codes.** Event types must be registered in
   `events/registry.json` before they can be emitted; diagnostics must exist
   in `errors.yaml` before they can be thrown.
4. **Contracts are substrate-neutral.** The schemas below describe wire form,
   not implementation language (see ADR-0018 for the reference substrate).

## Index

| Path | Contract | Version |
|---|---|---|
| `schemas/envelope.schema.json` | Event spine envelope (journal-read form) | v1 |
| `schemas/journal-record.schema.json` | Hash-chained journal record kinds | v1 |
| `schemas/capability-declaration.schema.json` | Broker capability declaration | v1 |
| `schemas/broker-decision.schema.json` | Journaled broker decision record | v1 |
| `schemas/gate.schema.json` | Durable human gate record | v1 |
| `schemas/evidence-record.schema.json` | Research evidence record | v1 |
| `schemas/receipt.schema.json` | Run receipt | v1 |
| `schemas/vaerion-yaml.schema.json` | `vaerion.yaml` configuration | 0.1 |
| `events/registry.json` | Registered event types (envelope v1) | v1 |
| `errors.yaml` | Diagnostic catalog (E####) | v1 |
| `CHANGELOG-SPEC.md` | Contract version history | — |

## Related ADRs

- ADR-0002 — versioned event-spine envelope, additive-only evolution
- ADR-0003 — contract-first specs drive SDK generation (this directory is the
  generation source; two-approval discipline originates there)
- ADR-0007 — VaerYaml strict subset and the config schema
- ADR-0014 — stable diagnostics catalog, remediation-linked
