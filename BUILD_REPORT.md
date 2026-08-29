# BUILD_REPORT — Vaerion MS-0 + MS-1 + MS-2 (Permission Broker)

| | |
|---|---|
| **Milestone** | MS-0 complete · MS-1 complete · **MS-2 (Permission Broker) — complete** |
| **Date** | 2026-08-29 |
| **Substrate** | TypeScript on Bun (ADR-0018, Proposed — pending Founder ratification) |
| **Verification** | ALL GATES GREEN — see `VERIFICATION_REPORT.md` |
| **Overall progress** | **40%** of the MS-0 → GA arc (measured, `tools/status.ts`) |

---

## 1. What was built

### 1.1 Law-in-Repo (MS-0) — complete

| Artifact | Purpose |
|---|---|
| `docs/constitution/VAERION_CONSTITUTION_v1.0.md` | The ratified constitution materialized into the repository: value order (§2), philosophy P1–P11 (§3), nine Sacred Invariants (§4), ratified decision register D-A…D-O (§5), governing stage decisions (§6), milestone law (§7), release blockers (§8), amendment procedure (§9). |
| `docs/adr/0001–0018` | The complete ADR archive: blueprint ADRs 0001–0017 as full records, plus ADR-0018 (engine substrate — **Proposed**, Founder sign-off requested). |
| `spec/` (now 0.1.1) | The versioned contract set: `errors.yaml` (34 codes, synced to the runtime catalog), `events/registry.json` (**23** event types), 8 JSON Schemas, `README.md`, `CHANGELOG-SPEC.md` with a 0.1.1 additive entry. |

### 1.2 Engine Core (`packages/vaerion` — 54 files)

| Layer | Module | What it does |
|---|---|---|
| L0 | `kernel/` | Stable E#### error catalog + `VaerionError` (code + `Fix:` line), spec-compliant ULID/CRN identity (externally validated against the reference `ulid` implementation), clock/RNG ports (System + Fixed/Seeded), canonical JSON (integer-only, byte-stable, hash-safe), deterministic redaction, blake3 hashing. |
| L0 | `config/` | Strict-subset `vaerion.yaml` loader: unknown-key rejection, zero-telemetry as a structural guard, blake3 config fingerprints, **declared broker policy rules** (`policy.rules[]`, validated loudly — MS-2 policy files), fail-closed policy derivation (`policyFromConfig`). |
| L1 | `spine/` | The Event Spine: envelope v1 (actor + cause attribution, per-run seq allocated by the journal writer), event registry (no ambient events), canonical codec, ordered in-process bus with bounded queues (block policy — no silent drops), cursor-based subscription with journal replay (`SpinePersistence`, now directly tested). |
| L1 | `journal/` | Append-only NDJSON journals sealed by a blake3 hash chain; single-writer O_EXCL lock with stale-owner detection; gapless per-run seq; per-append fsync; full verification; torn-tail crash recovery (mid-file corruption refused); replay with snapshot acceleration; redacted exports (independently verifiable); journal inventory. |
| L1 | `store/` | Blob CAS: content-addressed blake3 store, `blob_ref {alg, hash, size}` law, dedupe, digest verification (E1008). |
| L1 | `receipts/` | Receipts computed FROM the journal (never asserted): event/decision/gate/snapshot/blob counts + chain head; terminal record of every closed run. |
| L1 | `broker/contracts/` | The frozen law: principals, capability declarations (fail-closed scope matching), policy contracts (first-match, structural fail-closed), decision records (**now carrying the redacted `action` payload**), durable gate records (**now linked to their prompt decision via `decision_id`**), permission graph with monotonic narrowing, review-diff models + `renderUnified`, broker event payloads (incl. `broker.elevation.recorded`), hash-chained audit writer + ledger verification. |
| L1 | `broker/engine.ts` — **NEW (MS-2)** | The Permission Broker engine as a first-class subsystem: `BrokerEngine.evaluate` (shape fail-closed → permission-graph ceiling → policy first-match, E1301/E1300 layers), `graphCovers` (ceiling coverage), `graphFromConfig` (vaerion.yaml ceilings + explicit human declarations; declared-domain grants must sit INSIDE the ceiling — exceeding is refused E1300; undeclared domains follow the human's declaration). Pure evaluation, no I/O — the harness sequences. |
| L1 | `broker/refusal-log.ts` — **NEW (MS-2)** | The durable **Refusal Log** (`.vaerion/refusals.log`): hash-chained, append-only, same blake3 chain primitive as journal/audit; entries reference the journaled decision (`decision_id`, `run_id`); writer + head-chaining across sessions + loud verifier (tamper, discontinuity, shape) + filtered reader. The broker refuses nothing silently. |
| L2 | `runtime/` | The run harness: composition root wiring spine + journal + broker **engine** + refusal log + receipts; deterministic restoration (state = pure fold; snapshots accelerate, never override); decisions carry redacted `action`; deny → audit + **Refusal Log entry**; prompt → durable gate linked to the decision; **approved gate resolutions record an elevation** (audit `elevation` entry + `broker.elevation.recorded` event); denied resolutions record no elevation; terminal receipts. |
| L2 | `research/` | The research subsystem: declared capabilities (local-only), blake3 document fingerprints, untrusted-content fencing, provenance, evidence records over `blob_ref`s, stable citations, explainable source scoring, deterministic BM25 `LocalIndex` (insertion-stable docs, doc_id tiebreak, journal-safe `IndexedDoc`, replayable via `fromDocs`), budgeted context packs (One Context Path), replay compatibility — **plus evidence verification (`verification.ts`): evidence ↔ blob bytes ↔ fingerprint triangulation with excerpt containment (E1007/E1008/E1401/E1600)**. |
| L4 | `cli/` | The `vae` CLI — Daily Seven with the Five Guarantees. MS-2: `run` decides **per source** (narrowest scope; refusals name the exact path), evaluates config policy first (deny → exit 3, prompt → run pauses with an open gate, exit 0 awaiting), `resume` renders the **human review surface** (gate question, options, linked decision, rendered review diff) before any answer, `explain` surfaces the run's refusals, `doctor` verifies the Refusal Log chain and evidence triangulation. |
| — | `index.ts` | Public API barrel — now exporting `BrokerEngine`, `graphFromConfig`, `graphCovers`, the Refusal Log surface, `policyFromConfig`, and evidence verification. |

### 1.3 SDK + Tooling

| Artifact | Purpose |
|---|---|
| `sdks/typescript` | `@vaerion/sdk` — machine parity, now including the **MS-2 broker surface**: `refusals(runId?)`, `verifyRefusals()`, `verifyRunEvidence(runId)` (triangulation), `verifyAudit()` — parity tested against the CLI. |
| `tools/` | `layerlint.ts`, `constitutional-check.ts`, `verify.ts` (6 gates, **tests gate now enforces coverage floors**), `status.ts` (measured status JSON). |
| `bunfig.toml` — **NEW** | Coverage floors (OBJ-Q6 wired): `lines ≥ 0.78`, `functions ≥ 0.72`, `statements ≥ 0.78`; a breach fails the verify gate. Current: **80.63% lines / 87.43% branches**. |

### 1.4 Spec evolution (0.1.0 → 0.1.1, additive only)

- Event `broker.elevation.recorded` registered (registry stays v1, envelope v1).
- `gate.schema.json` + journal-record `gateRecord`: optional `decision_id` (gate ↔ decision journal link).
- `broker-decision.schema.json`: optional redacted `action` payload.
- `vaerion-yaml.schema.json`: optional top-level `policy.rules[]` block.
- All documented in `spec/CHANGELOG-SPEC.md` §0.1.1; `constitutional-check` verifies runtime mirrors stayed in sync.

---

## 2. Constitutional decisions satisfied (evidence)

| Decision | Where it is enforced |
|---|---|
| D-A broker fail-closed | `evaluatePolicy` denies on no-match; `BrokerEngine` adds a shape layer (un-evaluable ⇒ E1301) and a ceiling layer above policy. Tested at all three layers. |
| D-C per-run seq | `JournalWriter.appendEvent` allocates; call-site seq rejected (tested). |
| D-D actor + cause | Envelope validation requires both (tested). |
| D-E blob_ref | `store/blob-cas.ts`; runs journal refs, never bytes; evidence verification triangulates refs ↔ bytes ↔ fingerprints (tested). |
| D-F journaled decisions | `RunHarness.decide` — journal before act, **including the redacted action payload** (tested). |
| D-G single writer | O_EXCL lock + stale-owner detection (chaos-tested). |
| D-H ULID identity | `kernel/ids.ts` (spec-validated vs reference impl). |
| D-I NDJSON + blake3 | Journal, audit ledger, **and the Refusal Log** share the chain primitive (golden-pinned). |
| D-K zero telemetry | No egress paths (C1); config structural guard (C6). |
| **D-L Refusal Log** | **Now the full artifact**: hash-chained `.vaerion/refusals.log`, written on every deny (explicit E1300 and fail-closed E1301), verified by `doctor`, surfaced by `explain` and the SDK, golden-fixture-pinned. |
| D-M Daily Seven | Exactly the seven commands; broker law surfaced through `run`/`resume`/`explain`/`doctor` — no command sprawl. |
| D-N Five Guarantees | Help-first (updated), `--json`, `--dry-run`, receipts, honest exit codes (3 on deny AND on human gate denial — tested). |
| D-O research constitutional | Declared capabilities, fencing, provenance, One Context Path; full evidence records journaled (R-RT2 restorable). |
| **Human authority (Invariant #9)** | Prompt decisions pause runs (never auto-close), gates render a review before any answer, approvals record elevations, denials are honest exit-3 outcomes — all journaled. |

---

## 3. What was NOT built (by design)

- **Model Gateway** (MS-3): no provider adapters; the seam is referenced (`model.invoke` domain, ADR-0013), not stubbed.
- **Daemon/API** (MS-5): SDK parity is in-process; the wire transport (ADR-0010) is next.
- **Extension host** (MS-5): ADR-0009 scope marks.
- Any placeholder implementation — `C3` constitutional check enforces zero TODO/FIXME/placeholder debt (the empty `refusal.golden.json` left by the previous session was replaced with a real blessed fixture).

---

## 4. Build-order compliance

Construction followed the ratified stage order: contracts → engine → surfaces → verification. MS-2 was implemented **against the frozen contracts without widening any of them** (the only contract changes are the four documented additive 0.1.1 items). No phase was skipped; no invariant was weakened to make a gate pass — every defect verification surfaced was fixed at the root (see `VERIFICATION_REPORT.md` §3).
