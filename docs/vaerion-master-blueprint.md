# VAERION — Master Blueprint & Implementation Plan

| | |
|---|---|
| **Document** | Vaerion Master Blueprint (single design + implementation plan) |
| **Status** | `DRAFT v1.0 — FOR APPROVAL` |
| **Scope** | Vaerion v0.1 (local-first, self-contained; cloud features explicitly out of scope) |
| **Applies to** | Native Runtime · CLI · Project Intelligence · AI Runtime · Model Gateway · Python SDK · TypeScript SDK · Extension SDK · Public API · Package Builder · Documentation |
| **Decision rule** | This document is authoritative until superseded by an ADR recorded in `docs/adr/`. Nothing ships that contradicts it without an ADR. |
| **Approval gate** | No Milestone implementation begins until this document is approved (see §19 Decision Requests). |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Thesis — What Vaerion Is and Is Not](#2-product-thesis)
3. [Objectives](#3-objectives)
4. [Requirements](#4-requirements)
5. [Architecture](#5-architecture)
6. [Folder Structure](#6-folder-structure)
7. [Interfaces](#7-interfaces)
8. [Data Flow](#8-data-flow)
9. [Security Considerations](#9-security-considerations)
10. [Performance Considerations](#10-performance-considerations)
11. [Developer Experience](#11-developer-experience)
12. [Testing Strategy](#12-testing-strategy)
13. [Documentation Plan](#13-documentation-plan)
14. [Release & Distribution](#14-release--distribution)
15. [Delivery Plan](#15-delivery-plan)
16. [Risks & Mitigations](#16-risks--mitigations)
17. [Architecture Decision Records](#17-architecture-decision-records-adrs)
18. [Recommended Improvements to the Original Brief](#18-recommended-improvements-to-the-original-brief)
19. [Decision Requests & Open Questions](#19-decision-requests--open-questions)
20. [Appendix A — Glossary](#20-appendix-a--glossary)

---

## 1. Executive Summary

Vaerion is an **AI-native development engine**: the local execution layer where human
developers, AI agents, models, tools, extensions, and SDKs meet and do real work on a codebase.

It is not an IDE, not a chatbot wrapper, not a model proxy. It is the deterministic,
auditable substrate underneath those things:

```
                ┌──────────────────────────────────────────────────┐
   humans ──────►                 Terminal  (CLI `vae`)           │
   agents ──────►     Public API  (local daemon: REST/SSE/WS)     │
   editors ─────►            SDKs  (Python · TypeScript)          │
                └───────────────────────┬──────────────────────────┘
                                        │ single event spine
              ┌─────────────────────────▼──────────────────────────┐
              │                  VAERION CORE                      │
              │  Project Intelligence · AI Runtime · Orchestrator  │
              │  Permission Broker · Model Gateway · Tools         │
              │  Extension Host (WASM) · Workflow Engine · Store   │
              └──────┬───────────────┬───────────────┬─────────────┘
                     ▼               ▼               ▼
              filesystem/project   providers      extensions
              (vaerion.yaml + git) (Anthropic,    (.wasm,
                                    OpenAI,        capability-
                                    Ollama…)       sandboxed)
```

Three ideas carry the entire design and make everything else derivable:

1. **One source-of-truth chain.** `vaerion.yaml` (human-authored intent) → `vaerion.lock`
   (machine-resolved state) → published JSON Schema + OpenAPI contracts. Every binary,
   SDK, agent, and extension resolves truth from this chain, never from ad-hoc config.
2. **One event spine.** Every meaningful action anywhere in the system is emitted as a
   versioned, traceable event envelope over one internal bus. The CLI renders it, the API
   streams it, SDKs expose it, workflows record it for replay. Build the bus once;
   every interface becomes a thin projection.
3. **One permission broker.** Filesystem, network, model, secret, and tool access all flow
   through a single capability gate declared in `vaerion.yaml`, enforced identically for
   humans, agents, and WASM extensions. Security posture cannot drift per entrypoint.

Everything is local-first by construction: the default deployment is *one static binary +
one project directory*. The same core compiles into the CLI, the local daemon (`Public
API`), and both official SDKs consume only published contracts. Cloud connectivity, team
registries, and hosted runners are future extensions that plug into interfaces defined
here but implemented nowhere in v0.1.

---

## 2. Product Thesis

### 2.1 What Vaerion IS

| Capability pillar (v0.1) | One-line definition | Primary artifact |
|---|---|---|
| **Native Runtime** | Rust core engine owning processes, files, resources, event bus, storage | `crates/vx-core`, `vx-runtime` |
| **CLI (`vae`)** | The terminal-first cockpit; every feature reachable, scriptable, composable | `crates/vx-cli` |
| **Project Intelligence** | Deterministic understanding of a repo: symbols, dependency graph, semantics, relevance ranking | `crates/vx-intel` |
| **AI Runtime** | Agent orchestration loop, tool-calling framework, context assembly, workflow DAGs, checkpoints/replay | `crates/vx-agent`, `vx-workflow`, `vx-context` |
| **Model Gateway** | Provider-agnostic model I/O with streaming, retries, budget metering, rate-limit citizenship | `crates/vx-gateway` |
| **Python SDK** | Full-parity programmatic control over everything the CLI/API can do | `sdks/python` |
| **TypeScript SDK** | Same parity for TS/JS toolchains | `sdks/typescript` |
| **Extension SDK** | Author secure WASI-component plugins with typed capabilities | `sdks/extension-kit` |
| **Public API** | Local daemon exposing OpenAPI-described REST + SSE; the *same* surface SDKs use | `crates/vx-api` |
| **Package Builder** | Reproducible project/bundle artifacts (`.vxn`) with manifests and signature support | `crates/vx-package` |
| **Documentation** | Docs authored once, rendered three ways: web book, terminal help, LLM-consumable corpus | `docs/` |

### 2.2 What Vaerion is NOT (v0.1)

- ❌ Not an IDE or editor. (Editors integrate via API/extension.)
- ❌ Not a chat app. Chat is an *input mode* of the agent runtime, not a product center.
- ❌ Not a model host. Inference stays at providers/local servers; we route, never run.
- ❌ Not a cloud service. No accounts, no telemetry-by-default, no phone-home.
- ❌ Not an MCP *server* in v0.1 — the AI Runtime *consumes* MCP servers as tools in v0.1;
  Vaerion exposing its own tools over MCP is deferred post-GA.
- ❌ Not a build system replacement. `buildTargets` orchestrate *your* existing toolchain.
- ❌ Not multi-user. One user, one machine; authz = file permissions + broker consent.

### 2.3 Doctrine borrowed from systems we admire

| Ancestor | What we take | How it shows up here |
|---|---|---|
| Git | Content-addressed determinism; plumbing vs porcelain | Core is library-first; CLI/UI are porcelain over stable plumbing; content hashes everywhere |
| Docker | Immutable bundles + declarative manifest | `.vxn` bundle = image analogue; `vaerion.yaml` = recipe analogue |
| Cargo/Bun/uv | One verb feel; lockfiles; fast cold start | `vae init/run/test/pack`; `vaerion.lock`; §10 startup budgets |
| Kubernetes | Declarative desired state + reconcile loops | Workflows reconcile toward YAML-declared state with retry policies |
| VS Code Extension API | Capabilities granted, not ambient powers | Extension permission model (§9.4) |
| Rust compiler UX | Errors that teach (`E0308` culture) | Diagnostic catalog `E####` + fix hints (§11.3) |
| curl / jq | `--json` machine mode honored forever | Every command has stable `--json` output (§7.6) |

---

## 3. Objectives

### 3.1 Functional objectives

- **OBJ-F1** — Every v0.1 pillar in §2.1 delivered working end-to-end on macOS, Linux, Windows.
- **OBJ-F2** — `vae init && vae dev` produces a running, observable, agent-capable project in ≤ 90 seconds.
- **OBJ-F3** — Behavior parity across CLI ⇄ HTTP API ⇄ Python SDK ⇄ TypeScript SDK (tested, not assumed).
- **OBJ-F4** — Non-interactive mode safe by default: no prompt, no ambiguity, no hidden mutation.

### 3.2 Quality objectives (measurable budgets)

| ID | Objective | Budget |
|---|---|---|
| OBJ-Q1 | Binary size | ≤ 25 MB per platform (~9 MB gzipped) |
| OBJ-Q2 | Cold-start latency | ≤ 60 ms p50 any CLI command before work begins |
| OBJ-Q3 | Hot-path overhead | Core adds < 8 ms p50 / < 25 ms p99 over provider round-trip |
| OBJ-Q4 | Memory footprint | ≤ 120 MB RSS during active indexing; < 45 MB idle daemon |
| OBJ-Q5 | Index throughput | ≥ 12 k files/min typical mixed repo; resumable; cancel-safe |
| OBJ-Q6 | Test coverage gates | Core crates ≥ 85% line; 100% of PermissionBroker decision paths |
| OBJ-Q7 | Zero secrets exposure | No plaintext secret ever printed/logged/cached/serialized — asserted in fuzz tests |

### 3.3 Non-goals for v0.1 (hard boundaries)

Cloud sync/auth/team features · marketplace/publishing infrastructure beyond a local export/import
stub · fine-tuning/training management · GPU inference hosting · GUI beyond rich ANSI terminal
rendering · remote collaboration.

---

## 4. Requirements

Requirements are ID-stamped so tests, tasks, and traces can cite them.

### 4.1 Functional requirements

**Runtime**
- **R-RT1** Event bus delivers ordered at-least-once envelopes `(seq, type, ts, trace_id)`; subscribers attach/detach dynamically without drops via replay-from-cursor.
- **R-RT2** Run journal persists every run to `.vaerion/journal/<run>.ndjson`; any run replays to identical final state given the same checkpoint snapshot.
- **R-RT3** Checkpoints capture resumable run state; resume works after process death (`Ctrl-C`, crash, reboot).

**CLI**
- **R-C1** All commands conform to global grammar (§11.1); `vae doctor` diagnoses install, config, keys, permissions, network reachability, extension health.
- **R-C2** Every interactive prompt has a non-interactive equivalent (`--yes/--json/-p path`); CI auto-detects absent TTY and fails fast instead of hanging.

**Project Intelligence**
- **R-PI1** Incremental symbol index via tree-sitter grammars; Tier-1a languages listed in §5.6.
- **R-PI2** Dependency/containment graph updates < 150 ms on typical single-file change.
- **R-PI3** Semantic store: chunks + embeddings persisted locally (SQLite WAL + vector column); rebuild-safe via fingerprinted deltas.
- **R-PI4** Context packs assembled under token budgets with full provenance (which files/symbols included/excluded and why).

**AI Runtime**
- **R-A1** Agents defined declaratively (`agents/*.yaml`) or programmatically execute through one AgentExecutor with cancellation, timeout, retry policy hooks.
- **R-A2** Tool calling normalized across provider-specific native formats onto the event spine.
- **R-A3** Workflows run DAGs with fan-in/out, conditionals, per-node failure policy (`halt|continue|retry(n)|fallback_agent`), concurrency caps.
- **R-A4** Human-gate nodes pause/resume runs; answers arrive from stdin or API; survives process restarts.
- **R-A5** Eval harness runs golden-task suites offline against recorded cassettes/seeded MockBrain; scorecards fail CI on regression thresholds.

**Model Gateway**
- **R-MG1** Provider adapters fully normalize chat/completion/embed/rerank ops with streaming as canonical form.
- **R-MG2** Per-provider retry/backoff/circuit-breaking with jitter; respects configured rate-limit profiles.
- **R-MG3** Token+cost accounting attached to every call; rolled up per run/agent/workflow/tag.
- **R-MG4** Secrets resolved exclusively at call time from OS keychain or env indirection — never stored in project state.
- **R-MG5** Redaction middleware scrubs known-secret patterns from outbound payloads/logs.

**SDKs & API**
- **R-S1** SDKs generated against `spec/openapi.json`; transport is embedded-daemon spawn (stdio loopback) or HTTP/SSE attach to running daemon.
- **R-S2** Daemon binds loopback by default; one-time pairing bearer token shown once at first serve unless pre-provisioned headlessly via `VAE_TRUST=<token>`.

**Extensions**
- **R-X1** Extensions are WASI Preview 2 components loaded only after digest verification against pinned hashes in `vaerion.lock`.
- **R-X2** Every privileged extension call crosses the capability broker synchronously; denials surface as loud structured events.
- **R-X3** Extension crash isolation guaranteed — a panicking extension tears down zero core state.

**Packages**
- **R-P1** `vae pack` builds reproducible `.vxn` bundles (zstd tarball + BLAKE3 tree-hash manifest) honoring explicit ignore sets.
- **R-P2** `vae verify` validates integrity and optional sigstore signatures; `vae import` refuses collisions beyond configured strategy (`refuse|merge|new-dir`); `publish` returns explicit "registry out of scope" notice plus a conformant export stub.

### 4.2 Non-functional requirements

| NFR | Requirement | Verification |
|---|---|---|
| NFR-Portability | Static/minimal-dep binaries for macOS(x64/arm64), Linux(x64/arm64 musl), Windows x64 | Release CI matrix + smoke tests |
| NFR-Determinism | Index ordering, pack assembly, diff computation byte-reproducible for identical inputs+fingerprint | Golden-file property tests |
| NFR-Latency-visibility | Long ops emit progress events at ≤ 100 ms intervals | Integration assertion |
| NFR-Crash-safety | kill -9 mid-op leaves project usable; journals/checkpoints recover | Chaos suite (§12.4) |
| NFR-Observability | `--trace` emits OTLP-compatible spans locally; never exported remotely by default | Unit test + doc test |
| NFR-Upgradability | Spec/schema changes gated behind compatibility CI incl. golden fixtures from previous minor | CI compat job |
| NFR-Terminal-a11y | Honors `NO_COLOR` / `TERM=dumb`; clean plain-text output | Snapshot fixture suite |
| NFR-i18n | UTF-8 throughout; grapheme-aware truncation everywhere | Property corpus |

### 4.3 Constraints & assumptions

- Team of ~8–10 engineers over ~6 months to GA (allocation §15.2).
- GA providers: Anthropic, OpenAI, Ollama; adapter trait open for community additions.
- WASI Preview 2 deemed stable enough for plugin ABI (contingency R-2 documented).
- Tiered language support accepted as intelligence-quality trade-off (§5.6).

---

## 5. Architecture

### 5.0 The three load-bearing ideas

Everything below derives from three pillars; if a future proposal conflicts with one of them it needs an ADR, not a workaround:

1. **Source-of-truth chain** — `vaerion.yaml` → `vaerion.lock` → `spec/` contracts (schemas/OpenAPI/WIT). Truth flows one direction; caches derive and fingerprint.
2. **Event spine** — one ordered bus of versioned envelopes feeding CLI renderers, HTTP streams, SDK iterators, journals/replays, evals. Interfaces are projections.
3. **Permission broker** — every privileged operation (fs/net/exec/model/secret/tool) mediated identically regardless of caller (human CLI, agent, extension). Enables uniform auditability and prompt-injection containment.

### 5.1 Layer model & module boundary law

Strict unidirectional layering. **No layer skips beneath its allowed targets; no upward imports except event subscriptions.**

```
L4  Porcelain surfaces : vx-cli · sdks/* · docs generators
L3  Public API         : vx-api (axum) — serde mapping onto L2 services only
L2  Domain services    : agent · workflow · context · intel · ext-host · package
L1  Primitives         : gateway · tools · capabilities(broker) · store(journal/blob/kv/vector)
L0  Foundation         : config · foundation(envelope/errors/ids/clock) 
```

Dependency edge rules (enforced in CI by `xtask layerlint`):

| From ↓ To → | L0 | L1 | L2 | L3/L4 |
|---|---|---|---|---|
| L0 | — | ✗ | ✗ | ✗ |
| L1 | ✅ | — | ✗ | ✗ |
| L2 | ✅ | ✅ | — | ✗ |
| L3 | ✅ | types-only | ✅ | — |
| L4 | ✅ | ✅ | contract types via L3 schemas only* | ✅ |

\* `vx-cli` deliberately consumes L3 contract types rather than L2 internals so the CLI exercises exactly what external users get — an "API gap" becomes impossible by construction.

Properties purchased cheaply by this split:

1. Headless forever — a composition root with no CLI at all exists (SDK/editor hosts).
2. Each crate unit-testable behind port traits with mock neighbors.
3. New provider/tool/sink = registry registration, zero core edits.

### 5.2 Crate map & ownership

| Crate | Layer | Owns | Must NOT know about |
|---|---|---|---|
| `vx-foundation` | L0 | envelope schema, error codes E####, ULID ids, clock abstraction, redaction utils | everything above |
| `vx-config` | L0 | parse/validate/merge `vaerion.yaml` hierarchy, defaults, migrations | writes beyond fs read |
| `vx-store` | L1 | SQLite WAL persistence: kv, blob CAS, journal NDJSON append, sqlite-vec vectors | domain meaning of data |
| `vx-capabilities` | L1 | PermissionBroker, capability structs, consent ledger, audit writer | who calls it |
| `vx-tools` | L1 | builtin tools (fs/grep/glob/exec/watch) behind ToolProvider trait | agents/models |
| `vx-gateway` | L1 | ModelProvider trait, adapters (anthropic/openai/ollama), stream normalization, breaker pool, metering/redaction | agents/workflows |
| `vx-intel` | L2 | indexer pipelines (symbols/graph/chunks/vectors), query DSL | agents, model names |
| `vx-context` | L2 | token budgeter, pack assembler, provenance manifests | how ranking works (delegates to intel) |
| `vx-ext-host` | L2 | wasmtime runtime, component loader, host-fn bridge onto broker/tools | guest languages |
| `vx-workflow` | L2 | DAG parse→plan→schedule, node executors (agent/human/tool), checkpoints integration | model adapter details |
| `vx-agent` | L2 | AgentExecutor loop (think→act→observe), planner/memory ports, transcript codec | CLI rendering |
| `vx-package` | L2 | `.vxn` build/sign/verify/import/export, reproducibility rules | runtime execution |
| `vx-api` | L3 | axum router onto L2 services, SSE hub, OpenAPI emission, auth middleware | business logic |
| `vx-cli` | L4 | clap command graph, TTY/plain/JSON renderers, doctor, completions | service internals |

### 5.3 Technology selection & explicit trade-offs

| Decision point | Chosen | Rejected alternatives | Killer reasons |
|---|---|---|---|
| Core language | **Rust** | Go, Node/TS, Zig | Single static cross-platform binaries; fearless parallelism in indexer; native home of wasmtime/WASI component ecosystem; criterion benchmarks first-class |
| Async runtime | **tokio** | thread-per-core stacks | Ecosystem breadth (axum/hyper), mature debugging/profiling, plenty for local scale |
| HTTP server | **axum + tower** | actix-web | extractor ergonomics map cleanly onto service traits; Tower middleware composability for auth/redaction chains |
| Storage | **SQLite WAL + FTS5 + sqlite-vec** | bundled Postgres, LMDB, sled | zero-config local; ubiquitous recovery tooling; adequate vec performance ≤ ~1M vectors with HNSW roadmap |
| Parser infra | **tree-sitter incremental** | bespoke per-language analyzers | polyglot coverage; cursor-based delta updates cost O(edits) |
| Plugin ABI | **WASI Preview 2 components (wasmtime)** | Node worker pools, subprocess RPC, Go plugins | real fault isolation + cross-language authorship + digest-pinnable supply chain; subprocess fallback kept behind `ext-subprocess` feature flag for contributor ergonomics |
| CLI parser | **clap v4 derive** | hand-rolled | completions generation + battle-tested UX |
| Config format | **YAML strict subset ("VaerYaml")** + JSON Schema | TOML, CUE, JSON5 | best AI-comprehension prior + comments retained; anchors/aliases/multi-doc banned to kill YAML footguns; CUE reconsideration trigger noted (ADR) |
| Contract codegen | **JSON Schema ⇒ datamodel-codegen (py) + typeshare (ts)** | hand-synced enums | single source of truth; nightly contract-diff CI job blocks drift |
| Secret storage | **OS keychain (keyring crate)** + env-indirection fallback | dotfiles, custom encrypted vault (v0.1) | default-safe with least machinery; vault possible later behind same port trait |
| Observability | **tracing** (+OTLP exporter compiled-in, off by default) | custom logger | subscriber model mirrors the event spine naturally |
| Errors | **thiserror + stable code catalog** | anyhow-everywhere | E#### codes power doctor hints, i18n, AI-fix prompts |
| AI nondeterminism testing | **recorded cassettes + seeded MockBrain virtual provider** | live-only evals | deterministic PR-CI; weekly shadow suites against live models flag drift report-only |

Anticipated critique — *"why not TypeScript end-to-end since AI devs love TS?"* — Because the product is a runtime engine with hard latency/memory/binary-size/sandbox goals; Node cannot give us single-binary no-runtime distribution nor true wasm isolation hosting at predictable cost. Our TS-first posture lives where users touch us: YAML config, MCP interop, TS/Python SDKs, and extension authoring in TypeScript compiled via jco to Wasm components.

### 5.4 Cross-cutting concerns

- **Configuration resolution order** (later wins): defaults → `~/.config/vae/config.yaml` → profile overlay (`--profile work`) → `./vaerion.yaml` → env vars (`VAE_*`) → CLI flags. Result hashed into every RunManifest (`config_fingerprint`).
- **Identity**: all entities carry ULIDs (`crn_run_…`, `crn_node_…`, `crn_ext_…`); monotonic sortability enables journal stitching + cursor pagination identical on every surface.
- **Errors**: stable codes `E####` defined once in `spec/errors.yaml`; Rust enums derive from it; docs generate from it; doctor matches on it.
- **Versioning**: semver for binaries; spec contracts get independent additive-only evolution with deprecation windows (two minors) before removal at majors.
- **Time & determinism**: clock/id injectable via ports; user-visible reproducibility achieved via fingerprints + seeds recorded in journals.

### 5.5 State stores inventory

| Store | Location | Format | Lifetime | Backup story |
|---|---|---|---|---|
| Config cache | `.vaerion/cache/` | JSON fingerprints | disposable | rebuild automatically |
| Symbol/graph DB | `.vaerion/db/intel.sqlite` | SQLite WAL | disposable (`vae intel rebuild`) | disposable |
| Semantic chunks/vectors | `.vaerion/db/semantics.sqlite` | SQLite WAL + vec column | disposable (re-embed) | disposable |
| Run journals | `.vaerion/journal/*.ndjson` | NDJSON envelopes | durable (user-prunable) | user data |
| Blob CAS | `.vaerion/blobs/blake3/**` | files | GC-managed via pack refs | user data |
| Audit ledger | `.vaerion/audit.log` | hash-chained NDJSON | durable | user data |
| Keyring entries | OS keychain (`service=vae`, account=profile) | opaque | durable | OS-managed |
| Lockfile | `./vaerion.lock` (project root; committed) | canonical JSON | source-controlled | committed |

### 5.6 Language tiering for Project Intelligence

| Tier | Coverage | Graph precision | Notes |
|---|---|---|---|
| Tier-1a (shipped grammars) | TypeScript, JavaScript, Python, Go, Rust, TSX, CSS, JSON, HTML, Markdown, Bash, TOML/YAML | High (imports + callsite heuristics) | rich chunker + symbol grid |
| Tier-1b (shipped grammars) | Java/Kotlin/C#/C++/Ruby/PHP/HCL/Dockerfile | Medium (heuristic) | standard chunking |
| Tier-2 (community/later) | everything else | progressive | graceful text-level retrieval fallback |

Doctrine: unsupported languages never error — they degrade to line-window chunking + BM25 retrieval so mixed repos still function.

---

## 6. Folder Structure

### 6.1 Repository (monorepo)

```
vaerion/
├── Cargo.toml                    # workspace manifest (resolver = "2")
├── rust-toolchain.toml           # pins MSRV-documented stable channel
├── deny.toml                     # cargo-deny: licenses/advisories/bans
├── clippy.toml                   # lint baseline (pedantic subset)
├── justfile                      # just recipes: setup/dev/lint/test/bench/site
├── .github/
│   ├── workflows/                # ci.yml release.yml security.yml bench-gate.yml nightly.yml site.yml
│   └── pull_request_template.md  # includes threat-model references + spec-impact checkboxes
├── xtask/                        # automation: codegen, layerlint, goldens-bless, changelog, hygiene
├── crates/                       # exactly the §5.2 table
│   ├── vx-foundation/  vx-config/  vx-store/  vx-capabilities/  vx-tools/
│   ├── vx-gateway/  vx-intel/  vx-context/  vx-ext-host/
│   ├── vx-workflow/  vx-agent/  vx-package/  vx-api/  vx-cli/
├── spec/                         # ★ VERSIONED CONTRACTS — single source of truth
│   ├── openapi.json
│   ├── schemas/                  # vaerion-yaml.schema.json, envelope.schema.json, …
│   ├── events/                   # event type registry + payload schemas (ADR-002)
│   ├── errors.yaml               # diagnostic catalog E0000–E9999 with remediation copy
│   ├── wit/                      # WIT world definitions for extensions
│   └── CHANGELOG-SPEC.md         # spec semver history + migration notes
├── sdks/
│   ├── python/                   # src/vaerion/, pyproject.toml, pytest parity suite
│   ├── typescript/               # src/, vitest parity suite, tsup build
│   └── extension-kit/            # @vaerion/ext-kit npm pkg + templates + jco toolchain glue
├── examples/
│   ├── quickstart-agent/         # referenced by tutorials verbatim
│   ├── workflow-triage-py/
│   └── extension-hello-wasm/
├── docs/
│   ├── adr/                      # numbered immutable ADR markdown
│   ├── src/                      # mdBook sources (SUMMARY.md)
│   └── llms/                     # generator producing llms.txt / llms-full.txt
├── fixtures/                     # golden fixtures shared by tests + evals
├── benches/                      # criterion benches wired to §10 budgets
└── scripts/                      # install.sh, ci helpers, release glue
```

### 6.2 User-facing project layout (`vae init` output)

```
my-app/
├── vaerion.yaml              # required; validated on every command
├── vaerion.lock              # generated; committed
├── .vaerion/                 # machine state (auto-gitignored)
│   ├── db/ blobs/ journal/ cache/ tmp/
├── .vaerionignore            # optional excludes (gitignore syntax superset)
├── agents/*.yaml             # recommended convention
├── workflows/*.yaml          # recommended convention
├── prompts/                  # system-prompt files referenced by agents
├── extensions/               # pinned .wasm artifacts (digests live in lock)
├── tests/golden/             # optional eval tasks consumed by `vae eval`
├── PROJECT.md                # init-generated orientation file used by bootstrap contexts
└── reports/                  # default output dir for report-writing workflows (gitignored)
```

### 6.3 Structure-protection rules

1. New crate ⇒ RFC-lite PR updating §5.2 + layerlint edges. No drive-by crates.
2. `spec/` changes require two CODEOWNERS approvals (contract discipline).
3. TODOs older than 90 days fail `cargo xtask hygiene` (forces triage).
4. Generated code always carries a `#[codegen]` header naming generator + spec commit.

---

## 7. Interfaces

The minimal stable set others implement against. Full payloads live in `spec/`; shapes here are normative summaries.

### 7.1 `vaerion.yaml` — canonical v0.1 skeleton

```yaml
schemaVersion: "0.1"                    # required; supported range validated

project:
  name: my-service                      # ^[a-z][a-z0-9-]{1,62}$
  description: "Triages incidents"
  license: Apache-2.0                   # SPDX id

language:
  primary: typescript                   # tier key, §5.6
  extras: [python]
framework:
  kinds: [node-web-api]                 # advisory metadata steering intel/context defaults
  versions: { node: ">=22" }

models:                                 # logical endpoints — never credentials
  primary:
    provider: anthropic                 # anthropic | openai | ollama
    id: claude-sonnet-4-20250514
    limits: { rpm: 40, tpm: 80000, dailyCostUSD: 15 }
  embeddings:
    provider: ollama
    id: nomic-embed-text:v1.5

agents:
  triage:
    extends: default-planner            # inherit + override toolkit
    systemPromptFile: ./prompts/triage.md   # file-based, diffable, reviewable
    models: { main: primary, fallback: fast }
    tools: [fs.read, fs.write, grep.search, exec.run]   # grants scoped per-agent
    autonomy:
      maxSteps: 24
      requireApprovalFor: [fs.write, net.any]
      stopOnConsecutiveFailures: 3

workflows:
  incident-triage:
    trigger: { kind: manual }           # manual | watch(paths) (webhook = post-GA)
    steps:                              # ordered DAG; implicit linear edges; `needs:` fans
      - id: scan
        agent: triage
        input: { bundle: "{{ event }}" }   # limited template substitutions; no eval
      - id: report
        needs: [scan]
        tool: fs.write
        args: { path: "reports/{{ now_date }}.md" }
        failurePolicy: retry(2)

permissions:                            # cumulative ceilings (never widened elsewhere)
  fs:
    read: ["$PROJECT"]
    write: ["$PROJECT/src/**", "$PROJECT/tests/**", "$PROJECT/reports/**"]
  net:
    allowHosts: ["api.anthropic.com"]   # host[:port]
  exec:
    allowCommands: [["git", "*"], ["npm", "test:*"]]
  secrets:
    grant: [{ name: ANTHROPIC_API_KEY, to: [gateway] }]   # name never value

extensions:
  - ref: file://extensions/naming-helper.wasm
    digest: sha256-…                    # must equal lockfile pin
    capabilities: [intel.query]         # minimal-request principle enforced

intelligence:
  embeddingModel: embeddings
  maxIndexBytes: 200000000

buildTargets:                           # orchestrates existing toolchains only (§2.2 non-goal note)
  test: { cmd: "npm test -- --run" }
  lint:  { cmd: "npm run lint" }

testing:
  preferredFrameworks: [vitest]
  useVaerionEvals: true

telemetry:
  enabled: false                        # default false; init asks explicitly when enabling
```

Validation behaviors: unknown-key rejection (drift guard); `$VAR` expansion restricted to `$PROJECT|$HOME|$TMP`; glob grants statically checked against usage sites at load time; lockfile records resolved digests/fingerprints.

### 7.2 Stable Rust ports (selection)

```rust
// vx-foundation::ports
#[async_trait::async_trait]
pub trait EventSink: Send + Sync {
    fn accepted(&self) -> &EventTypeFilter;
    async fn send(&self, ev: Envelope) -> Result<(), EventError>;
}
pub trait IdGen: Send + Sync { fn next(&self) -> Ulid; }
pub trait Clock: Send + Sync { fn now(&self) -> SystemTime; }

// vx-gateway
pub enum StreamDelta {
    Text { utf8: String },
    Reasoning { summary: Option<String> },        // surfaced, never executed
    ToolCallOpen  { id: CallId, name: SmolStr },
    ToolCallArgsDelta { id: CallId, bytes_jsonfrag: Bytes },
    ToolCallClose { id: CallId },
    Usage { input_tokens: u32, output_tokens: u32 },
    Done { finish_reason: FinishReason },
}
#[async_trait::async_trait]
pub trait ModelProvider: Send + Sync {
    fn descriptor(&self) -> &'static ProviderDescriptor;
    async fn health(&self) -> HealthReport;
    async fn invoke_chat(&self, req: ChatRequest, ctx: CallCtx) -> BoxStream<'static, GatewayEvent>;
    async fn invoke_embed(&self, req: EmbedRequest, ctx: CallCtx) -> Result<EmbedResponse, GatewayError>;
}
pub struct CallCtx { pub tenant: ProfileId, pub purpose: Purpose, pub budget: CostBudget,
                     pub trace_id: TraceId, pub caps_broker: Arc<dyn PermissionBroker> }

// vx-tools
#[async_trait::async_trait]
pub trait ToolProvider: Send + Sync {
    fn specs(&self) -> Vec<ToolSpec>;
    async fn check(&self, call: &ToolCallRequest, caps: &CapabilitySet) -> Result<(), DenialReason>;
    async fn execute(&self, call: ToolCallRequest, ctx: ExecCtx) -> Result<ToolResultV1, ToolError>;
}

// vx-capabilities
#[async_trait::async_trait]
pub trait PermissionBroker: Send + Sync {
    async fn evaluate(&self, req: PrivilegeRequest<'_>, principal: Principal)
        -> BrokerDecision;                       // Allow | Deny{reason_code} | PromptNeeded{id}
    async fn resolve_prompt(&self, pending: PendingId) -> BrokerDecision;
    fn audit_handle(&self) -> AuditWriter;       // every evaluate() lands in ledger, allow or deny
}

// vx-agent
#[async_trait::async_trait]
pub trait Planner: Send + Sync {
    async fn plan(&self, goal: &Goal, view: &ContextView) -> PlanDraft;
}
#[async_trait::async_trait]
pub trait MemoryScope: Send + Sync {
    async fn recall(&self, q: RecallQuery<'_>) -> Vec<MemoryHit>;     // run/session/project tiers
    async fn remember(&self, fact: MemoryFact<'_>) -> Result<(), MemErr>;
}

// vx-intel
#[async_trait::async_trait]
pub trait IndexEngine: Send + Sync {
    async fn update_delta(&self, patch: FsPatch) -> Result<IndexStats, IntErr>;
    async fn query(&self, q: IntelQuery) -> Vec<RankedHit>;           // hybrid BM25 ⊕ vector ⊕ graph boost
}

// vx-ext-host
#[async_trait::async_trait]
pub trait ExtensionHost: Send + Sync {
    async fn load(&self, artifact: ExtArtifact) -> Result<ExtInstance, ExtLoadError>;
    async fn unload(&self, handle: ExtHandle, deadline: Instant) -> UnloadOutcome;
}

// vx-workflow
#[async_trait::async_trait]
pub trait NodeExecutor: Send + Sync {
    fn handles(&self, kind: NodeKind) -> bool;
    async fn run(&self, nctx: NodeCtx, input: NodeInput) -> Outcome<NodeOutput, FailureClass>;
}
```

Contract invariants worth stating outright:

- `ToolProvider::execute` may only fire after a broker `Allow` — enforcement lives in the shared executor wrapper that owns the broker; individual tools cannot bypass it structurally.
- Every `GatewayEvent` has already passed redaction middleware before publication.
- ULID-first IDs make cursors/journal replay stitching semantics identical across CLI/API/SDK.

### 7.3 Public HTTP API (local daemon)

Default bind `127.0.0.1:7897` (or unix socket `%XDG_RUNTIME_DIR%/vae.sock`; Windows named pipe `\\.\pipe\vae-api`). Full payload reference = generated `spec/openapi.json`.

| Group | Routes | Notes |
|---|---|---|
| meta | `GET /health` `GET /version` `GET /openapi.json` | unauthenticated (loopback constraint suffices) |
| sessions | `POST /sessions` `DELETE /sessions/{id}` | ephemeral scratch workspaces |
| runs | `POST /runs` `{kind: agent\|workflow\|tool}` → `201 Location: /runs/{id}` · `GET /runs/{id}` · `POST /runs/{id}/cancel` · `POST /runs/{id}/answer` (human gates) | events streamable at `/runs/{id}/events?cursor&follow` |
| events | `GET /events?types&follow` (global tail) · SSE framing §7.4 | replay-from-cursor honored (R-RT1) |
| models | `GET /models` `GET /models/{logical}` (health/limits/cost rollup) | mirror of gateway registry |
| tools | `GET /tools` | intersection with current capability set |
| intel | `GET /intel/status` `POST /intel/reindex` `POST /intel/query` `POST /context/packs` (dry-run assembly, zero spend) | provenance manifest included |
| packages | `POST /packages/pack` `POST /packages/verify` `POST /packages/import` | progress via SSE stream |
| admin | `POST /shutdown` (token echo guard) | hygiene |

AuthN/Z: loopback bind + first-run pairing token (printed once, clipboard-copied); subsequent calls `Authorization: Bearer`. Remote binds refused unless explicit `--listen-all` + certificate override + printed risk banner.

### 7.4 Envelope shape (canonical across SSE/NDJSON/SDK/journal)

```json
{"v":1,"type":"tool.call.completed","seq":41,"ts":"2026-02-11T09:00:03.184Z",
 "trace_id":"t_a1f95c86d7","span_id":"s_7d21",
 "payload":{"tool":"fs.write","path":"/src/x.ts","bytes_delta":128}}
```

Rules: `v` additive-only (minor field additions allowed within v1); unknown `type`s are forwarded untouched by intermediaries (forward-compat duty); `seq` monotonically orders per run.

### 7.5 SDK excerpts (parity evidence style)

Python:

```python
import vaerion as vr

vr.cfg(profile="work")
with vr.project(".") as proj:
    hits = proj.intel.query("where is retry backoff handled?", limit=8)
    pack = proj.context.build(goal="patch retry backoff", budget_tokens=4000)  # PackPreview

for ev in vr.run.agent("triage", input={"issue": 114}, stream=True):
    if ev.type == "model.text.delta":
        print(ev.payload.text, end="", flush=True)
```

TypeScript:

```typescript
import { VaeClient } from "@vaerion/sdk";
const vae = new VaeClient({ profile: "work" });            // spawns/connects daemon
const run = await vae.runs.start({ kind: "workflow", name: "incident-triage" });
for await (const ev of vae.runs.stream(run.id)) {          // discriminated union, fully typed
  switch (ev.type) { /* exhaustive narrowing */ }
}
await vae.packages.verify("./dist/my-service.vxn");
```

### 7.6 Machine-mode promises (stable forever)

- `--json`: NDJSON envelope stream on stdout; pretty rendering exists only on TTYs.
- Exit codes: `0` ok · `2` usage · `3` broker-denied · `4` provider-down · `5` partial-with-repair-hint.
- Error messages embed stable codes + `Fix:` lines parseable by tooling and AI assistants alike.

---

## 8. Data Flow

### 8.1 Happy path walkthrough — agent stabilizes a flaky test

1. User runs `vae run agent triage --goal "stabilize payment-tests"`.
2. CLI builds `RunIntent` → POST `/runs` to daemon (or boots ephemeral in-process core if none).
3. Orchestrator creates run `crn_run_01J…` with immutable ContextManifest: git SHA + `config_fingerprint` + lock digest.
4. CAE queries intel (R-PI4): hybrid-ranked `payment.spec.ts` etc.; PackPreview enumerates includes/excludes with scores → provenance event emitted.
5. AgentExecutor loop iteration n:
   - Provider stream yields normalized deltas; model requests `fs.edit tests/payment.spec.ts`.
   - Broker intersects write scope; path inside grant → Allow; hash-chained audit line appended.
   - Patch applied; `tool.call.completed` envelope renders in TTY and flows SSE simultaneously (renderer is just another subscriber — parity by construction).
6. Loop ends with `Done{finish_reason:end_turn}`; token/cost rollups land in journal tail.
7. Journal closes chained checkpoint → `vae explain <trace_id>` can reconstruct narrative (and would-be branches where gates answered differently).

Failure interleave (same timeline): a first attempt editing outside scope yields BrokerDeny which the executor converts into an observation (`denied(path, reason)` fed back to the model) instead of aborting — self-correction affordance while staying hard-enforced.

### 8.2 Watch-mode intelligence refresh

inotify/FSEvents/ReadDirectoryChangesW → debounce (250 ms adaptive under churn) → FsPatch diff → rayon workers re-parse increments (tree-sitter) → symbol rows upsert into FTS → changed-chunk coalescing queue → embedding batches (local ONNX preferred) → transactional vector update → `intel.updated` envelope → active context packs invalidated conservatively. Entire pipeline decoupled from foreground IO; nothing user-facing stalls.

### 8.3 Degraded-mode choreography

Provider outage mid-run → circuit breaker opens after consecutive failures within window → `ControlFrame{breaker_state:open,retry_at}` surfaces visibly → workflow node follows its failurePolicy (e.g., `fallback_model: fast`) while flagship recovers. Human gate pending + Ctrl-C → checkpoint persisted *before* teardown; relaunch offers `vae resume crn_run_…` restoring the pending question idempotently.

### 8.4 Package flow

`vae pack --out dist` → scan (gitignore + .vaerionignore) → stage → zstd-chunk tar streaming → BLAKE3 tree manifest (+optional cosign detached signature) → `dist/my-service-0.1.0.vxn` with printed verification instructions. Consumer side `vae verify` reproduces digests, checks signatures, emits receipt events; `vae import` enforces collision strategy before materialization.

---

## 9. Security Considerations

### 9.1 Principals & identity space

| Principal | Anchor | Trust basis | Escalation |
|---|---|---|---|
| Local user | OS uid + keychain unlock | physical possession | is the authority |
| Daemon | loopback listener/socket | first-run pairing token | none by default |
| Agent run | `Principal::Agent(run)` transient | capability snapshot from config | only via human elevation gates |
| Tool | wrapped by executor | broker-mediated call site | no |
| Extension | component digest | lockfile pin (+optional cosign) | strictly yaml-granted caps |

### 9.2 Credential protocol

1. Resolution order fixed: explicit env (`ANTHROPIC_API_KEY` pattern) → OS keychain profile entry. Never read from project tree; `secrets.*` grants reference names, values never enter config.
2. Keys injected only at adapter send boundary into `Secret<T>` wrappers whose Debug/serde implementations print `[REDACTED len=N]` — making accidental serialization a compile-time arms race rather than a hope.
3. Rotation: `vae auth rotate` clears cached sessions; journals/audit entries never contain material (fuzz-asserted).

### 9.3 Prompt-injection containment stack

Indirect content (issues, fetched pages, indexed docs) may be hostile; layered defense:

- **Channel tagging** — every injected block carries `<untrusted src=…>` fencing through the whole pipeline.
- **Power separation** — instructions cannot mint authority; the broker sees config-derived caps only ("show me your secrets" ⇒ broker deny + explainable event).
- **Damping classes** — irreversible tools (force-push, delete-outside-tmp, email-send) escalate to explicit human confirm events.
- **Exfiltration tripwire** — egress middleware flags high-entropy blobs resembling recently-read secret-ish files heading to non-allowlisted hosts; halts loudly.
- Residual risk honestly accepted: social-engineering the *human* operator remains possible; doctor prints a human-in-loop briefing card.

### 9.4 Extension threat model checklist

| Vector | Mitigation |
|---|---|
| Malicious wasm reads arbitrary fs | no ambient preopens; fs only via granted broker calls |
| Network beaconing | net access only via granted `net.connect(host)` ∧ config allowlist |
| CPU spin / infinite loops | wasmtime epoch fuel quotas + wall-clock watchdog |
| Digest swap attack | loader refuses mismatch vs `vaerion.lock` pin |
| Instance spoofing | per-instance principal tokens minted at load |
| Malicious upgrade path | digest edits force visible lock diffs (audit-friendly) |

### 9.5 Supply-chain posture

cargo-vet audits + cargo-audit advisory gate; `deny.toml` license allowlist; release artifacts ship SBOM (CycloneDX) + SHA256SUMS signed; `unsafe` additions restricted to an explicit allowance table (currently: sqlite page-lock shim, windows named-pipe glue) with fuzz coverage; release CI blocks on secret scans.

### 9.6 Execution-sandbox matrix

| Platform | Mechanism | Caveat posture |
|---|---|---|
| macOS | Seatbelt profiles | solid scoping; path race notes documented |
| Linux | Landlock + unprivileged namespaces + seccomp | primary platform; poll fallback documented |
| Windows | AppContainer lowbox + Job Objects (best-effort) | degraded-mode banner until hardened (Q4 §19) |
| Opt-out | `exec.isolation: none` | permanence warning each run |

### 9.7 Audit trail

Hash-chained `.vaerion/audit.log` covers broker decisions, elevations, extension loads, lock changes; `vae audit show --since` renders; daemon start opportunistically verifies chain continuity — tamper alerts loudly but keep operating (silent bricking worse than noise for a local tool).

### 9.8 Review ritual

PR template demands threat-ID references touched; quarterly internal pen sprint against newest surfaces (extension loader, pack verification); security.yml green is a release blocker.

---

## 10. Performance Considerations

### 10.1 Startup waterfall (budget 60 ms p50)

| Stage | Budget | Technique |
|---|---|---|
| proc spawn + static init | 6–9 ms | static binary, lazy sections, panic abbreviations |
| arg dispatch | 1–2 ms | clap cold-start tuning |
| config resolve | 3–5 ms | mtime/hash-fingerprinted caches |
| daemon probe | 2 ms | fast dead-socket detection; else in-process boot path |
| total | ~18–25 typical / 60 ceiling | headroom preserved |

### 10.2 Index economics (bench rig: M2-Pro-class hardware; numbers tracked in benches/)

| Stage | p50/file | Dominant cost | Mitigation |
|---|---|---|---|
| parse tier-1a | 2–4 ms | cpu | rayon lanes = cores/2 keeps interactive snappy |
| symbol extract | 0.5 ms | alloc | arena allocators |
| chunk + FTS row | 0.8 ms | sqlite txn | 64-item grouped commits, WAL NORMAL |
| embed (local int8 ONNX small model) | 3–6 ms | cpu vector ops | batch 96; provider-embed only if user opts in |
| delta apply (single file change) | ≤ 35 ms end-to-end | mixed | satisfies R-PI2 with margin |

Single-file graph refresh budget < 150 ms p95 (R-PI2 verified in bench-gate).

### 10.3 Streaming latency

Normalization adds zero buffering beyond frame parsing; SSE flush immediate (TCP_NODELAY); SDK iteration lazy. Core hot-path overhead target < 8 ms p50 / < 25 ms p99 (OBJ-Q3) measured by gateway round-trip bench with mock servers.

### 10.4 Memory discipline

Per-subscriber bounded ring buffers (drop metrics warn — journal never truncated silently); SQLite page cache capped (~32 MB); embedding batch sizing respects RSS watermark; idle daemon compacts hourly toward the < 45 MB objective.

### 10.5 Benchmarks as merge gates

Criterion suites in `benches/` wired to CI; > 10 % regression on tagged critical benches blocks merges absent a `bench-exception` label + lead signoff. Pinned baselines recorded per release tag for trend archaeology.

---

## 11. Developer Experience

### 11.1 Command grammar (top-level surface at GA)

```
vae [--profile P] [--cwd DIR] [--json|--plain]

init · dev · serve · stop · doctor · config get|set|path · upgrade

run agent NAME [-g GOAL] [--input KV]… [--dry-run] [--stream]
run workflow NAME [--input KV]… [--dot graph.dot]
run tool NAME [--args JSON]
resume RUN_ID [--answer JSON]

intel status|rebuild|query "…" [--explain]
context pack "goal…" [--budget TOK] [--preview]

models list|test|costs · auth login|status|rotate · secrets set|list|remove

agents validate|inspect|new · workflows validate|inspect|graph
eval run|report|record

ext list|add REF|remove NAME|info NAME · ext new NAME --lang rust|ts|go

pack [--out DIR] [--sign KEY] · verify FILE.vxn [--key PUB] · import FILE.vxn --into PATH

journal ls|show RUN|replay RUN · audit show|export · explain TRACE_ID
completions bash|zsh|fish|powershell
```

Every plural noun tabulates (`--json`), filters (`--filter k=v`), pipes sanely. Universal `--dry-run` semantics: zero side effects including metrics writes — honest purity people can script against.

### 11.2 Onboarding promise (measured, not vibes)

Minute 0–2 — install (script/brew/winget) + green `vae doctor`.
Minute 2–5 — `vae init --template quickstart-agent`: keychain seed + consent-gated $0.002 sample ping with cost preview.
Minute 5–15 — first `vae run agent demo` completes; emits diff preview + revert affordance snippet.
Stretch — extension scaffold compiles/registers hello world.
Docs sitemap anchors each step explicitly (§13 cross-links).

### 11.3 Error culture (E0308 pedagogy)

Stable code + what failed + why likely + `Fix:` actionable next steps + deep-dive link (`vae help E1010`). Doctor cluster-diagnoses conflicting configs with confidence labels. Causes never buried; chains rendered `↳ cause:` style. Full catalog generated from `spec/errors.yaml` into web docs + llms corpus.

### 11.4 Delightful-but-cheap touches

Cost sparklines per run; shell completions at runtime; theme-aware glyphs with emoji-free professional logs; quiet daemon (zero chatter unless asked); `VAE_SCRATCH=1` playground mode booting against fixture workspaces so contributors can't hurt real projects.

### 11.5 Contributor experience

just recipes replicate the entire CI matrix locally; devcontainer batteries included; good-first-issue auto-labeling mapped from failing-area tags; arch council ADR churn triaged weekly; PR template mechanically enforces Definition-of-Done pieces (§15.4).

---

## 12. Testing Strategy

### 12.1 Pyramid investment

| Band | Scope | Effort share | Tooling |
|---|---|---|---|
| unit | pure fns + port-mocked traits | 55 % | cargo-test + proptest |
| integration | crate pairs over real sqlite/tmpfs + fake providers | 25 % | axum-test clients, fixture dirs |
| contract | spec ↔ generated clients ↔ server golden bidirectional | 10 % | nightly regen diff + schemathesis-lite fuzz |
| e2e journeys | scripted CLI transcripts incl. chaos kill/resume | 7 % | hermetic runner (no docker dependency) |
| performance | budget benches gating merges | 3 % | criterion + hyperfine |

### 12.2 Hermeticity rules

Network access requires opt-in `live-net` feature (nightlies only for provider-drift checks). Zero direct `Utc::now()`/random sources outside ports (grep-linted in CI). Fixture-based clock/id injection mandatory through composition roots.

### 12.3 Property + fuzz campaigns

proptest invariants: broker cap-narrowing monotonicity; envelope codec roundtrip; pack budget adherence ≤ declared tokens ± ε; config schema stability across versions. Weekly cargo-fuzz targets: envelope parser, yaml validator, wasm loader edges.

### 12.4 Chaos suite (kill/resume correctness theater)

Harness SIGKILLs runs at randomized envelope indices asserting: journals replay cleanly, gates restore exact pending states, locks orphan-free. Guards ADR-006 continuously; failures block releases, not just PRs.

### 12.5 Golden governance

Fixtures regenerate only via explicit `cargo xtask goldens bless` with reviewer-rendered diffs posted on PRs automatically — review friction stays human-sized.

### 12.6 Eval harness (deterministic despite AI)

Golden tasks declare goal + assertions (files-touched subsets, forbidden mutations, cost ceilings, pass criteria). Runs offline against cassettes/MockBrain(seeded). Live provider shadow-suite weekly: report-only drift dashboards — CI oath stays hermetic.

---

## 13. Documentation Plan

| Track | Artifact | Audience |
|---|---|---|
| Tutorials | 01-init, 02-first-agent, 03-workflow — each ending working demo + pitfalls box | newcomer hour-one |
| Guides | models/auth, security posture, extension kit, packaging, intel tuning | operators |
| Reference | CLI autodoc (clap-derived), API autodoc (OpenAPI), config schema ref, WIT worlds ref, error-code catalog E#### searchable | integrators |
| Concepts | essays: event spine, broker model, tiered intel, checkpoint math | architects |
| ADR archive | numbered immutable decisions with supersede links | future maintainers |
| AI corpus | `llms.txt` + `llms-full.txt` generated from book on release tags | coding assistants |

Drift protection: broken-link checks, generated-reference-freshness gates (fails CI on mismatch), tutorial sandboxes executed nightly (NFR-Accuracy doc debt cannot accrue silently — paired with risk R-10).

---

## 14. Release & Distribution

Channels: GitHub Releases archives + signed SHA256SUMS + SBOM; Homebrew tap; winget manifest; npm `@vaerion/cli` binary shim; PyPI wheel bundling `vae` shim; cargo-binstall metadata embedded. Musl-static Linux builds make containerization trivial.

Cadence: monthly minors, biweekly patches as needed, RC cut ≥ 3 days prior with smoke matrix (ubuntu 22 / mac13 arm+x64 / win11). Update channels respect installer of origin (brew defers to brew; native updater gated off there). Every deprecated surface echoes migration URL during grace window spanning two minors minimum.

---

## 15. Delivery Plan

### 15.1 Milestones (24-week arc to GA)

| MS | Weeks | Focus | Exit criteria (DoD, enforced) |
|---|---|---|---|
| M0 Foundations | 1–3 | workspace + layerlint + CI floors; foundation crates; envelope v1; config+lock pipeline; error catalog seed | `vae init` scaffolds valid yaml+lock; envelope goldens; coverage floors live; ≥ 20 E-codes |
| M1 Runtime Spine | 3–5 | store trio; broker core + audit ledger; FsPatch watcher; run lifecycle + checkpoints | chaos kill/resume e2e green; doctor v1 useful |
| M2 Model Gateway | 5–7 | anthropic+openai+ollama adapters; normalize/streams; breaker pool; metering; secrets protocol hardened | provider parity streaming suite; cost rollups match console samples ±2%; redaction property-proof |
| M3 Project Intel | 7–10 | tier-1a grammars; incremental pipeline; fts+vec stores; CAE pack preview | OBJ-Q5 throughput met on rigs; pack previews provenance-complete; R-PI2 budget green |
| M4 Agents + Workflows | 10–13 | executor polish (retry/damping/elevation); DAG engine + human gates; eval recorder | cross-gate kill/resume; MockBrain determinism demo: identical-seed double-run yields identical journals |
| M5 Surfaces | 13–16 | CLI porcelain completion; daemon OpenAPI+SSE+pairing; Python/TS SDK gen + parity CI; extension-kit alpha (WIT locked; host fuzz-hardened) | SDK parity journey equals CLI baseline scripted; hello-extension compiles from rust+ts guests |
| M6 Packaging + Hardening | 16–20 | pack/sign/import flows; installer pipelines; docs sweep (book+tutorials+llms corpus); a11y NO_COLOR modes; perf double-check | SLSA-leaning receipts; beta cohort (≥10 testers) feedback burned down; a11y snapshots clean |
| GA Prep | 20–24 | burndown + launch collateral + staged rollout rehearsal | GO/NO-GO meeting minutes archived; release train rehearsed dry end-to-end |

### 15.2 Workstreams & staffing

WS-A Engine (store/broker/journal/runtime) ×2 · WS-B Intelligence ×1.5 · WS-C Gateway ×1 · WS-D Agents/workflows/evals ×1.5 · WS-E Surfaces (CLI/API/SDK/docs-DX) ×2 · WS-F Packaging/distribution ×0.5 + float · WS-G Security champion fractional continuous.

### 15.3 Standing cadence

Weekly arch council (ADR triage); milestone mid-review rehearsals; monthly retro feeding backlog transparently; compat-dashboard reviewed per release train.

### 15.4 Universal Definition of Done (per merged epic)

Code + tests + bench impact note + docs/reference sync + CHANGELOG-SPEC entry when contracts moved + threat-ID checklist links when privileged paths touched + rollout notes. Template-enforced missing-piece rejection.

---

## 16. Risks & Mitigations

Score I×L (1–5); ≥ 12 requires standing owner.

| ID | Risk | I×L | Mitigation | Contingency trigger |
|---|---|---|---|---|
| R-1 | Provider API churn burns Gateway maintenance | 4×4=16 | adapter isolation; nightly live-net drift suite; vendor preannounce tracking | last-known-good cassette mode externally flagged |
| R-2 | WASI-P2 shifts destabilize extension ABI | 4×3=12 | pin wasmtime minors; subprocess-fallback feature kept warm sharing broker semantics | flip fallback runtime preserving UX |
| R-4 | Windows exec-sandbox gaps undermine guarantees | 5×3=15 | loud degraded banners + docs chapter; seek specialist funding | platform-policy restriction documented prominently |
| R-5 | Novel prompt-injection bypass harms trust | 5×2=10 | layered containment (§9.3); disclosure playbook day-one; bounty soft-launch | rapid-response runbook drills |
| R-6 | Scope creep dilutes local-first soul | 4×3=12 | milestone gate reviews require ADR for boundary moves; CONTRIBUTING covenant | the covenant itself |
| R-8 | Small-team stretch across many surfaces | 3×4=12 | ruthless MVP pruning at gates; admittance test maps new ideas to pillar IDs | staffing re-plan at MS5 checkpoint |
| R-10 | Doc drift erodes credibility | 3×3=9 | generated-reference freshness gates; nightlies exercise tutorials | docs gate blocks release train mechanically |

Register re-scored at milestone retros; closed mitigations retire loudly.

---

## 17. Architecture Decision Records (ADRs)

Full texts in `docs/adr/`; digest:

| ADR | Title | Status |
|---|---|---|
| 0001 | Monorepo + cargo workspace single-version policy | Accepted |
| 0002 | Versioned event-spine envelope; additive-only evolution | Accepted |
| 0003 | Contract-first specs drive SDK generation | Accepted |
| 0004 | Centralized PermissionBroker mediates all principals | Accepted |
| 0005 | Tiered intelligence L0/L1/L2 progressive enhancement | Accepted |
| 0006 | Event-sourced run journals + checkpoint chaining | Accepted |
| 0007 | Strict-subset YAML dialect (VaerYaml) for manifests | Accepted |
| 0008 | SQLite+WAL+FTS5+sqlite-vec triad as local store | Accepted |
| 0009 | WASI-P2 components + capability broker substrate | Accepted (contingency R-2) |
| 0010 | Loopback daemon + pairing-token authn | Accepted |
| 0011 | tokio+axum+tower stack | Accepted |
| 0012 | Cassette/MockBrain hermetic eval methodology | Accepted |
| 0013 | OS-keychain-first secrets with env fallback | Accepted |
| 0014 | Stable diagnostics catalog E#### remediation-linked | Accepted |
| 0015 | Per-platform exec sandbox matrix + explicit degraded mode | Accepted |
| 0016 | Reproducible .vxn bundles zstd+BLAKE3(+cosign optional) | Accepted |
| 0017 | Reserved cloud-seam interfaces, intentionally unimplemented v0.1 | Draft |

---

## 18. Recommended Improvements to the Original Brief

Delivered faithfully, with four sharpenings proposed:

1. **Codify the compatibility covenant.** "Never sacrifice architecture for speed" deserves teeth: spec-level contracts (envelopes, schemas, exit codes, E-codes) governed like a protocol — additive-only minors, deprecation windows, eternal golden fixtures. An engine people automate against *is* a protocol.
2. **Make determinism a headline feature.** Journals, checkpoints, byte-stable packs, hermetic evals turn "AI-native" from vibes into a verifiable property. That's Vaerion's deepest differentiation versus assistant-style tools; bill it.
3. **Ship the `--dry-run` universe.** Pack previews, cost previews, `workflows graph --dot`, universal dry-runs — rehearsal safety is the largest trust-per-hour win available to a terminal-first product.
4. **Treat cloud as a designed plug, not a postponed thought.** ADR-0017 reserves ProfileRef indirection, package-export stubs, OTLP hooks — v0.1 stays pure-local while keeping the hosted/team ceiling architectural rather than bolt-on.

---

## 19. Decision Requests & Open Questions

Blocking M0 kickoff:

1. **Q1 CLI name** — propose `vae` (short/distinctive/types well). Alternatives weighed: `var` (collision), `vn` (impersonal), full `vaerion` (long). Approve?
2. **Q2 Edition grammar reserve** — reserve `schemaVersion` edition mechanics now, define only `0.1`? Recommended: yes.
3. **Q3 Extension-kit alpha guest languages** — Rust + TypeScript guests only at M5 (Go/Python guests post-GA)? Recommended: yes.
4. **Q4 Windows exec tools at GA** — degraded-mode ship with loud banners vs delay exec support on Windows? Recommended: degraded-mode ship.
5. **Q5 Update-check telemetry stance** — background update check default OFF; doctor banner when stale major detected? Recommended: OFF default.

Answers may arrive anytime before their governing milestone; Q1 is needed before M0 branch naming.

---

## 20. Appendix A — Glossary

| Term | Meaning |
|---|---|
| Envelope | Versioned event unit crossing spine/SSE/SDK/journal uniformly |
| Spine | Ordered internal event bus; single projection source for every surface |
| Pack | Assembled context bundle with budget + provenance manifest |
| Broker | PermissionBroker mediating privileges with audited decisions |
| CAS | Content-addressed storage keyed by BLAKE3 digests |
| Cassette | Recorded provider interaction replayed hermetically in tests/evals |
| MockBrain | Seeded pseudo-provider delivering deterministic responses for CI |
| Gate | Workflow human-input pause node persisting across restarts |
| Pairing | First-use token exchange between CLI/API client and daemon |
| Profile | Named credential/config scope selectable globally |
| WIT | WebAssembly Interface Types — extension contract language |
| VaerYaml | Strict subset dialect of YAML used by all manifests |
| MSRV | Minimum Supported Rust Version pinned via toolchain file |

---

*End of Master Blueprint v0.1 — awaiting sign-off to unlock M0 implementation.*
