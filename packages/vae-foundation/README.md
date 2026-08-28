# vae-foundation (L0)

Owns the substrate primitives every other `vae-*` unit is built on. Knows **nothing** about the layers above (layerlint L0 rule, D6.4).

## Ownership

| Concern | Law | Where |
|---|---|---|
| Envelope v1 contract (one shape, three renderings) | D3.7, Article IX | `src/envelope.ts` |
| Exit-code alphabet `0/2/3/4/5` | Part IV, D18.6 | `src/exit-codes.ts` |
| Error object + `E####` catalog seed | D3.8, D17.6, Appendix A | `src/errors.ts`, `src/error-catalog.ts` |
| ULID identity (deterministic, monotonic) | D11.2 | `src/ulid.ts` |
| Clock abstraction (determinism boundary) | D11.4 | `src/clock.ts` |
| Canonical JSON (stable serialization) | D11.4, D12.1 | `src/canonical.ts` |
| blake3 hashing | D12.1, D8.2 | `src/hash.ts` |
| Redaction at the publication boundary | D9.4, D12.3 | `src/redact.ts` |
| Receipt contract (what changed · cost · undo · record) | Sacred Invariant V, D3.3 | `src/receipt.ts` |
| Principals and causes (attribution) | D9.3, Article II | `src/principal.ts` |
| Money as decimal strings, never floats | D8.3 | `src/money.ts` |

## Implementation status (honest inventory)

- IMPLEMENTED: everything listed above, with tests.
- The `E####` catalog data is the **seed** set; `spec/errors.yaml` is its source of truth and a contract test (`fixtures/contract`) fails on drift between the two (codegen arrives with the contract pipeline, see `docs/roadmap-status.md`).
