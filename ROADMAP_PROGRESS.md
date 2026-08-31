# ROADMAP_PROGRESS — Vaerion

| | |
|---|---|
| **Date** | 2026-08-30 (Phase 1 close) |
| **Overall progress** | **86%** of the milestone arc (MS-0 → GA) — measured: milestone board average, `tools/status.ts` → `site-data/vaerion-status.json`; MS-6 at 85% (reproducible bundles + distribution packaging + docs sweep done; native installers / performance double-check / accessibility sweep remain) |
| **Verification** | ALL 6 GATES GREEN (`VERIFICATION_REPORT.md`) — 278 tests / 1858 expectations / coverage 86.07% lines · 90.87% branches |
| **Release** | **PUBLIC BETA READY** — `v0.1.7-rc1` version lockstep across 10 measured surfaces; signed reproducible artifacts (`docs/ga/RELEASE-VERIFICATION.md`); verdict and blockers in `docs/ga/FINAL-VERIFIED-REALITY-REPORT.md` |

---

## Milestone board

| MS | Name | Status | Progress | Evidence / remaining |
|---|---|---|---|---|
| MS-0 | Skeleton and Law-in-Repo | ✅ **complete** | 100% | Constitution materialized; spec/ contracts; ADR archive (now 0001–0020); verification infrastructure; zero placeholder files. |
| MS-1 | Runtime Spine | ✅ **complete** | 100% | Event Spine; NDJSON+blake3 journal with verify/replay/recovery/redacted-export; single-writer law; blob CAS; receipts; chaos suite green; research subsystem; CLI Daily Seven; TS SDK parity. |
| MS-2 | Permission Broker | ✅ **complete** | 100% | BrokerEngine (shape → ceiling → policy, fail-closed at every layer); permission-graph ceiling from `vaerion.yaml`; per-source decisions; redacted `action` on journaled decisions; durable gates with `decision_id` links (runs pause, never auto-close); elevation flow; hash-chained Refusal Log surfaced in `explain` + `doctor` + SDK; policy files; human review loop; spec 0.1.1. |
| MS-3 | Model Gateway | ✅ **complete** | 100% | `GatewayService` single gate (decide `model.invoke` → journal → act); provider adapters **anthropic / openai / ollama** + **MockBrain** (ADR-0012); normalized `StreamFrame` contract; 4 committed cassettes through the real fingerprint pipeline; retry with deterministic full-jitter backoff; per-provider circuit breaker (E1705); integer micro-USD pricing + order-free metering fold (R-MG3); budgets pre/post; secrets boundary (ADR-0013); R-MG5 outbound+journal redaction; CLI `run model` + `explain` metering + `doctor` matrix + `dev`; SDK parity; spec 0.1.2; ADR-0019 single sanctioned egress. |
| MS-4 | Intelligence + Agents | ✅ **complete** | 100% | AgentRuntime supervisor loop over journaled decisions (bounded retries, fatal broker refusals, durable-gate pauses with restart-safe elevation authority, loud E1804 ceiling); InlinePlanner + ModelPlanner through the gateway single gate (E1800); tool invocation pipeline (E1801/E1802, blake3 receipts); reasoning sessions (journaled scratchpads, deterministic folding); Workflow DAG engine (E1803 fail-closed, Kahn+lexicographic, blob-CAS outputs, crash-safe resume); eval harness (hermetic runs, VAE_BLESS golden governance, E1805 drift refusal); agent metrics folded from journal metering only; research integration (One Context Path + E1806 citation enforcement); CLI + SDK parity; spec 0.1.3. |
| MS-5 | Surfaces | ✅ **complete** | 100% | CLI Daily Seven + `serve` (additive eighth command); local API daemon (ADR-0010/0020: loopback Bun.serve, pairing-token authn, generated openapi byte-synced by C4, SSE journal-cursor replay, gate answer/continue over the wire, receipted cancellation, serial run queue); SDK parity over the wire (single sanctioned client site, E2006); extension kit alpha (ADR-0009 R-2: WIT world locked at spec/wit/, sha256-pinned subprocess host with EMPTY-environment spawn, broker bridge with extension principals, adversarial protocol suite, spec 0.1.5). Deferred by documented decision: sessions/intel/packages route groups await their subsystems. |
| MS-6 | Packaging + Hardening | 🔄 **in progress** | 85% | **REPRODUCIBLE BUNDLES COMPLETE (ADR-0016)**: `.vxn` deterministic format (magic VXN1, canonical manifest, canonical entry order, zstd pinned level 19, blake3 identity); build = pure fold over declared inputs + pin-verified extension artifacts (E2100 refusal, auto-carry, no wall-clock/ambient paths — byte-identical rebuilds test-proven); `vaerion.lock` generated canonical-JSON seal (config fingerprint + extension pins + bundle digest); verify = pure check with honest per-check findings (E2200/E2201/E2202/E2203/E2205, E2206 summary; content NEVER executed); CLI `vae package build|verify` (additive ninth command, journaled + receipted, --dry-run pure); doctor package-lock cross-check; config `package` block; spec 0.1.6 (E2200–E2206, package.built/verified events); +28 tests; floors ratcheted (86.07/90.87). **PHASE 1 (2026-08-30) ADDED:** distribution packaging (tools/dist-pack.ts — deterministic tarball built twice + byte-compared, canonical sha256+blake3 MANIFEST, Ed25519-signed, tamper detection proven; consumer tools/dist-verify.ts), LICENSE Apache-2.0 + CONTRIBUTING, beta experience (README/QUICKSTART/INSTALL/TROUBLESHOOTING/BETA-ONBOARDING + executed demo workspace), security dossier (docs/security/), ADR finalization (docs/adr/README.md), CI pipeline (.github/workflows/verify.yml), version lockstep 0.1.7-rc1. **REMAINING (honest): native single-binary installers, performance double-check, accessibility sweep; release-train publish steps are Founder-gated.** |
| GA | General Availability | ⏳ pending | 0% | Burndown + rehearsal. |

## Estimated completion (engineering estimate, not a promise)

- ~~MS-4~~: complete.
- ~~MS-5~~: complete (daemon, HTTP/SSE, wire-parity SDK, extension kit alpha).
- **MS-6**: bundles ✅ (this sprint) → installers → docs sweep → accessibility → performance double-check — then the GA burndown.
- Natural follow-on objective within MS-6: the daemon **packages route group** (wire parity + openapi regen) — the packaging subsystem now exists.

## Technical risks (top)

1. **Substrate ratification (ADR-0018)** — still Proposed. Mitigation: contracts and golden fixtures remain byte-stable and substrate-neutral.
2. **zstd byte-determinism across toolchain versions** — the pinned level (19) is deterministic for a fixed toolchain and the rebuild test proves byte equality on the current substrate; a zstd version bump could change bytes, so the format version in the magic is the escape hatch (never a silent rebuild).
3. **Journal throughput** — per-record fsync buys durability at a latency cost; batching needs a ratified ADR.
4. **Price table drift** — build-time data (2026-08); provider changes are data updates with a reviewed contract change, never code drift.
5. **Per-process breaker state** — deliberately not journaled (the failures are); multi-process sharing is a daemon concern needing an ADR.
6. **Coverage floors are total-based** — per-module ratchets are mechanical follow-up; totals only move up (86.07/90.87 as of MS-6 bundles).

## Recommended next work (priority order)

1. **MS-6 installers + docs sweep** — then accessibility + performance double-check, completing the exit criteria.
2. **Daemon packages route group** (wire parity; spec/openapi regen) — Machine Parity law for the new subsystem.
3. **Record real-provider planning cassettes** (scripts/record-cassettes.ts) when network access exists.
4. **Ratify ADR-0018** (substrate) and re-baseline shipping goals.
5. **Multi-process daemon federation ADR** — the serial run queue is lawful for one workspace/process; sharing breakers/chains across processes needs a ratified design.

---

*Progress measured, not narrated: every number traces to the verification gates or the file inventory in `tools/status.ts` → `site-data/vaerion-status.json`.*
