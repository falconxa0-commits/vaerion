# ROADMAP_PROGRESS — Vaerion

| | |
|---|---|
| **Date** | 2026-08-29 |
| **Overall progress** | **52%** of the milestone arc (MS-0 → GA) — up from 40% at MS-2 close (measured: milestone board average, `tools/status.ts` → `site-data/vaerion-status.json`) |
| **Verification** | ALL 6 GATES GREEN (`VERIFICATION_REPORT.md`) — 183 tests / 1405 expectations / coverage 83.37% lines · 88.96% branches |

---

## Milestone board

| MS | Name | Status | Progress | Evidence / remaining |
|---|---|---|---|---|
| MS-0 | Skeleton and Law-in-Repo | ✅ **complete** | 100% | Constitution materialized; spec/ contracts; ADR archive (now 0001–0019); verification infrastructure; zero placeholder files. |
| MS-1 | Runtime Spine | ✅ **complete** | 100% | Event Spine; NDJSON+blake3 journal with verify/replay/recovery/redacted-export; single-writer law; blob CAS; receipts; chaos suite green; research subsystem; CLI Daily Seven; TS SDK parity. |
| MS-2 | Permission Broker | ✅ **complete** | 100% | BrokerEngine (shape → ceiling → policy, fail-closed at every layer); permission-graph ceiling from `vaerion.yaml`; per-source decisions; redacted `action` on journaled decisions; durable gates with `decision_id` links (runs pause, never auto-close); elevation flow; hash-chained Refusal Log surfaced in `explain` + `doctor` + SDK; policy files; human review loop; spec 0.1.1. |
| MS-3 | Model Gateway | ✅ **complete** | 100% | `GatewayService` single gate (decide `model.invoke` → journal → act); provider adapters **anthropic / openai / ollama** + **MockBrain** (seeded virtual provider, ADR-0012); normalized `StreamFrame` contract with chunking-invariant SSE + NDJSON parsers; **4 committed cassettes recorded through the real fingerprint pipeline**; retry with deterministic full-jitter backoff (connection establishment only); per-provider circuit breaker (E1705); integer micro-USD pricing + order-free metering fold (R-MG3); budgets pre/post (E1703, loud, spend never hidden); secrets boundary (ADR-0013: names in config, broker-mediated reads, call-time resolution, E1704 name-only); R-MG5 outbound+journal redaction (secret shapes never pass through the gateway at all); CLI `run model` + `explain` metering + `doctor` gateway picture + `dev` matrix; SDK `gatewayInvoke`/`metering`/`gatewayMatrix` parity; spec 0.1.2 (25 event types, 41 codes, gateway/secrets schema); ADR-0019 single sanctioned egress; coverage ratcheted (83.37/88.96). |
| MS-4 | Intelligence + Agents | ⏳ pending | 5% | Research index/context packs/evidence triangulation prefigure intel/context. Remaining: agent executor over journaled decisions, workflow DAGs on the spine, hermetic eval harness (cassette/MockBrain per ADR-0012 — the devices now exist and are proven). |
| MS-5 | Surfaces | ⏳ pending | 12% | CLI Daily Seven fully operational **including the gateway surface**; SDK in-process **including `gatewayInvoke` parity**. Remaining: daemon (ADR-0010), HTTP/SSE transport, SDK parity over the wire, extension kit. |
| MS-6 | Packaging + Hardening | ⏳ pending | 0% | `.vxn` reproducible bundles (ADR-0016), installers, docs sweep. |
| GA | General Availability | ⏳ pending | 0% | Burndown + rehearsal. |

## Estimated completion (engineering estimate, not a promise)

- **MS-4**: one focused cycle — the hardest prerequisites (journaled decisions, cassettes, MockBrain evals, metering) landed with MS-2/MS-3.
- **MS-5 → MS-6**: two further cycles to GA per the blueprint's stage ordering.

## Technical risks (top)

1. **Substrate ratification (ADR-0018)** — still Proposed. Mitigation: contracts and golden fixtures remain byte-stable and substrate-neutral.
2. **Journal throughput** — per-record fsync buys durability at a latency cost; batching needs a ratified ADR before MS-4 scale. Mitigation: the writer remains the single choke point.
3. **Price table drift** — build-time data (2026-08); provider changes are data updates with a reviewed contract change, never code drift.
4. **Per-process breaker state** — deliberately not journaled (the failures are); multi-process sharing is an MS-5 daemon concern and needs an ADR.
5. **Coverage floors are total-based** — per-module ratchets are mechanical follow-up; totals only move up (83.37/88.96 as of MS-3).

## Recommended next work (priority order)

1. **MS-4 agent executor** — journaled agent loop over `model.invoke` (the single gate makes every LLM step authorized + metered by construction); workflow DAGs on the spine; eval harness on cassettes + MockBrain.
2. **Ratify ADR-0018** (substrate) and re-baseline shipping goals.
3. **MS-5 daemon** (ADR-0010) — loopback HTTP/SSE so SDK parity holds over the wire; per-process breaker sharing ADR.
4. **Coverage ratchets per module** — mechanical, keeps the OBJ-Q6 law granular.

---

*Progress measured, not narrated: every number traces to the verification gates or the file inventory in `tools/status.ts` → `site-data/vaerion-status.json`.*
