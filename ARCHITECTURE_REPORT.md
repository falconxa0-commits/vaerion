# ARCHITECTURE_REPORT — Vaerion (as of MS-6: reproducible bundles)

| | |
|---|---|
| **Date** | 2026-08-30 |
| **Scope** | Architecture state after the MS-6 bundle-build objective (ADR-0016) — layers, boundaries, data flows, and the sanctioned seams |
| **Verification** | ALL 6 GATES GREEN (`VERIFICATION_REPORT.md`); layerlint: 94 files / 446 runtime edges / 0 violations |

---

## 1. Layer model (enforced by `tools/layerlint.ts`)

| Layer | Contents | May depend on |
|---|---|---|
| L0 | `kernel/` (errors, ids, clock, canonical, redact, hash), `config/` | nothing above |
| L1 | `spine/`, `journal/`, `store/`, `receipts/`, `broker/` (contracts + engine + refusal log), `gateway/` | L0 |
| L2 | `runtime/run.ts`, `research/`, `agents/`, `workflow/`, `evals/`, `extensions/`, `package/` (MS-6) | L0, L1 |
| L4 | `cli/`, `api/` (local daemon — MS-5) | L0–L2 |
| SDK | `sdks/typescript` (in-process client + wire client) | engine public API |

**MS-3 change**: `gateway/` enters L1. It consumes broker contracts and kernel
ports; it never imports runtime or CLI. The `secretGrantFor` helper lives in
`broker/engine.ts` (not config) so L0 stays free of L1 runtime imports — the
one layer violation introduced mid-milestone was caught by layerlint and
removed at root. Type-only imports remain exempt by the documented rule.

## 2. The Model Gateway — where it sits in the constitution

```
                    ┌──────────────────────────────────────────────┐
                    │  vaerion.yaml — ceilings: gateway.providers, │
                    │  budgets, secret NAMES + grants (ADR-0013)   │
                    └──────────────────────┬───────────────────────┘
                                           │ graphFromConfig
   CLI `vae run model` ─┐                  ▼
   SDK gatewayInvoke ───┼─→ RunHarness.decide ─→ BrokerEngine (shape →
                        │   (model.invoke /      ceiling → policy, fail-
                        │    secret.read)        closed; journaled decision;
                        │                        deny → Refusal Log)
                        │                          │ allow
                        ▼                          ▼
              ┌─────────────────────── GatewayService.invoke ──────────┐
              │ budget pre-check (E1703) → breaker admit (E1705) →     │
              │ R-MG5 outbound redaction → retries (E1706/E1601 only,  │
              │ full-jitter, connection establishment ONLY) → stream   │
              │ consumption (never retried) → metering journal →       │
              │ post-budget loud stop (E1703, spend stays journaled)   │
              └──────────────┬─────────────────────────┬───────────────┘
                             │                         │
                 ProviderAdapter (open)         host.emit (spine + journal)
                 anthropic│openai│ollama│mockbrain        gateway.invoke.recorded
                             │                                │ gateway.invoke.failed
                             ▼
              GatewayTransport — THE single sanctioned egress (ADR-0019)
              fetchTransport (production) · cassetteTransport (replay law)
              · scripted transports (tests) — same port, same fingerprints
```

Constitutional properties, all gate-enforced:

- **One gate (D-J)**: every model I/O crosses `GatewayService.invoke`; the broker decides first; denials are journaled + refusal-logged; nothing bypasses the journal (R-RT2).
- **One seam (C1/ADR-0019)**: exactly one engine file carries URLs/`fetch` — allowlisted by the constitutional scanner; adapters name host keys, never endpoints.
- **One canonical wire form (R-MG1)**: provider shapes never leak past the adapters; downstream sees `StreamFrame`s only.
- **Zero telemetry (P10/D-K)**: providers receive exactly the declared payload after deterministic redaction; a secret shape never leaves the machine (`[REDACTED len=N]`), and the journal stores the redacted text + blake3 hash, never the secret.
- **Determinism (P2)**: timing and jitter run through the injected Clock/Rng; MockBrain proves the ideal — identical seed ⇒ byte-identical journals.

## 3. Data flows (MS-3 additions)

1. **Invocation**: request → broker decision (journaled) → [secret decision (journaled)] → breaker → redacted outbound → adapter → transport → frames → usage/cost/text-hash → `gateway.invoke.recorded` (journaled) → receipt on close. Terminal failures after authorization → `gateway.invoke.failed` (never silent).
2. **Metering**: `meteringFromRecords` folds journal records — order-free, integer-only, replay-identical; surfaced identically by CLI `explain` and SDK `metering()`.
3. **Hermetic replay**: cassettes are committed transcripts whose fingerprints are computed through the real pipeline (`scripts/record-cassettes.ts` records via the actual adapters); replay matches by blake3 fingerprint, fails closed on a miss.
4. **Prompt pause**: a `prompt` policy throws `GatewayGatePrompt` with the open durable gate; `vae resume --answer` resolves it and records the elevation — the same human-authority loop as MS-2, now guarding model spend.

## 4. State stores (unchanged law, new payloads)

| Store | Writer | MS-3 role |
|---|---|---|
| Run journal (NDJSON + blake3 chain) | single-writer lock | `gateway.invoke.recorded`/`failed` events; metering folds from here alone |
| Audit ledger | ChainedAuditWriter | decisions + elevations (unchanged) |
| Refusal Log | RefusalLogWriter | `model.invoke`/`secret.read` denials |
| Blob CAS | BlobStore | unchanged (not used by the gateway) |
| Config `vaerion.yaml` | human | `gateway.providers` ceilings, `gateway.budgets`, `secrets` NAMES + grants |

Deliberately NOT a store: breaker health (per-process live state; the failures themselves are journaled — an MS-5 ADR will decide multi-process sharing).

## 5. Trade-offs and honest gaps

- **Collect-then-consume streaming**: the service currently materializes frames before returning (`InvocationResult.frames`); incremental consumer streaming over the same normalized contract is deferred (the Spine bus already supports ordered fan-out — MS-4 agent loops will drive this).
- **Retry scope**: connection establishment only, by law; mid-stream failures are terminal for the invocation (partial output must never be re-sent or double-metered).
- **Egress matrix**: v0.1 ships three providers + MockBrain; adding a provider is one adapter + one endpoint entry + a reviewed price-table row.
- **daemon direction**: ADR-0019 covers the outbound provider direction; the MS-5 loopback daemon adds an inbound listener and must amend the ADR.


---

## 12. MS-4 architecture additions (Intelligence + Agents)

### 12.1 New L2 subsystems and their dependency law

`agents/`, `workflow/`, `evals/` are L2 (layerlint-classified this milestone): they may import L0 (kernel, config) and L1 (spine, journal, store, receipts, broker, gateway) and each other, never L4. The layer matrix did not change; the population did (67 → 81 engine files, 208 → 353 checked runtime edges).

### 12.2 The agent control loop (who owns what)

- **Plan** (`agents/planner.ts`) → **Execute** (`agents/executor.ts`) → **Authorize** (broker via RunHarness.decide) → **Journal** (single writer) → **Act** (gateway/tool/reasoning/research) — the decide→journal→act law is inherited, not restated: the agent runtime composes the same ports the CLI and gateway use.
- **Supervision** (`agents/runtime.ts`): retries are bounded and injected; broker refusals are fatal; gate prompts pause with `awaiting_gate` and the journal left open; the ceiling is loud (E1804); completion is honest (failures ⇒ `failed`).
- **Elevation durability** (`runtime/run.ts`): an approved prompt decision grants authority for the SAME principal+domain+scope across restarts. It is journaled as its own decision record (policy `human-elevation`) and audited — the human's recorded approval is the rule, never a bypass.
- **Snapshot law sharpened**: subsystem folds (agent, workflow) never trust another fold's snapshot bag; until subsystem-shaped snapshots exist they deterministically replay from the beginning. Snapshots remain accelerators, never truth.

### 12.3 Workflow DAG determinism

Scheduling = Kahn's algorithm with a lexicographic tie-break; execution is SEQUENTIAL in that order (parallel scheduling requires a ratified ADR because concurrent ordering would break replay byte-stability). Node outputs are content-addressed (blob CAS) and journaled by blob_ref; resume = journal fold + skip completed nodes.

### 12.4 Evals as a constitutional device

The eval harness (ADR-0012) runs REAL agent runs hermetically: declared plans, builtin deterministic tools, MockBrain, fixed clocks, seeded ids. The transcript is the run's own spine with volatile identity stripped deep; the transcript hash is the golden anchor (VAE_BLESS=1 is the only bless path; drift is E1805).

### 12.5 Money and metrics

Agent metrics are a pure fold over the journal; token/cost/latency accounting comes EXCLUSIVELY from `gateway.invoke.*` records (the single gate's metering truth) — step events contribute structure, never spend. Integer micro-USD throughout.

---

## 13. MS-5 architecture additions (the local API daemon)

**Two sibling surfaces, one set of contracts.** `api/` enters the layer model
as L4 beside `cli/`, with a NEW hard edge enforced by layerlint: the daemon
must never import the CLI. Both surfaces compose the SAME engine building
blocks (RunHarness, AgentRuntime, WorkflowEngine, GatewayService,
ToolInvocationService); parity is proven by tests that journal identical
event-type sequences through both journeys.

**Where the network seams now live (exactly two, both singular and
scanner-enforced):**

| Seam | File | Law |
|---|---|---|
| Model EGRESS (MS-3) | `gateway/transport.ts` | The only outbound provider site; reachable only behind journaled broker decisions (ADR-0019). |
| Wire CLIENT (MS-5) | `sdks/typescript/src/daemon-transport.ts` | The only SDK HTTP-client site; loopback-enforced IN CODE (E2006 refuses any non-loopback host before a byte is sent) per ADR-0020. |
| Listener | `packages/vaerion/src/api/` | May listen, never call out — constitutional check C7 scans the surface for client primitives with ZERO allow entries. |

**The serial run queue.** The daemon executes runs one-at-a-time per
workspace, in submission order. This is not a limitation of convenience: the
audit ledger and the refusal log are single-writer hash chains, and concurrent
writers would break them. Concurrent execution needs a ratified ADR that
solves chained-writer coordination first.

**Truth topology.** The daemon caches nothing authoritative: run status is a
pure journal fold (verify + RunState + subsystem folds + receipt); the SSE
streams replay the journal by seq and follow it to the receipt; the registry's
in-memory bookkeeping exists only to answer honestly in the window between
`201 Created` and the first journal record ("run accepted; first journal
record pending") and to record failed starts — the journal always wins.

**OpenAPI by construction.** `spec/openapi.json` is generated from the same
route table that dispatches requests; constitutional check C4 verifies the
committed contract never drifts from the generator. Only implemented routes
are described — an unimplemented route is never advertised.

---

## 14. MS-5b architecture additions (the extension host, ADR-0009 R-2)

**Extensions are principals, not plugins.** The R-2 subprocess host speaks
the published world (`spec/wit/vaerion-extension@0.1.0.wit`): the artifact is
sha256-pinned and verified BEFORE execution; it runs with an EMPTY
environment; and every power request crosses the broker bridge as a
decide→journal→act evaluation with `extension:<name>` as the principal.
`extensionGrants` derive ceiling-internal scopes so the graph covers the
extension without widening anything. The host is fail-closed by
construction: the first protocol violation (handshake, frame shape, size,
budget, time) kills the process and journals an honest `extension.exited
{failed:true}`. `extensions/` sits at L2 beside `agents/` — it composes the
runtime spine and is never imported by it. When the WASI-P2 component
toolchain lands, the SAME world and broker semantics move onto components;
the WIT contract is locked now.

## 15. MS-6 architecture additions (reproducible bundles, ADR-0016)

**The bundle is a protocol artifact, not an archive choice.** `package/`
(L2, beside `extensions/`) implements ADR-0016 exactly: a `.vxn` file is
magic `VXN1` + a CANONICAL JSON manifest + a zstd-pinned (level 19) payload
of a canonically ordered entry stream; identity is blake3 per entry and over
the full bytes. Three laws make rebuilds byte-identical (P2): the build is a
FOLD over declared inputs (`package.include` + pin-verified extension
artifacts — auto-carried because the manifest pins them), the manifest
records no wall-clock and no ambient paths, and the compression level is
part of the format contract (drift ⇒ E2203, never a silent rebuild).

**Verify is a pure check, import never executes.** `verifyBundleBytes`
recomputes every digest and compares pins, then REPORTS honest per-check
findings (E2200 format law · E2201 digests · E2202 pin swap both directions
against config · E2203 magic/version · E2205 stale lock) — content is never
executed, never even written to the workspace. The digest-swap defense of
Blueprint §9.4 is enforced: manifest pins must equal vaerion.yaml pins AND
vaerion.lock pins, and the lock must seal exactly the bytes being verified.

**The lockfile closes the source-of-truth chain.** `vaerion.lock` is the
third element of `vaerion.yaml → vaerion.lock → spec/`: a generated,
committed, canonical-JSON seal (config fingerprint, extension pins, bundle
digest). It is never hand-edited — doctor cross-checks it against reality
and points at `vae package build` for the repair; the lock diff is the
review surface for any supply-chain change.

**Surface placement.** `vae package build|verify` is the additive NINTH
command (D-M remains the Daily Seven; `serve` (MS-5) and `package` (MS-6)
are documented additive commands on the same five-guarantee law). Build and
verify open REAL run journals (`package.built` / `package.verified` events,
receipts) — packaging is journaled like every other engine action, with
`--dry-run` computing the full fold in memory and writing nothing.

---

## Ω. PHASE Ω addendum (2026-08-31 — v0.1.7-rc2)

The refinement pass respected every architectural boundary:

- **Layer law holds** — `src/cli/ui.ts` is L4 presentation importing only
  L0 kernel modules (`redact`, `errors` catalog, `clock`); layerlint GREEN.
- **One clock law holds** — even spinner durations read the sanctioned
  `SystemClock`; the constitutional C2 scan caught a `Date.now()` during
  the pass and the fix was made at the root, not in the linter.
- **One rendering pipeline** — every command composes the same
  components through `Renderer`; there is no free-hand console output in
  the CLI surface. The rich dispatch keys on the same stable `command`
  field the machine contract uses — presentation and contract cannot
  drift apart.
- **Profile isolation** — `resolveProfile` is the single decision point
  (json > VAE_UI override > TTY && !NO_COLOR && TERM!=dumb && !CI);
  `--json` never paints, pipes never paint, and the tests pin both.
- **Additive surface** — `provenance` extends the CLI the same way
  `serve` and `package` did: journaled-where-side-effects-exist,
  read-only-otherwise, taught in help, mirrored in `dev`'s command
  surface, and documented in the spec changelog.
