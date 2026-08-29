# VERIFICATION_REPORT — Vaerion MS-0/MS-1/MS-2

| | |
|---|---|
| **Date** | 2026-08-29 |
| **Command** | `bun run tools/verify.ts` |
| **Result** | **ALL GATES GREEN** |

---

## 1. Gate results (final run)

| Gate | Status | Detail |
|---|---|---|
| typecheck-engine | ✅ GREEN | `tsc --strict` (plus `noUncheckedIndexedAccess`) over 54 engine files + tests. |
| typecheck-sdk | ✅ GREEN | `tsc --strict` over `@vaerion/sdk`. |
| tests | ✅ GREEN | **114 tests, 951 expectations, 0 failures** across 10 suites — run with `--coverage`; **coverage floors enforced** (OBJ-Q6): 80.63% lines / 87.43% branches against `bunfig.toml` thresholds (lines ≥ 0.78, functions ≥ 0.72, statements ≥ 0.78). |
| layerlint | ✅ GREEN | 54 files, 180+ runtime edges checked against the L0–L4 matrix (type-only imports exempt by the documented rule). The new `broker/engine.ts` + `broker/refusal-log.ts` sit at L1 and respect every forbidden pair. |
| constitutional-check | ✅ GREEN | 6 invariant checks; error catalog (34 codes) and event registry (**23** types) verified in sync with `spec/`; zero secret findings; zero placeholder debt. |
| repo-lint | ✅ GREEN | ESLint over the full repository. |

Machine-readable record: `.vaerion-verification.json`.

## 2. Test inventory

| Suite | File | Covers |
|---|---|---|
| engine-core (unit) | `tests/unit/engine-core.test.ts` | canonical JSON laws, ULID spec vectors, blake3 vectors, redaction, envelope attribution + codec, spine ordering, fail-closed policy law, scope matching, graph narrowing, audit verify. |
| broker engine (unit) — **NEW** | `tests/unit/broker-engine.test.ts` | `BrokerEngine` three-layer evaluation (shape fail-closed E1301 → ceiling E1300 → policy first-match), `graphCovers` scope patterns, `graphFromConfig` ceilings (declared-domain grants must sit inside; undeclared domains follow the human's declaration), config `policy.rules[]` validation + precedence, RefusalLogWriter chain + cross-session chaining + tamper evidence + E1304 law, `renderUnified` determinism. |
| spine persistence (unit) — **NEW** | `tests/unit/spine-persistence.test.ts` | `SpinePersistence.subscribeFromCursor`: journal-order backfill after the cursor, filters in both backfill and live phases, async handlers strictly sequential. |
| research (unit) | `tests/unit/research.test.ts` | fingerprints, fencing/truncation safety, declared-capability law, BM25 determinism (LocalIndex), source scoring, citations, context budget, replay fold purity — **plus evidence verification (NEW): green-path triangulation, E1007 missing blob, E1008 digest mismatch, fingerprint-lie E1600, excerpt-escape E1401.** |
| journal lifecycle (integration) | `tests/integration/journal-lifecycle.test.ts` | header/origin, gapless seq, blob CAS roundtrip, decide→journal→act (allow + denial), durable gate open/resolve/double-resolve refusal, snapshot equality, terminal receipt, deterministic restore, redacted export, append-after-close refusal, single-writer lock. |
| research × journal (integration) | `tests/integration/research-journal.test.ts` | full constitutional research flow over a real journal; replay-equals-live-state; attribution law. |
| broker gates (integration) — **NEW** | `tests/integration/broker-gates.test.ts` | deny → journaled + audited + refused; prompt → durable gate (run NOT closed) → approved resolution records elevation (audit + `broker.elevation.recorded`); denied resolution records NO elevation; CLI parity: config policy deny → exit 3 + refusal + `explain` surfaces it; config policy prompt → run pauses exit 0 → `resume` renders the review (awaiting, gate, decision, hint) → `--answer` resolves with elevation + receipt; denied answer exits 3. |
| sdk parity (integration) | `tests/integration/sdk-parity.test.ts` | Sacred Invariant #7 — now including the MS-2 broker surface: `refusals()`, `verifyRefusals()`, `verifyRunEvidence()` (triangulation over a real run), `verifyAudit()`, CLI↔SDK refusal agreement. |
| chaos | `tests/chaos/chaos.test.ts` | 12 randomized torn-tail crash points → recover → chain green → replay-equality; mid-file tamper detection + recovery refusal; seq-gap detection; stale/live locks; snapshot vs genesis replay equality. |
| golden | `tests/golden/golden.test.ts` | Byte-stable envelope encoding, blake3 journal chain, deterministic redaction, receipt shape — **plus the refusal log chain over a fixed seed (new blessed `refusal.golden.json`; regenerates only via `VAE_BLESS=1`)**. |

## 3. Defects found by verification and fixed (no gate was weakened)

Session defects (MS-2 build):

1. **Missing `research/local-index.ts` module** — the repository's recorded-green state was stale: two call sites imported a module that did not exist (3 tests erroring at import). Rebuilt against the test-pinned contract; suite restored to green before any new work began.
2. **Broker request scope was a comma-joined string** while ceiling grants held individual paths — ceiling matching could never succeed (`vae run demo` denied everything as E1300). Fixed at the root: **one decision per source**, the narrowest grant the broker can give, with refusals that name the exact refused path.
3. **`graphFromConfig` treated an undeclared domain as a ceiling violation** — the human typing `--sources` on the command line IS an authority moment (D-H). Corrected law: declared domains enforce strict subset (E1300 on exceed); undeclared domains follow the human's explicit declaration.
4. **`verifyEvidence` relabeled the store's E1008 as E1600** — blurring the `Fix:` contract. Store diagnostics now pass through untouched.
5. **`vae run` journaled only a SUMMARY for `research.evidence.recorded`** — research state was not restorable by folding the journal (R-RT2 violation; the replay reducer requires the full record). The CLI now journals the full evidence record.
6. **`vae run` closed runs on prompt decisions** — a run awaiting human authority must NOT be sealed (gates survive process death, R-A4). Prompt now pauses (lock released, no receipt), `resume` resolves and closes.
7. **Journaled decisions carried no `action` payload** despite the contract comment requiring redacted actions — added (redacted via `redactDeep`, spec-mirrored, changelogged).
8. **Test-only**: `runCli` returns `{code}` (not a number) — test assertions corrected; shared-seed id generators caused cross-test audit-ref collisions — per-run seeds.

Prior-session defects (unchanged, listed for the record): ULID packing, CRN regex, gate idempotency across restarts, snapshot trust, export re-chain.

## 4. Push-verification checklist (12-point, per mission law)

| # | Check | Status |
|---|---|---|
| 1 | Repository structure matches Stage 6 | ✅ |
| 2 | Build system consistent (bun workspaces, per-package tsconfig) | ✅ |
| 3 | Dependency completeness (`@types/node` restored to root; lockfile updated; no unused engine deps) | ✅ |
| 4 | Formatting consistent | ✅ |
| 5 | Lint clean (ESLint, repo-wide) | ✅ |
| 6 | Type check strict and green (engine + SDK) | ✅ |
| 7 | Unit + integration + chaos + golden tests green (114) with coverage floors | ✅ |
| 8 | Architecture boundary check green (layerlint) | ✅ |
| 9 | Constitutional alignment green (6 checks, spec ⇄ code in sync) | ✅ |
| 10 | No secrets exposed (C5 scan clean; push credentials used only transiently, never committed) | ✅ |
| 11 | No unexpected telemetry (C1 network ban; C6 config guard) | ✅ |
| 12 | No forbidden shortcuts (C3 placeholder scan; every defect above fixed at the root) | ✅ |

## 5. Known limitations (stated honestly)

- Substrate is TypeScript on Bun; blueprint performance budgets (binary size, cold start) are **not** claimed — ADR-0018 is Proposed pending Founder ratification.
- Coverage floors are measured, not aspirational: they pin the current state (80.63/87.43) and are meant to be ratcheted, per-module floors are not yet asserted (bun thresholds are total-based).
- The daemon transport of the SDK is intentionally unimplemented (MS-5).
- Gate resolution after restore runs policy-only (the standing permission graph is not rebuilt on `resume`); gate resolution itself makes no further broker decisions, and the elevation is journaled — noted for MS-3 review.
