# BUILD_REPORT — Vaerion MS-0 → MS-4 (Intelligence + Agents)

---

## 0. What was built in MS-4 (this milestone)

### 0.1 The agents subsystem (`packages/vaerion/src/agents/` — 8 modules)

| Module | Law it implements |
|---|---|
| `runtime.ts` | **AgentRuntime** — the supervisor over journaled decisions. The loop: plan → per step decide → journal → act → journal outcome, with round/index coordinates on every step (crash-safe dedup). Bounded retries with injected backoff; broker refusals (E1300/E1301) are FATAL — authority is never retried around; gate prompts journal `agent.run.completed {outcome: "awaiting_gate"}` and leave the journal OPEN (gates survive process death, R-A4); the step ceiling stops LOUDLY (E1804) with journaled work intact. Honest completion: a plan that finishes with journaled failures reports outcome `failed`, never `goal`. `agentRunStateReducer` is the pure fold (R-RT2); `AgentRuntime.resume` verifies the chain, folds, and continues from the first unjournaled step. |
| `tools.ts` | **ToolInvocationService** — every tool invocation crosses the broker pipeline: declared-before-used (E1801 fail-closed BEFORE journaling — mirror of the gateway's unknown-model law), typed args (E1802; declared keys required, `?` suffix optional, unknown keys are drift), `tool.call.requested` → `tool.call` broker decision (decide → journal → act) → `tool.call.completed` (with blake3 `result_hash`, optional blob_ref receipt) | `tool.call.denied`. Deterministic builtin executors (`echo`, `clock.read` on the injected clock, `research.search` over an injected index with journal-safe integer milli-scores). |
| `planner.ts` | **Plan contract + two real planners.** `parsePlanText`/`assertPlan` enforce the plan JSON shape (E1800 — planner drift is a loud failure). `InlinePlanner` is the DECLARED determinism device (ADR-0012 law, like cassettes: a declared plan, never a fake LLM). `ModelPlanner` plans through the gateway SINGLE GATE — its invocation is broker-authorized, metered, and journaled like any model call. |
| `reasoning.ts` | **ReasoningSession** — persistent scratchpads ON the journal: `reasoning.note.recorded` (redacted) and `reasoning.folded` events; `reasoningStateReducer` is the pure fold; memory folding (`foldSummary`) is a pure function of the unfolded notes (first-sentence extraction, fixed bounds) — recomputable from the journal alone, byte-stable; snapshot-assisted restore never alters the fold. |
| `executor.ts` | **StepExecutor** — runs one step through its constitutional path: model → GatewayService (single gate), tool → ToolInvocationService (broker pipeline), note → ReasoningSession, context → ResearchPort (One Context Path). Gate prompts PROPAGATE (human authority is not a failure); other failures are honest outcomes. Citation enforcement (E1806): answer steps with `requiresCitations` over prepared research content must reference a prepared `cit_NNNN`. |
| `metrics.ts` | **agentMetricsFromRecords** — a pure fold over journal records: run structure (steps/failures/retries from `agent.*`), spend (tokens/cost/latency/attempts EXCLUSIVELY from `gateway.invoke.recorded`/`failed` — the metering truth; step events never double-count), tools, context, gates. |
| `research-port.ts` | **LocalResearchPort** — the One Context Path behind `context` steps: declared capability → deterministic local retrieval (fingerprint → fence → blob CAS → evidence → BM25 index) → query → citations → context pack, every step journaled. Undeclared capability ⇒ E1403. |
| `grants.ts` | **agentGrants** — the agent principal's ceiling-internal grants, derived ONLY from human declarations: `tool.call` over declared tool scopes; `model.invoke` over concrete declared models admitted by declared policy rules. Declare nothing, grant nothing. |

### 0.2 The workflow subsystem (`packages/vaerion/src/workflow/`)

- `dag.ts` — **fail-closed validation** (E1803: duplicates, missing deps, self-deps, cycles via Kahn reachability, malformed nodes) and **deterministic scheduling** (Kahn's topological order, lexicographic tie-break — the same DAG always schedules identically; replay and resume see the same order).
- `engine.ts` — **WorkflowEngine**: `workflow.started` → per node in topo order `workflow.node.started` → the step executes through the StepExecutor law → output content-addressed in the blob CAS → `workflow.node.completed {result_hash, blob_ref}` | `workflow.node.failed {error_code}` → `workflow.completed {outcome, completed, failed}`. Node failures stop dependents (never half-run). **Resume is the fold**: `WorkflowEngine.resume` verifies the chain, folds `workflowStateReducer`, and `run(dag, {resumeState})` skips completed nodes — crash-safe by the single-writer lock, replay-safe because everything is journal records.

### 0.3 The evals subsystem (`packages/vaerion/src/evals/`)

- `harness.ts` — **EvalHarness** (ADR-0012 hermetic law): scenarios run REAL agent runs (InlinePlanner, builtin tools, MockBrain when model steps are declared) in real workspaces; the transcript is the run's spine (decision/gate/receipt records + events) with volatile fields stripped DEEP (ids, seq, timestamps); deterministic transcript hash (blake3 over canonical JSON); honest expectation scoring (outcome, step bounds, tools used, model invocations, citations, chain verification); replay comparison (double fold equality folded into `replayHash`); golden governance — bless ONLY via `VAE_BLESS=1`, drift refuses E1805, missing golden refuses honestly rather than silently creating.

### 0.4 Broker law extended (elevation made durable)

- **RunHarness elevation law**: an explicitly APPROVED prompt decision becomes durable authority for the SAME principal+domain+scope. The re-decision is still a full decide → journal → act record (policy `human-elevation`) — nothing bypasses the broker; the human's recorded approval IS the rule. Cross-restart safe: `restore()` seeds elevations from resolved-approved gates × their decision records in the journal, and `resolveGate()` looks up the decision record from the journal when the prompt came from a previous session. Without this, resuming an agent run would re-prompt forever — the gate would be pointless for continuation. Denials grant nothing.

### 0.5 Surfaces

- **CLI**: `run agent --goal TEXT [--planner inline|model] [--steps N] [--plan-json JSON]`; `run workflow --dag FILE [--resume RUN_ID]`; `resume` now CONTINUES agent runs after gate approval (elevation applies) and ends denied runs at exit 3; `explain` carries the agent picture (outcome, per-step narrative, tools, context, metrics fold); `doctor` reports declared tools (fail-closed note) + the agent loop ceiling; `dev` lists the L2 map (runtime, research, agents, workflow, evals) and the MS-5 position. Help texts teach all of it.
- **SDK** (`@vaerion/sdk`): `agentRun()` (in-process supervised run, injectable transport/secrets/executors), `workflowRun()` (fail-closed DAG validation + journaled execution), `agentMetrics(runId)` (same fold as explain) — machine parity with the CLI.

### 0.6 Config + spec evolution (0.1.2 → 0.1.3, additive only)

- `vaerion.yaml`: optional `agents` block (`maxSteps` ≥ 1, `plannerModel` canonical provider/model) and optional `tools` array (`name` + optional `scope`/`description`). Declaring a tool grants nothing by itself — `tool.call` authorization still requires explicit policy rules. Strict unknown-key rejection unchanged.
- `events/registry.json`: +11 types — `agent.run.started`, `agent.step.recorded`, `agent.step.failed`, `agent.run.completed`, `workflow.started`, `workflow.node.started`, `workflow.node.completed`, `workflow.node.failed`, `workflow.completed`, `reasoning.note.recorded`, `reasoning.folded` (**36** event types).
- `errors.yaml` + kernel catalog: the 18xx range E1800–E1806 (**48** codes) — in verified sync.
- CHANGELOG-SPEC 0.1.3 records everything; registry/catalog versions stay 1 (additive per ADR-0002/0014).

### 0.7 Real defects found by verification and fixed at root cause (7)

1. **Snapshot trust across folds** — agent/workflow folds accepted the HARNESS RunState snapshot bag (default validator), crashing `explain` on any run with a snapshot. Fix: subsystem folds validate snapshots against their OWN shape (agent/workflow folds reject foreign bags; deterministic full replay from the beginning).
2. **Swallowed gate prompts** — the StepExecutor's catch converted `GatewayGatePrompt`/`ToolGatePrompt` into failed outcomes, so the supervisor never paused (and claimed `goal` after failures). Fix: gate prompts propagate (`isGatePrompt` rethrow); human authority is not a failure.
3. **Type-only `instanceof`** — `GatewayGatePrompt` was imported type-only in the executor, so the `instanceof` check itself threw `ReferenceError` at runtime ("GatewayGatePrompt is not defined"), mislabeling refusals E1900. Fix: value import.
4. **Blind budget guard** — the runtime never updated live token/µUSD counters, so pre/post budget checks saw zeros within a run and results reported 0 spend. Fix: live accounting in the loop; the fold recomputes identical numbers from the journal (R-RT2).
5. **Metrics double-counting** — model invocations were counted from BOTH step events and gateway metering records. Fix: spend folds from `gateway.invoke.*` exclusively (the single gate's own records).
6. **Args law contradiction** — `validateArgs` treated declared args as optional, contradicting its documented law; missing required args fell through to the broker (E1300 instead of E1802). Fix: declared keys are required (`?` suffix optional), missing ⇒ E1802 before any journaling.
7. **Dishonest goal outcome** — a plan that finished with journaled failures reported `goal`. Fix: failures ⇒ outcome `failed` (honest completion law).
Also: elevation lookup is now journal-backed (gates resolved after a restore elevate correctly), and `next_milestone`/arg-parser pins were updated for the advanced milestone (label change, not behavior).

---

| | |
|---|---|
| **Milestone** | MS-0 ✅ · MS-1 ✅ · MS-2 ✅ · MS-3 ✅ · **MS-4 (Intelligence + Agents) — complete** |
| **Date** | 2026-08-29 |
| **Substrate** | TypeScript on Bun (ADR-0018, Proposed — pending Founder ratification) |
| **Verification** | ALL 6 GATES GREEN — see `VERIFICATION_REPORT.md` (`.vaerion-verification.json`) |
| **Overall progress** | **64%** of the MS-0 → GA arc (measured: milestone board average in `tools/status.ts` → `site-data/vaerion-status.json`) |

---

## 1. What was built in MS-3 (this milestone)

### 1.1 The gateway subsystem (`packages/vaerion/src/gateway/` — 13 modules, 2,040+ lines)

| Module | Law it implements |
|---|---|
| `types.ts` | Normalized contracts: `ModelOp` (chat/embed/rerank), `ModelRequest`, `StreamFrame` (the canonical wire form — downstream sees ONLY frames), `assertStreamFrame` (E1702), `parseModelId` (fail-closed E1700), `GatewayTransport` port, `ProviderAdapter` port, `assembleText` assembly law. |
| `transport.ts` — **the single sanctioned egress (ADR-0019)** | The ONE engine module carrying endpoint URLs and calling `fetch`. Host keys (`anthropic`, `openai`, `ollama`-loopback) resolve here and nowhere else. Reached only behind journaled broker decisions; providers receive exactly the declared payload — nothing else, no telemetry (D-K). |
| `service.ts` — the single gate (D-J) | `GatewayService.invoke`: budget pre-check (E1703 before any spend) → broker `model.invoke` decision (deny rethrows E1300/E1301 after the broker journaled + refused; prompt throws `GatewayGatePrompt` with the open durable gate) → broker `secret.read` decision (deny/unresolved are journaled as `gateway.invoke.failed` — failures are never silent on the spine) → breaker admit (E1705) → R-MG5 outbound redaction → retries around connection establishment only → stream consumption (never retried) → metering journal → post-budget loud stop. Returns `InvocationResult` with usage, integer cost, attempts, latency, blake3 text hash. |
| `breaker.ts` (R-MG2) | `TransportRetries` — retries ONLY transport-level refusal (E1706) and provider unavailability (E1601); broker denials, budget, secret, and contract failures are law, never weather. Deterministic full-jitter backoff through the injected Clock/Rng ports. `CircuitBreaker` — per-provider, threshold consecutive failures → open (E1705), clock-driven cooldown → half-open single probe; success closes. |
| `metering.ts` (R-MG3) | `meteringFromRecords` — an order-free PURE FOLD over journal records (`gateway.invoke.recorded`/`failed`) into per-model + total rollups; replay-compatible by construction; unpriced calls counted honestly (`unpriced`), never faked as free. |
| `pricing.ts` (R-MG3) | Integer micro-USD arithmetic (floats never carry money); documented half-up rounding on the exact rational; exact + provider-wildcard price table (anthropic/openai chat+embed; ollama/mockbrain honest 0; unknown ⇒ `null` cost); `formatMicroUsd` display. |
| `secrets.ts` (R-MG4, ADR-0013) | `SecretPort` protocol: OS keychain first (macOS `security` CLI), env indirection fallback (`defaultSecretPort`); names only in config; values resolved exclusively at call time, passed once, never cached or persisted; `requireResolvedSecret` fails loudly E1704 carrying the NAME only. |
| `cassette.ts` (ADR-0012) | Cassette replay transport: request fingerprint = blake3 over the canonicalized logical request; fingerprint match ⇒ byte-exact replay; NO match ⇒ fail closed E1702 (never an excuse to touch the network); loud shape validation at construction. |
| `mockbrain.ts` (ADR-0012) | The seeded virtual provider: no network, no credentials, no wall clock; every output (text/tool/embed/rerank/usage) is a pure function of request + seed via blake3 entropy; dim-64 embeddings (block-chained entropy — never silently truncated); rerank scores bounded [0,1]; the hermetic CI device and determinism demo (identical seed ⇒ identical journals). |
| `adapters/sse.ts` | Wire parsers: incremental SSE (WHATWG processing model; CRLF; comments; multi-data) + NDJSON; both chunking-invariant with explicit buffering — cassette replays pin the boundaries. |
| `adapters/anthropic.ts` | Messages API streaming → frames: `message_start` (usage baseline, coalesced — exactly ONE usage frame per stream), `content_block_*` (text + tool_use/input_json_delta), `message_delta` (stop_reason + cumulative output tokens), `ping` ignored, unknown types forward-compat no-ops, error events loud. |
| `adapters/openai.ts` | Chat Completions streaming (`stream_options.include_usage`) + Embeddings (non-streaming JSON) → frames; `[DONE]` terminator; tool_calls; usage chunk; declared honest capability matrix (no rerank). |
| `adapters/ollama.ts` | Chat NDJSON streaming → frames; terminal line carries `prompt_eval_count`/`eval_count`/`done_reason`; local inference — no credential ever required or sent. |

### 1.2 Broker/config integration (ceiling law extended to the gateway)

- `graphFromConfig`: enabled `gateway.providers` declare `provider/model` ceiling scopes granted to the canonical `human` node; disabled providers grant nothing (fail-closed at the ceiling layer); declared secret names become `secret.read` scopes (ADR-0013). An undeclared model hits the BROKER ceiling deny — journaled + refusal-logged, never a silent skip.
- `secretGrantFor` (moved to `broker/engine.ts` — L0 must never import L1): scoped grants matched against the requesting principal id.
- `policyFromConfig`: structural `human-model-invoke-allow` (ceiling-checked) + `human-secret-read-allow`; declared `policy.rules[]` always evaluate first.
- Config validation (loud, coded): gateway provider keys (`anthropic|openai|ollama|mockbrain`), `enabled` boolean, `models` array, budgets as non-negative integers, secret NAME pattern `^[A-Z][A-Z0-9_]*$` with non-empty `grant` arrays.

### 1.3 Surfaces

- **CLI** (`vae`): `run model --model P/M [--prompt|--op embed --input-json|--op rerank --query --docs-json] [--seed|--max-tokens|--system|--intent]` — the full single-gate flow with `--dry-run` (zero side effects), `--json` NDJSON, honest exit codes (3 deny · 4 provider-down · 5 budget-with-repair-hint · 2 usage); `explain` folds the run's gateway metering rollup; `doctor` surfaces the capability matrix, declared providers/secret NAMES (never values, no resolution — broker law), budgets, and the corrected zero-telemetry statement (exactly one sanctioned egress site); `dev` lists the matrix and the MS-4 position. Help texts teach all of it (Guarantee #1).
- **SDK** (`@vaerion/sdk`): `gatewayInvoke()` (same engine calls in-process, injectable transport/secrets for hermetic consumers), `metering(runId)` (same fold as explain), `gatewayMatrix()` (same data as doctor/dev) — parity tested against the CLI.
- **Exit-code law fixed at root** (`vae.ts`): 17xx codes now map honestly (E1700/E1701→2, E1702/E1704/E1705/E1706→4, E1703→5) instead of falling into "internal".

### 1.4 Spec evolution (0.1.1 → 0.1.2, additive only)

- `events/registry.json`: `gateway.invoke.recorded`, `gateway.invoke.failed` (**25** event types).
- `errors.yaml` + kernel catalog: the 17xx range E1700–E1706 (**41** codes) — in verified sync.
- `schemas/vaerion-yaml.schema.json`: optional `gateway` + `secrets` blocks; 0.1.2 correction recorded in the changelog (mockbrain is declared like any provider — the ceiling law governs the virtual provider too).
- **ADR-0019** (new): single sanctioned gateway transport egress — supersedes the MS-0-era absolute C1 reading for exactly one reviewed file.

## 2. Cumulative build state (all milestones)

| Layer | Modules |
|---|---|
| L0 | `kernel/` (errors E#### + VaerionError, ULID/CRN identity, clock/RNG ports, canonical JSON, redaction, blake3), `config/` (strict schema 0.1, gateway/secrets, policy derivation) |
| L1 | `spine/` (envelope v1 + registry + ordered bus + replay), `journal/` (NDJSON + blake3 chain, single-writer, recovery, redacted export), `store/blob-cas`, `receipts/`, `broker/` (contracts + engine + refusal log), `gateway/` (the single gate) |
| L2 | `runtime/run.ts` (composition root, deterministic restore, gates), `research/` (capabilities, fencing, evidence, BM25 LocalIndex, context packs, verification) |
| L4 | `cli/` (Daily Seven + Five Guarantees) |
| SDK | in-process machine-parity client (runs, journals, broker, gateway) |

## 3. Real defects found and root-cause fixed during MS-3 (all caught by the gates)

| # | Defect | Root cause | Fix |
|---|---|---|---|
| 1 | `research/local-index.ts` missing — suite down to 71 tests / 4 errors | File was rebuilt in a prior session's working tree but never committed; lost between sessions | Rebuilt to the test-pinned contract (BM25 k1/b/idf, `limit` default 10 with E1600 validation, `matched_terms`, `docs()`, `documentCount()`, journal-safe `IndexedDoc`) — suite restored to 114 before any new work |
| 2 | `openai.ts` chat stream crashed with `ReferenceError: stopReason` | Variable assigned but never declared (caught by typecheck — no gateway tests existed yet) | Declared `let stopReason` with the same last-write semantics |
| 3 | `gateway.invoke.recorded` journaled `text_hash` as a Promise; `InvocationResult.textHash` type-broken | `blake3HexOf` is async; used un-awaited | Awaited once before journaling; single value reused in payload + result |
| 4 | Anthropic usage coalescing yielded `inputTokens: 0` | `message_start` baseline was emitted as an intermediate frame but never captured | Baseline captured; exactly ONE coalesced usage frame per stream (matches the module's documented law) |
| 5 | MockBrain embeddings had dim 32 while declaring 64 | One blake3 digest yields only 32 byte-usable values — silent truncation | Block-chained entropy (`{text, seed, block}`); exactly dim-64 for every input; strict (-1,1) bounds |
| 6 | MockBrain rerank scores could exceed 1.0 | Jitter added on top of Jaccard=1 | Jitter scaled by `(1 - jaccard)` — scores stay in [0,1]; identical contents still score identically |
| 7 | Gateway errors were plain `Error` with a bolted-on `code` | `Object.assign(new Error…)` in `types.ts`, `cassette.ts`, `service.ts`, `graphFromConfig` — misrouted the CLI error renderer and exit codes (would report "internal") | All replaced with `VaerionError` (code + Fix: line); exit-code map extended honestly |
| 8 | Cassette transport accepted malformed cassettes | `assertCassetteShape` ran only in `loadCassette` | Transport validates every cassette at construction (shape law before replay law) |
| 9 | `mockbrain` undeclarable in config | `GATEWAY_PROVIDERS` omitted it while help text recommended it | Added to the provider set; ADR-0012 provider governed by the same ceiling law; spec 0.1.2 correction recorded |
| 10 | Secret-resolution failures (E1704 / secret.read deny) never journaled `gateway.invoke.failed` | Resolution ran before the failure-journaling helper | Every terminal failure after authorization journals the failed event (R-MG3: failures never silent) |
| 11 | layerlint RED: `config.ts → broker/capability.ts` runtime edge | `secretGrantFor` lived in L0 but needs the L1 scope matcher | Moved to `broker/engine.ts` (authorization is a broker question) |
| 12 | `graphFromConfig` ceiling failure threw plain Error | Same class as #7 | `VaerionError("E1300", …)` |

## 4. Artifacts

- Engine: 67 files / 9,102 lines (+ tests: 14 files / 4,214 lines) — measured by `tools/status.ts`.
- New MS-3 files: `src/gateway/**` (13), `scripts/record-cassettes.ts`, `fixtures/cassettes/*.json` (4 recorded transcripts), `tests/unit/gateway-core.test.ts`, `tests/unit/gateway-adapters.test.ts`, `tests/integration/gateway-flow.test.ts`, `tests/integration/gateway-cli.test.ts`, `docs/adr/0019-single-sanctioned-gateway-egress.md`.
- Modified: `broker/engine.ts`, `config/config.ts`, `kernel/errors.ts`, `spine/event-types.ts`, `runtime/run.ts` (no widening), `cli/commands.ts`, `cli/vae.ts`, `sdks/typescript/src/index.ts`, `index.ts`, spec (registry/errors/schema/changelog), `tools/status.ts`, `tools/constitutional-check.ts` (C1 seam), `bunfig.toml` (floor ratchet).

*Every claim above traces to the verification gates (`.vaerion-verification.json`), the measured status JSON (`site-data/vaerion-status.json`), or the file inventory.*
