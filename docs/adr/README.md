# ADR Register — Decision Index

Every architectural decision governing Vaerion lives in this directory.
Each record carries exactly one of the following states after the Phase 1
finalization pass (2026-08-30). No decision is left unclear.

- **Ratified** — accepted, implemented, and enforced by the verification
  gates (evidence cited in the record).
- **Provisional** — explicitly provisional, with a recorded migration path;
  finalization is a named human decision, not an engineering assumption.
- **Superseded** — no longer operative; the record states what replaced it.

| ADR | Title | Phase 1 status |
|---|---|---|
| [0001](0001-monorepo-single-version-policy.md) | Monorepo + workspace single-version policy | Ratified — lockstep versioning is the release law |
| [0002](0002-versioned-event-spine-envelope.md) | Versioned event spine envelope | Ratified — registry + golden-enforced envelopes |
| [0003](0003-contract-first-specs-drive-sdk-generation.md) | Contract-first specs drive SDK generation | Ratified — C4 contract-sync gate |
| [0004](0004-centralized-permission-broker.md) | Centralized permission broker | Ratified — fail-closed broker, journaled decisions |
| [0005](0005-tiered-intelligence-progressive-enhancement.md) | Tiered intelligence, progressive enhancement | Ratified |
| [0006](0006-event-sourced-run-journals-checkpoint-chaining.md) | Event-sourced run journals, checkpoint chaining | Ratified — blake3 chain, single writer |
| [0007](0007-strict-subset-yaml-vaeryaml-manifests.md) | Strict-subset YAML (vaerion.yaml) manifests | Ratified — schema-enforced manifests |
| [0008](0008-sqlite-wal-fts5-vec-local-store.md) | SQLite WAL/FTS5 local store | Ratified |
| [0009](0009-wasi-p2-components-capability-broker.md) | WASI P2 components through the capability broker | Ratified — extension kit alpha, WIT world published; native WASI hosting remains on the substrate migration path |
| [0010](0010-loopback-daemon-pairing-token.md) | Loopback daemon with pairing token | Ratified — first-run pairing test-proven |
| [0011](0011-tokio-axum-tower-stack.md) | tokio + axum + tower stack | **Superseded** — by ADR-0018 (substrate) and ADR-0020 (daemon HTTP mechanism); Rust runtime goals remain attached to the ADR-0018 migration path |
| [0012](0012-cassette-mockbrain-hermetic-evals.md) | Cassettes / hermetic evals | Ratified for the contract layer; real provider recordings remain an open item (see `docs/security/RISK-LEDGER.md`) |
| [0013](0013-os-keychain-first-secrets-env-fallback.md) | OS keychain first, env fallback | Ratified — secrets never enter journals or bundles |
| [0014](0014-stable-diagnostics-catalog-ecodes.md) | Stable diagnostics catalog (E-codes) | Ratified — additive codes, never reused |
| [0015](0015-per-platform-exec-sandbox-matrix.md) | Per-platform exec sandbox matrix | Ratified for v0.1 profile; hardening matrix tracked in the risk ledger |
| [0016](0016-reproducible-vxn-bundles.md) | Reproducible `.vxn` bundles | Ratified — byte-identical rebuild test-proven; digest-swap defense enforced |
| [0017](0017-reserved-cloud-seams.md) | Reserved cloud-seam interfaces, intentionally unimplemented in v0.1 | Ratified — seams stay unimplemented; C1/C7 fail the run if transport appears without a superseding ADR |
| [0018](0018-engine-substrate-typescript-bun.md) | Engine substrate: TypeScript on Bun | **Provisional** — pending Founder ratification; explicit migration path recorded in the ADR |
| [0019](0019-single-sanctioned-gateway-egress.md) | Single sanctioned gateway transport egress | Ratified — C7 proves the single egress site |
| [0020](0020-daemon-http-stack-ts-substrate.md) | Daemon HTTP stack on the TypeScript substrate | Ratified — loopback-only binding, pairing token, single wire-client site |

## Shipping-impact summary (Phase 1 directive)

- **Substrate (ADR-0018):** provisional with a recorded migration path —
  ratification is the Founder's decision and has not been exercised.
- **Transport/security (ADR-0019, ADR-0020):** ratified; enforced by the
  constitutional egress-confinement check on every verification run.
- **Packaging (ADR-0016):** ratified; reproducibility is test-proven and the
  verify command is a pure check.
