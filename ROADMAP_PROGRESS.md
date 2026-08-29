# ROADMAP_PROGRESS — Vaerion

| | |
|---|---|
| **Date** | 2026-08-29 |
| **Overall progress** | **64%** of the milestone arc (MS-0 → GA) — up from 52% at MS-3 close (measured: milestone board average, `tools/status.ts` → `site-data/vaerion-status.json`) |
| **Verification** | ALL 6 GATES GREEN (`VERIFICATION_REPORT.md`) — 218 tests / 1563 expectations / coverage 84.62% lines · 89.45% branches |

---

## Milestone board

| MS | Name | Status | Progress | Evidence / remaining |
|---|---|---|---|---|
| MS-0 | Skeleton and Law-in-Repo | ✅ **complete** | 100% | Constitution materialized; spec/ contracts; ADR archive (now 0001–0019); verification infrastructure; zero placeholder files. |
| MS-1 | Runtime Spine | ✅ **complete** | 100% | Event Spine; NDJSON+blake3 journal with verify/replay/recovery/redacted-export; single-writer law; blob CAS; receipts; chaos suite green; research subsystem; CLI Daily Seven; TS SDK parity. |
| MS-2 | Permission Broker | ✅ **complete** | 100% | BrokerEngine (shape → ceiling → policy, fail-closed at every layer); permission-graph ceiling from `vaerion.yaml`; per-source decisions; redacted `action` on journaled decisions; durable gates with `decision_id` links (runs pause, never auto-close); elevation flow; hash-chained Refusal Log surfaced in `explain` + `doctor` + SDK; policy files; human review loop; spec 0.1.1. |
| MS-3 | Model Gateway | ✅ **complete** | 100% | `GatewayService` single gate (decide `model.invoke` → journal → act); provider adapters **anthropic / openai / ollama** + **MockBrain** (seeded virtual provider, ADR-0012); normalized `StreamFrame` contract with chunking-invariant SSE + NDJSON parsers; **4 committed cassettes recorded through the real fingerprint pipeline**; retry with deterministic full-jitter backoff (connection establishment only); per-provider circuit breaker (E1705); integer micro-USD pricing + order-free metering fold (R-MG3); budgets pre/post (E1703, loud, spend never hidden); secrets boundary (ADR-0013: names in config, broker-mediated reads, call-time resolution, E1704 name-only); R-MG5 outbound+journal redaction (secret shapes never pass through the gateway at all); CLI `run model` + `explain` metering + `doctor` gateway picture + `dev` matrix; SDK `gatewayInvoke`/`metering`/`gatewayMatrix` parity; spec 0.1.2 (25 event types, 41 codes, gateway/secrets schema); ADR-0019 single sanctioned egress; coverage ratcheted (83.37/88.96). |
| MS-4 | Intelligence + Agents | ✅ **complete** | 100% | AgentRuntime supervisor loop over journaled decisions (round/index coordinates, bounded retries, fatal broker refusals, gate pauses with durable elevation authority for restart-safe resume, loud E1804 ceiling, honest failure outcomes); InlinePlanner (declared determinism device) + ModelPlanner through the gateway single gate (E1800 plan contract); tool invocation pipeline (declared-before-used E1801, typed args E1802, decide tool.call → journal → act, blake3 result receipts); reasoning sessions (journaled scratchpads, deterministic memory folding); Workflow DAG engine (E1803 fail-closed validation, Kahn+lexicographic scheduling, blob-CAS node outputs, crash-safe resume); eval harness (real hermetic agent runs, deep-normalized transcripts, deterministic hashes, VAE_BLESS golden governance with E1805 drift refusal); agent metrics folded from journal metering only; research integration (One Context Path + citation enforcement E1806); CLI run agent/run workflow + resume continuation + doctor/explain/dev integration; SDK agentRun/workflowRun/agentMetrics parity; spec 0.1.3 (36 events, 48 codes); agents/tools config blocks + agentGrants ceiling-internal derivation; coverage ratcheted (84.62/89.45). |
| MS-5 | Surfaces | ⏳ pending | 15% | CLI Daily Seven fully operational **including agent/workflow runs**; SDK in-process **including gateway + agent parity**. Remaining: daemon (ADR-0010), HTTP/SSE transport, SDK parity over the wire, extension kit. |
| MS-6 | Packaging + Hardening | ⏳ pending | 0% | `.vxn` reproducible bundles (ADR-0016), installers, docs sweep. |
| GA | General Availability | ⏳ pending | 0% | Burndown + rehearsal. |

## Estimated completion (engineering estimate, not a promise)

- ~~MS-4~~: complete (agents, workflow DAGs, reasoning sessions, eval harness, metrics).
- **MS-5 → MS-6**: two further cycles to GA per the blueprint's stage ordering (daemon, extension kit, packaging, hardening).

## Technical risks (top)

1. **Substrate ratification (ADR-0018)** — still Proposed. Mitigation: contracts and golden fixtures remain byte-stable and substrate-neutral.
2. **Journal throughput** — per-record fsync buys durability at a latency cost; batching needs a ratified ADR before MS-4 scale. Mitigation: the writer remains the single choke point.
3. **Price table drift** — build-time data (2026-08); provider changes are data updates with a reviewed contract change, never code drift.
4. **Per-process breaker state** — deliberately not journaled (the failures are); multi-process sharing is an MS-5 daemon concern and needs an ADR.
5. **Coverage floors are total-based** — per-module ratchets are mechanical follow-up; totals only move up (83.37/88.96 as of MS-3).

## Recommended next work (priority order)

1. **MS-5 daemon** (ADR-0010) — loopback HTTP/SSE so SDK parity holds over the wire, not only in-process; per-process breaker sharing ADR; extension kit.
2. **Record real-provider planning cassettes** (scripts/record-cassettes.ts) when network access exists — the ModelPlanner success path currently lacks an end-to-end golden (MockBrain output is not plan JSON by design; the parser is unit-tested).
3. **Ratify ADR-0018** (substrate) and re-baseline shipping goals.
4. **Coverage ratchets per module** — mechanical, keeps the OBJ-Q6 law granular.

---

*Progress measured, not narrated: every number traces to the verification gates or the file inventory in `tools/status.ts` → `site-data/vaerion-status.json`.*
