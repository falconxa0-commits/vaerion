# spec/ — Versioned Contracts (the courtroom with daylight)

`spec/` is the single source of truth for Vaerion's public contracts
(D6.3, Stage 17). The specification — not the implementation — is the
law: an implementation that diverges from the specification is
non-conforming (D17.1).

## The daylight rule (D6.3)

Every change to this directory requires **two approvers**. Nothing
merges in the dark. Golden fixtures generated from these contracts are
binding precedent (D4.3, D20.2): a fixture change is a contract change,
reviewed as such, never as test maintenance.

## Contract index

| Contract | Path | Governs |
|---|---|---|
| Error catalog | `errors.yaml` | The E#### codes, classes, messages, `Fix:` lines (D3.8, D17.6) |
| Exit-code alphabet | `exit-codes.md` | `0/2/3/4/5` semantics (Part IV, D18.6) |
| Event-type registry | `events.md` | Envelope `type` values, additive-only (D3.7, Article IX) |
| Journal format | `journal-format.md` | NDJSON entry v1, blake3 chain (D12.1, D12.2) |
| Envelope schema | `schemas/envelope.schema.json` | The one canonical envelope (D3.7) |
| Receipt schema | `schemas/receipt.schema.json` | What changed · cost · undo · record (Sacred Invariant V) |
| Run-plan schema | `schemas/run-plan.schema.json` | Declared run plans (Stage 11, E1008) |
| Config schema | `schemas/vaerion-yaml.schema.json` | `vaerion.yaml` (D19.1–D19.9) |
| Extension manifest | `schemas/extension-manifest.schema.json` | Extension declarations (D15.1, D15.4) |
| OpenAPI | `openapi.json` | The local daemon API (D17.1) — regenerate via `bun tools/emit-openapi.ts` |

## Machine enforcement

- `bun run constitution` — checks the repo inhabits the law.
- `bun run fixtures` — golden fixture conformance (binding precedent).
- `bun run layerlint` — L0–L4 boundary law (D6.4).
- The catalog contract test (`packages/vae-foundation/test/catalog-contract.test.ts`)
  fails on any drift between `errors.yaml` and the engine's embedded catalog.
