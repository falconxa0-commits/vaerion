# Vaerion — Roadmap Progress

> **GENERATED** by `tools/status.ts` from the measured status of record — never hand-edited
> (constitution v1.7 — the generator itself was ratified by the generated-roadmap law,
> v1.6 A6 Phase 11: the roadmap report of record comes from the ONE measured status source).
> Regenerate with `bun tools/status.ts`; hand edits are defects.

- Engine version of record: `0.1.11-rc1`
- Constitution of record: `v1.7` (Amendment Log §11)
- Verification record: GREEN — 8/8 gates ok (`.vaerion-verification.json`)
- Measured tests: 480 pass · 0 fail · 2888 expectations · 37 files
- Coverage floors: bunfig.toml coverageThreshold (OBJ-Q6, ratcheted at MS-6 bundle close: 0.86/0.74/0.86/0.90; held at every ASCENSION phase close)

## Milestone board (§7)

| MS | Name | Status | Progress |
|---|---|---|---|
| MS-0 | Skeleton and Law-in-Repo | complete | 100% |
| MS-1 | Runtime Spine | complete | 100% |
| MS-2 | Permission Broker | complete | 100% |
| MS-3 | Model Gateway | complete | 100% |
| MS-4 | Intelligence + Agents | complete | 100% |
| MS-5 | Surfaces | complete | 100% |
| MS-6 | Packaging + Hardening | complete | 100% |
| GA | General Availability | pending | 95% |

## Phase ledger (D-T — the constitution of record)

| Phase | Era | Status |
|---|---|---|
| Ω + artifacts | PHASE Ω | ✅ complete |
| 0 | ASCENSION XVIII | ✅ complete |
| 1 | ASCENSION XVIII | ✅ complete |
| 8 | ASCENSION XVIII | ✅ complete |
| 2 | ASCENSION XVIII | ✅ complete |
| 3 | ASCENSION XVIII | ✅ complete |
| 4 | ASCENSION XVIII | ✅ complete |
| 5 | ASCENSION XVIII | ✅ complete |
| 6 | ASCENSION XVIII | ✅ complete |
| 7 | ASCENSION XVIII | ✅ complete |
| 8 | ASCENSION XVIII | ✅ complete |
| 9 | ASCENSION XVIII | ✅ complete |
| 10 | ASCENSION XVIII | ✅ complete |
| 11 | ASCENSION XIX | ✅ complete |
| 12 | ASCENSION XIX | ✅ complete |
| 13 | ASCENSION XIX | ✅ complete |
| 14 | ASCENSION XIX | ✅ complete |
| 15 | MASTER DIRECTIVE | ✅ complete |

## Recommended next work (priority order)

1. No campaign is in flight: the D-T ledger records MASTER DIRECTIVE complete through Phase 15 (evidence of record in the constitution's §11 Amendment Log); the next program awaits Founder ratification (P4).
2. GA remains rehearsed and PENDING FOUNDER GO (P4); the Founder gates (F-2 legal name, F-3 key ceremony, F-4 substrate ratification, F-5 publish, F-6 real-provider cassettes) are the remaining path to full GA.
3. MS-6 leftovers: native single-binary installers (host-gated: brew/winget/dmg/rpm authored in Phase 1, awaiting their platforms); the daemon packages route group (wire parity, spec/openapi regen).
4. Release train steps (publish, announce, key ceremony) — Founder-gated; artifacts are reproducible via tools/dist-pack.ts at the release tag.
5. Coverage: per-module ratchets on top of the total-based floors (mechanical follow-up).

## Technical risks (top)

1. Substrate: TypeScript-on-Bun reference implementation is explicitly PROVISIONAL (ADR-0018, Phase 1 finalization) with a recorded migration path; Founder ratification pending.
2. Release signing uses the bootstrap Ed25519 key; rotation to a held-offline key is Founder-gated (docs/security/RISK-LEDGER.md R-2).
3. Exec-sandbox hardening matrix (ADR-0015 full profiles) and per-run token scoping are open engineering items (RISK-LEDGER R-1/R-5).
4. Journal per-record fsync trades durability for throughput; batching decision needed before agent-scale testing.
5. Provider price table is build-time data (2026-08); provider drift is a data update with a reviewed contract change.
6. ModelPlanner success path needs a recorded real-provider cassette for end-to-end golden coverage (environment has no provider network access).
7. zstd byte-determinism holds for the pinned level (19) on the current toolchain; a toolchain bump could change bytes — the format version in the magic is the escape hatch (never a silent rebuild).
8. Per-process breaker state is deliberately not journaled (the failures are); multi-process sharing is a daemon concern needing an ADR.
9. Coverage floors are total-based; per-module ratchets are mechanical follow-up, and totals only move up.

---

*Progress measured, not narrated: every line traces to `tools/status.ts` inputs — `.vaerion-verification.json`, the milestone board of record, and the D-T phase ledger in the constitution of record. Generated, never narrated.*
