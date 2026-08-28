# Roadmap Status — MS-0

Register form of Stage 22 / Part VIII. Deferrals are **law-visible,
never silent** (D22.4).

## MS-0 — Skeleton and Law-in-Repo

**Constitutional definition (Stage 22):** Monorepo per Stage 6; crates
scaffolded with the `vae-` prefix (D6.2); `CONSTITUTION.md`, `spec/`
with the daylight rule, layerlint L0–L4 live; envelope, exit codes, and
error-catalog schema ratified as fixtures. *Acceptance:* layerlint and
fixture CI green on an empty-but-lawful repository; the CI gates of
D20.8 operational minus journeys.

### Delivered

| Item | Law | State |
|---|---|---|
| Single-version monorepo | D6.1 | ✅ root `package.json` version governs all units |
| Fourteen `vae-*` units with ratified ownership | D6.2 | ✅ `packages/vae-*` × 14 (see `docs/architecture.md`) |
| `CONSTITUTION.md` in-repo | D4.7 | ✅ repository root |
| `spec/` with the daylight rule | D6.3 | ✅ `spec/README.md` + 10 contracts |
| layerlint L0–L4 live | D6.4, D20.9 | ✅ `tools/layerlint.ts`, GREEN, blocking |
| Envelope fixtures | D20.2, D3.7 | ✅ `fixtures/envelope/` + schema + engine guard (E5002) |
| Exit-code alphabet fixtures/law | Part IV, D18.6 | ✅ `spec/exit-codes.md` + enforcement in CLI suite |
| Error-catalog schema + seed | D3.8, Appendix A | ✅ 32 E-codes in `spec/errors.yaml`; embedded catalog contract-tested |
| D20.8 CI gates minus journeys | D20.8 | ✅ `.github/workflows/ci.yml`: constitution, layerlint, typecheck, unit+property tests, fixtures, secrets, telemetry, contract-diff |
| Foundations beyond MS-0 floor | Founder order | ✅ journal chains, broker, tool registry, run executor, daemon, CLI (all real, all tested) |

### Beyond the floor (Founder's 50/50 order)

- **Engine half:** event spine (stateless fan-out, redaction at publish,
  idempotent-consumer containment); journal chains (blake3, tamper
  detection, audit sister chain, resume-from-truth); capability broker
  (pure decision function, fail-closed, deny-beats-allow, audit-failure
  denial, durable park queue, refusal log); tool registry with typed
  contracts; deterministic run executor (single writer, ULID, journaled
  decisions, checkpoints, budget hard stop, partial receipts); config
  system (VaerYaml strict subset, layered resolution with leaf
  provenance, pinned snapshots, drift refusal); domain model (money as
  decimal strings, fingerprint pinning).
- **DX half:** `vae` binary — Daily Seven with Five Guarantees
  conformance suite; loopback daemon with pairing token and runtime
  OpenAPI emission; TypeScript SDK preparation (typed envelope client);
  golden fixture system with bless-as-contract-change; onboarding path;
  spec directory; ADR record.

### Law-visible deferrals (D22.4)

| Deferred | To | Why |
|---|---|---|
| Cross-process single-writer file lock | MS-1 | in-process lock enforced; file lock hardens with spine chaos work |
| Chaos kill-during-append suite | MS-1 (D20.11 scope) | acceptance criterion of MS-1, not MS-0 |
| Redacting exporter + explicit GC | MS-1 | D12.3/D12.5 deliverables of the journal milestone |
| Journeys J1–J10 in blocking CI | MS-5 (D20.4, D5.1) | roadmap places journey CI at MS-5 |
| Model-gateway provider adapters | MS-4 | no path to a model ships before the gateway milestone (D22.2) |
| Indexer implementation (`vae-intel`) | MS-4 | ports + contracts only; nothing pretends to work |
| Extension sandbox runtime | MS-6 | manifests, ranges, lifecycle ship now; wasmtime-class sandbox later |
| .vxn build/sign/verify pipeline | MS-6 (D21.2) | manifest contract + fingerprinting ship now |
| Full SDK conformance suite + Python SDK | MS-5 (D17.2) | typed client preparation ships now |
| Config migrations | first schema change (D19.8) | exactly one schema version exists; nothing to migrate |

### Acceptance status

- layerlint GREEN on the repository (0 violations, 14 units) — **met**.
- Fixture CI green (5 golden fixtures + envelope samples) — **met**.
- D20.8 gates operational minus journeys — **met** in `.github/workflows/ci.yml`.
- 141 tests green, typecheck clean, secrets/telemetry courts green, constitution alignment green.

**MS-0 is ready for Founder review against its acceptance criteria
(D22.4: milestone acceptance is a Class B ratification act recorded in
the Master Ledger).**

## Next milestone

**MS-1 — Spine and Journal.** Gapless per-run sequencing hardened under
chaos kill during append (verifiable chain after SIGKILL), cross-process
writer locks, redacting exporter, explicit reference-aware GC, property
sweep for D20.5 (chain append-only linking, gapless sequencing,
deny-beats-allow permutations, budget conservation).

**Recommended next action:** ratify MS-0, then begin MS-1 with the
chaos suite — it converts the chain discipline from tested to tortured.
