# ROADMAP_PROGRESS — Vaerion

| | |
|---|---|
| **Date** | 2026-08-29 |
| **Overall progress** | **40%** of the milestone arc (MS-0 → GA) — up from 31% at MS-1 close |
| **Verification** | ALL GATES GREEN (`VERIFICATION_REPORT.md`) — 114 tests / 951 expectations / coverage floors wired |

---

## Milestone board

| MS | Name | Status | Progress | Evidence / remaining |
|---|---|---|---|---|
| MS-0 | Skeleton and Law-in-Repo | ✅ **complete** | 100% | Constitution materialized; spec/ contracts; ADR archive 0001–0018; verification infrastructure; zero placeholder files. |
| MS-1 | Runtime Spine | ✅ **complete** | 100% | Event Spine; NDJSON+blake3 journal with verify/replay/recovery/redacted-export; single-writer law; blob CAS; receipts; chaos suite green; research subsystem; CLI Daily Seven; TS SDK parity. |
| MS-2 | Permission Broker | ✅ **complete** | 100% | BrokerEngine (shape → ceiling → policy, fail-closed at every layer); permission-graph ceiling from `vaerion.yaml` (`graphFromConfig`/`graphCovers`); per-source decisions; redacted `action` on journaled decisions; durable gates with `decision_id` links (runs pause, never auto-close); elevation flow (audit `elevation` + `broker.elevation.recorded`); hash-chained **Refusal Log** (write/verify/read; golden-pinned; surfaced in `explain` + `doctor` + SDK); policy files (`policy.rules[]`, validated); human review loop (`resume` renders review; `--answer` resolves; denied = exit 3); review-diff rendering; research evidence triangulation; spec 0.1.1 additive evolution. |
| MS-3 | Model Gateway | ⏳ pending | 0% | Provider adapters, streaming normalization, metering, secrets protocol (ADR-0013), redaction property proofs. Enters through the broker's `model.invoke` domain. Blocked only by ADR-0018 substrate ratification for shipping goals. |
| MS-4 | Intelligence + Agents | ⏳ pending | 5% | Research index/context packs/evidence triangulation prefigure intel/context; agent executor, workflow DAGs, eval harness not started. |
| MS-5 | Surfaces | ⏳ pending | 12% | CLI Daily Seven operational **with the broker review loop**; SDK in-process **with broker surface**. Remaining: daemon (ADR-0010), HTTP/SSE transport, SDK parity over the wire, extension kit. |
| MS-6 | Packaging + Hardening | ⏳ pending | 0% | `.vxn` reproducible bundles (ADR-0016), installers, docs sweep. |
| GA | General Availability | ⏳ pending | 0% | Burndown + rehearsal. |

## Estimated completion (engineering estimate, not a promise)

- **MS-3**: one focused cycle — the broker already owns `model.invoke`; gateway work is adapters + metering + the secrets protocol behind existing law.
- **MS-4 → MS-5 → MS-6**: three further cycles to GA per the blueprint's stage ordering.

## Technical risks (top)

1. **Substrate ratification (ADR-0018)** — still Proposed; shipping goals assume Rust. Mitigation: contracts and golden fixtures are byte-stable and substrate-neutral.
2. **Gate restoration context** — `vae resume` currently restores policy-only (the standing permission graph is not rebuilt); gate resolution itself makes no further broker decisions, but MS-3 should ratify whether resume rebuilds ceilings. Mitigation: noted as a known limitation; behavior is journaled and honest.
3. **Journal throughput** — per-record fsync buys durability at a latency cost; fine through MS-3, batching needs a ratified ADR before MS-4 scale. Mitigation: the writer remains the single choke point.
4. **Coverage floors are total-based** — bun thresholds assert repository totals (80.63% lines), not per-module floors; per-module ratchets are mechanical follow-up. Mitigation: floors are wired into the verify gate and can only move up.

## Recommended next work (priority order)

1. **MS-3 Model Gateway** — provider adapters behind `model.invoke` (decide→journal→act for every call), streaming normalization, metering events on the spine, secrets protocol per ADR-0013.
2. **Ratify ADR-0018** (substrate) and re-baseline MS-3 shipping goals.
3. **MS-4 groundwork** — agent executor over journaled decisions; workflow DAGs on the spine; hermetic evals (cassette/MockBrain per ADR-0012).
4. **MS-5 daemon** (ADR-0010) — loopback HTTP/SSE so SDK parity holds over the wire.

---

*Progress measured, not narrated: every number traces to the verification gates or the file inventory in `tools/status.ts` → `site-data/vaerion-status.json`.*
