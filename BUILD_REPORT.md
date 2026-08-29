# BUILD_REPORT — Vaerion MS-0 Completion + MS-1 Runtime Spine

| | |
|---|---|
| **Milestone** | MS-0 (Skeleton and Law-in-Repo) — complete · MS-1 (Runtime Spine) — complete |
| **Date** | 2026-08-29 |
| **Substrate** | TypeScript on Bun (ADR-0018, Proposed — pending Founder ratification) |
| **Verification** | ALL GATES GREEN — see `VERIFICATION_REPORT.md` |

---

## 1. What was built

### 1.1 Law-in-Repo (MS-0)

| Artifact | Purpose |
|---|---|
| `docs/constitution/VAERION_CONSTITUTION_v1.0.md` | The ratified constitution materialized into the repository: value order (§2), philosophy P1–P11 (§3), nine Sacred Invariants (§4), ratified decision register D-A…D-O (§5), governing stage decisions (§6), milestone law (§7), release blockers (§8), amendment procedure (§9). |
| `docs/adr/0001–0018` | The complete ADR archive: blueprint ADRs 0001–0017 as full records, plus ADR-0018 (engine substrate — **Proposed**, Founder sign-off requested). |
| `spec/` | The versioned contract set: `errors.yaml` (34 codes, synced to the runtime catalog), `events/registry.json` (22 event types), 8 JSON Schemas (envelope, journal-record, capability-declaration, broker-decision, gate, evidence-record, receipt, vaerion-yaml), `README.md`, `CHANGELOG-SPEC.md`. |

### 1.2 Engine Core (`packages/vaerion` — 51 files, ~5,000 lines)

| Layer | Module | What it does |
|---|---|---|
| L0 | `kernel/` | Stable E#### error catalog + `VaerionError` (code + `Fix:` line), spec-compliant ULID/CRN identity (externally validated against the reference `ulid` implementation), clock/RNG ports (System + Fixed/Seeded), canonical JSON (integer-only, byte-stable, hash-safe), deterministic redaction, blake3 hashing. |
| L0 | `config/` | Strict-subset `vaerion.yaml` loader: unknown-key rejection, zero-telemetry as a structural guard (`telemetry.enabled` may only be false), blake3 config fingerprints, default fail-closed policy derivation. |
| L1 | `spine/` | The Event Spine: envelope v1 (actor + cause attribution, per-run seq allocated by the journal writer), event registry (no ambient events), canonical codec, ordered in-process bus with bounded queues (block policy — no silent drops), cursor-based subscription with journal replay. |
| L1 | `journal/` | The durable heart: append-only NDJSON journals sealed by a blake3 hash chain (`hash = blake3(canonical(record sans hash))`, genesis = 64 zeros); single-writer O_EXCL lock with stale-owner detection; gapless per-run seq; per-append fsync; full verification (shape, index, chain, seq); torn-tail crash recovery (truncate + auditable `meta note="recovery"` record, mid-file corruption refused); replay with snapshot acceleration (validated snapshots, never trusted as truth); redacted exports (deterministic, re-chained, independently verifiable, derivation-stamped); journal inventory. |
| L1 | `store/` | Blob CAS: content-addressed blake3 store (`blobs/blake3/xx/yy/<hash>`), `blob_ref {alg, hash, size}` law, dedupe, digest verification (E1008). |
| L1 | `receipts/` | Receipts computed FROM the journal (never asserted): event/decision/gate/snapshot/blob counts + chain head; terminal record of every closed run. |
| L1 | `broker/contracts/` | MS-2 broker law frozen as contracts: principals, capability declarations (fail-closed scope matching), policy contracts (first-match, structural fail-closed), decision records (decide → journal → act), durable gate records (idempotent resolution), permission graph with monotonic-narrowing verification, review-diff models, broker event payloads, hash-chained audit writer + ledger verification. |
| L2 | `runtime/` | The run harness: composition root wiring spine + journal + broker + receipts; deterministic restoration (state = pure fold of the journal; snapshots accelerate, never override); journaled broker decisions; durable gates that survive process death; terminal receipts. |
| L2 | `research/` | The research subsystem as a constitutional subsystem: declared capabilities only (local sources; network structurally absent), document fingerprints (blake3), untrusted-content fencing (`<untrusted src=…>` — the only channel external content travels through), provenance records, evidence records over `blob_ref`s, stable citations, explainable deterministic source scoring, BM25 local index (deterministic ordering), deterministic context preparation with budgets (One Context Path: packs become visible only via the journaled `research.context.prepared`), journal replay compatibility. |
| L4 | `cli/` | The `vae` CLI — Daily Seven (`init, run, resume, explain, journal, doctor, dev`) with the Five Guarantees enforced: help-first parsing, stable `--json` NDJSON, zero-side-effect `--dry-run`, receipts on every run, honest exit codes (0/1/2/3/4/5). |
| — | `index.ts` | Public API barrel — the Open Contracts surface; everything not exported is internal. |

### 1.3 SDK + Tooling

| Artifact | Purpose |
|---|---|
| `sdks/typescript` | `@vaerion/sdk` — `VaeClient` exercising the same engine contracts as the CLI (machine parity, tested in `sdk-parity.test.ts`); in-process transport now, daemon transport (ADR-0010) lands at MS-5 behind the same interface. |
| `tools/` | Verification infrastructure: `layerlint.ts` (architecture boundary matrix, runtime edges with type-only exemptions), `constitutional-check.ts` (6 invariant checks incl. contract sync + secret scan + determinism-port enforcement), `verify.ts` (the 6-gate runner), `status.ts` (measured status JSON). |

---

## 2. Constitutional decisions satisfied (evidence)

| Decision | Where it is enforced |
|---|---|
| D-A broker fail-closed | `evaluatePolicy` denies on no-match (tested); structural fall-through impossible. |
| D-C per-run seq | `JournalWriter.appendEvent` allocates; call-site seq rejected (tested). |
| D-D actor + cause | Envelope validation requires both (tested); unattributed events invalid. |
| D-E blob_ref | `store/blob-cas.ts`; runs journal refs, never bytes (tested). |
| D-F journaled decisions | `RunHarness.decide` — journal before act (tested). |
| D-G single writer | O_EXCL lock + stale-owner detection (chaos-tested). |
| D-H ULID identity | `kernel/ids.ts` (spec-validated vs reference impl). |
| D-I NDJSON + blake3 | `journal/hashchain.ts` (golden-pinned chain). |
| D-K zero telemetry | No egress paths (C1 check); config structural guard (C6). |
| D-L refusal log | Denials journaled + audited (tested). |
| D-M Daily Seven | `cli/commands.ts` — exactly the seven commands. |
| D-N Five Guarantees | Help-first, `--json`, `--dry-run`, receipts, exit codes (tested/smoke-verified). |
| D-O research constitutional | Declared capabilities, fencing, provenance, One Context Path (tested). |

---

## 3. What was NOT built (by design)

- The **broker engine** (MS-2): contracts frozen, engine deliberately not implemented — no fake broker.
- **Model Gateway** (MS-3): no provider adapters exist; the gateway seam is referenced, not stubbed.
- **Daemon/API** (MS-5): the API surface exists as `spec/` + SDK transport interface only.
- **Extension host** (MS-5): ADR-0009 scope marks.
- Any placeholder implementation — `C3` constitutional check enforces zero TODO/FIXME/placeholder debt.

---

## 4. Build-order compliance

Construction followed the ratified 7-phase order: repository skeleton → core contracts/schemas → verification infrastructure → DX foundation (CLI/SDK/spec) → research capability foundation → full verification → publication. No phase was skipped; no invariant was weakened to make a gate pass (four real engine defects were found and fixed by verification — see `VERIFICATION_REPORT.md` §3).
