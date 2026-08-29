# ROADMAP_PROGRESS — Vaerion

| | |
|---|---|
| **Date** | 2026-08-29 |
| **Overall progress** | **31%** of the milestone arc (MS-0 → GA) |
| **Verification** | ALL GATES GREEN (`VERIFICATION_REPORT.md`) |

---

## Milestone board

| MS | Name | Status | Progress | Evidence / remaining |
|---|---|---|---|---|
| MS-0 | Skeleton and Law-in-Repo | ✅ **complete** | 100% | Constitution materialized; spec/ contracts (8 schemas, 34 error codes, 22 event types); ADR archive 0001–0018; verification infrastructure; zero placeholder files. |
| MS-1 | Runtime Spine | ✅ **complete** | 100% | Event Spine; NDJSON+blake3 journal with verify/replay/recovery/redacted-export; single-writer law; blob CAS; receipts; chaos suite green; broker contracts frozen; research subsystem operational; CLI Daily Seven; TS SDK parity. |
| MS-2 | Permission Broker | 🔄 in progress | 35% | Done: policy/decision/gate/graph/review-diff/audit contracts; fail-closed evaluator; audit ledger; durable gates in runs. Remaining: broker engine as a first-class subsystem (elevation flows, refusal-log surface, policy files), human review loop, permission-graph enforcement at runtime. |
| MS-3 | Model Gateway | ⏳ pending | 0% | Provider adapters, streaming normalization, metering, secrets protocol (ADR-0013), redaction property proofs. Blocked on ADR-0018 substrate ratification. |
| MS-4 | Intelligence + Agents | ⏳ pending | 5% | Research index/context packs prefigure intel/context; agent executor, workflow DAGs, eval harness not started. |
| MS-5 | Surfaces | ⏳ pending | 10% | CLI Daily Seven operational; SDK in-process. Remaining: daemon (ADR-0010), HTTP/SSE transport, SDK parity over the wire, extension kit. |
| MS-6 | Packaging + Hardening | ⏳ pending | 0% | `.vxn` reproducible bundles (ADR-0016), installers, docs sweep. |
| GA | General Availability | ⏳ pending | 0% | Burndown + rehearsal. |

## Estimated completion (engineering estimate, not a promise)

- **MS-2**: one focused build cycle — the contracts are frozen and tested; the engine integrates them.
- **MS-3**: one cycle after the substrate decision (gateway is adapter work + metering).
- **MS-4 → MS-5 → MS-6**: three further cycles to GA per the blueprint's stage ordering.

## Technical risks (top)

1. **Substrate ratification (ADR-0018)** — the reference implementation is TypeScript on Bun; shipping goals (static binaries, WASI hosting) assume Rust. Decide before MS-3. Mitigation: contracts are substrate-neutral and golden-pinned.
2. **Broker semantics drift** — MS-2 must integrate the frozen contracts without widening `evaluatePolicy` semantics. Mitigation: contracts are tested; layerlint forbids runtime→contract inversions.
3. **Journal throughput** — per-record fsync buys durability at a latency cost. Fine for local-first MS-1/MS-2; batching needs a ratified decision before MS-4 scale. Mitigation: writer is the single choke point; a batching ADR can land without touching call sites.
4. **Coverage floors not yet wired** — OBJ-Q6 percentage gates are not asserted yet. Mitigation: test pyramid already invested per Stage 20; coverage wiring is mechanical.

## Recommended next work (priority order)

1. **MS-2 broker engine** — first-class subsystem implementing the frozen contracts: elevation flows, refusal-log surface (`vae explain` integration), policy files in `vaerion.yaml` (VaerYaml ceilings → policy contracts), runtime permission-graph enforcement.
2. **Human review loop** — CLI prompt renderer for durable gates + review-diff display (`renderUnified`), so human authority has a first-class surface.
3. **Ratify ADR-0018** (substrate) and re-baseline MS-3+ accordingly.
4. **Coverage wiring** (OBJ-Q6) + journal batching ADR (if MS-4 workloads demand it).

---

*Progress measured, not narrated: every number traces to the verification gates or the file inventory in `tools/status.ts` → `site-data/vaerion-status.json`.*
