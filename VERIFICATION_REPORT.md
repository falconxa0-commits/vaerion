# VERIFICATION_REPORT — Vaerion MS-0/MS-1

| | |
|---|---|
| **Date** | 2026-08-29 |
| **Command** | `bun run tools/verify.ts` |
| **Result** | **ALL GATES GREEN** |

---

## 1. Gate results (final run)

| Gate | Status | Detail |
|---|---|---|
| typecheck-engine | ✅ GREEN | `tsc --strict` (plus `noUncheckedIndexedAccess`) over 51 engine files + tests. |
| typecheck-sdk | ✅ GREEN | `tsc --strict` over `@vaerion/sdk`. |
| tests | ✅ GREEN | **83 tests, 795 expectations, 0 failures** across 7 suites. |
| layerlint | ✅ GREEN | 51 files, **173 runtime edges** checked against the L0–L4 matrix (42 type-only imports exempted by the documented rule). |
| constitutional-check | ✅ GREEN | 6 invariant checks; error catalog (34 codes) and event registry (22 types) verified **in sync** with `spec/`; zero secret findings; zero placeholder debt. |
| repo-lint | ✅ GREEN | ESLint over the full repository. |

Machine-readable record: `.vaerion-verification.json`.

## 2. Test inventory

| Suite | File | Covers |
|---|---|---|
| engine-core (unit) | `tests/unit/engine-core.test.ts` | canonical JSON laws, ULID spec vectors + monotonic uniqueness, blake3 official vectors, redaction determinism, envelope attribution law + codec + forward-compat, spine ordering + filters, fail-closed policy law, scope matching, permission-graph narrowing, audit verify. |
| research (unit) | `tests/unit/research.test.ts` | fingerprints, fencing/truncation safety (surrogate-boundary), declared-capability law (E1403/E1402), BM25 determinism, source scoring exactness, stable citations, context budget + E1401 trusted-evidence refusal, replay fold purity. |
| journal lifecycle (integration) | `tests/integration/journal-lifecycle.test.ts` | header/origin, gapless writer-allocated seq, seq pre-assignment refusal, blob CAS roundtrip, decide→journal→act (allow + denial journaling), durable gate open/resolve/double-resolve refusal, snapshot accelerator equality, terminal receipt, deterministic restore, redacted export verification, append-after-close refusal, single-writer lock enforcement. |
| research × journal (integration) | `tests/integration/research-journal.test.ts` | full constitutional research flow over a real journal: declared capability → fetch → fence → blob → evidence → index → citations → context pack → close → verify → replay-equals-live-state; attribution law on every research event. |
| sdk parity (integration) | `tests/integration/sdk-parity.test.ts` | Sacred Invariant #7: SDK ⇄ CLI agreement on run ids, verification, receipts, state restoration, redacted exports. |
| chaos | `tests/chaos/chaos.test.ts` | 12 randomized torn-tail crash points → recover → chain green → replay-equality; partial-line tails; mid-file tamper detection (E1001) + recovery refusal; seq-gap detection (E1005); stale-lock clearing; live-lock blocking (E1000); snapshot vs genesis replay equality. |
| golden | `tests/golden/golden.test.ts` | Byte-stable envelope encoding, byte-stable blake3 journal chain (fixed seed/clock), deterministic redaction output, receipt shape. Regeneration only via explicit `VAE_BLESS=1` (governance per Stage 20 §12.5). |

## 3. Defects found by verification and fixed (no gate was weakened)

1. **ULID randomness packing violated the spec** (6 bits/char instead of Crockford base32's 5) — self-consistent under roundtrip but non-injective, causing id collisions under monotonic increment. Fixed, then **externally validated** against the reference `ulid` implementation (timestamp decode matches: `01ARZ3NDEKTSV4RRFFQ69G5FAV → 1469922850259`).
2. **CRN regex dropped glyphs** (`VZ` instead of `V-Z`): `journal ls` silently returned nothing for valid run ids — a P9 (no silent loss) violation caught by the CLI smoke test. Fixed with a full-alphabet pattern shared across the codebase.
3. **Gate idempotency was enforced in-memory only** — a second `resolveGate` after a restart would have double-journaled a resolution. Now seeded from the restored journal and enforced across restarts (E1303).
4. **Snapshot acceleration trusted caller state** — a stale bag could diverge replay from truth. The harness now folds the authoritative state itself; snapshots are validated before use and unvalidated snapshots are transparent, never fatal.
5. **Redacted exports carried the source `hash` field into the re-chain input**, breaking export self-verification. Fixed; exports now verify under the same law as journals.

## 4. Push-verification checklist (12-point, per mission law)

| # | Check | Status |
|---|---|---|
| 1 | Repository structure matches Stage 6 | ✅ |
| 2 | Build system consistent (bun workspaces, per-package tsconfig) | ✅ |
| 3 | Dependency completeness (lockfile updated; no unused deps in engine) | ✅ |
| 4 | Formatting consistent | ✅ |
| 5 | Lint clean (ESLint, repo-wide) | ✅ |
| 6 | Type check strict and green (engine + SDK) | ✅ |
| 7 | Unit + integration + chaos + golden tests green (83) | ✅ |
| 8 | Architecture boundary check green (layerlint) | ✅ |
| 9 | Constitutional alignment green (6 checks) | ✅ |
| 10 | No secrets exposed (C5 scan clean; the session token is used only transiently for push and is never committed) | ✅ |
| 11 | No unexpected telemetry (C1 network ban; C6 config guard) | ✅ |
| 12 | No forbidden shortcuts (C3 placeholder scan; every defect above fixed at the root) | ✅ |

## 5. Known limitations (stated honestly)

- Substrate is TypeScript on Bun; performance budgets (binary size, cold start) from the blueprint are **not** claimed — ADR-0018 is Proposed pending Founder ratification.
- Coverage tooling (line-percentage floors, OBJ-Q6) is not yet wired; the test pyramid is invested per Stage 20 but coverage numbers are not asserted yet.
- The daemon transport of the SDK is intentionally unimplemented (MS-5).
