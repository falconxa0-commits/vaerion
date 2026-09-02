# VAERION CONSTITUTION — v1.3

| | |
|---|---|
| **Document** | VAERION_CONSTITUTION_v1.3 — the ratified law of the Vaerion engine |
| **Status** | `RATIFIED — MATERIALIZED INTO REPOSITORY` |
| **Priority chain** | Constitution → Philosophy (P1–P11) → Stage decisions → ADR → code |
| **Amendment** | Founder authority only (see §9). No agent, reviewer, or contributor may amend. |
| **Implementation authority** | This repository is the executable expression of this document. Where code and law disagree, the law wins and the code is a defect. |
| **Supersedes** | v1.2 (retained unmodified at `VAERION_CONSTITUTION_v1.2.md` as historical record); v1.1 (retained unmodified at `VAERION_CONSTITUTION_v1.1.md`); v1.0 (retained unmodified at `VAERION_CONSTITUTION_v1.0.md`) |

> **Materialization note (provenance).** The constitutional design was ratified in the
> Founder's design sessions and is hereby materialized into the repository as the
> single source of truth for implementation. Should any discrepancy be found between
> this text and the ratified session record, the ratified record prevails until the
> Founder reconciles it through the amendment procedure (§9).

---

## 1. What Vaerion Is

Vaerion is an **AI-native development engine**: the local, deterministic, auditable
substrate where human developers, AI agents, models, tools, extensions, and SDKs meet
and do real work on a codebase.

It is not an IDE, not a chatbot wrapper, not a model proxy, and not a cloud service.

Three ideas carry the entire design:

1. **One source-of-truth chain.** `vaerion.yaml` (human intent) → `vaerion.lock`
   (resolved state) → `spec/` (published contracts). Truth flows one direction.
2. **One Event Spine.** Every meaningful action is a versioned, attributed envelope
   on one ordered spine. CLI, API, SDK, journal, and replay are projections.
3. **One Permission Broker.** Filesystem, network, model, secret, and tool access
   flow through a single capability gate, enforced identically for every principal.

---

## 2. The Value Order (Iron Law)

When two values conflict, the higher one wins. No optimization may invert this order:

```
protocol over application
substrate over features
contracts over implementations
simplicity over flexibility
determinism over convenience
local-first over cloud-first
human authority over automation
evolution without betrayal
```

---

## 3. Philosophy — P1 through P11

| # | Principle | Binding statement |
|---|---|---|
| P1 | **Local-first** | The default deployment is one binary + one project directory. Cloud is a designed plug, never a requirement. |
| P2 | **Determinism over convenience** | Identical inputs and seeds yield identical journals, packs, bundles, and replayed states. Convenience never buys nondeterminism. |
| P3 | **Protocol, not product** | Contracts (envelopes, schemas, exit codes, E-codes) are governed like a protocol: additive-only evolution, deprecation windows, eternal goldens. |
| P4 | **Human authority** | Humans are the only approval authority. Automation proposes; humans dispose. Gates persist across process death. |
| P5 | **Attribution without exception** | Every action has an actor and a cause. Nothing happens without a who and a why. |
| P6 | **Fail-closed** | Un-evaluable ⇒ denied. Absence of permission is permission's absence. |
| P7 | **Honest surfaces** | `--help` teaches, `--json` is stable, `--dry-run` is pure, receipts are issued, exit codes tell the truth. |
| P8 | **One context path** | Context assembly is journaled and provenance-carrying. Information reaches a model only through the recorded path. |
| P9 | **No silent loss** | The journal is never truncated silently; queues block or fail loudly; recovery is an auditable event. |
| P10 | **Zero telemetry** | No phone-home. `telemetry.enabled` may only be false. Diagnostics stay on the machine. |
| P11 | **Evolution without betrayal** | Architecture may grow; it may not be rewritten under way. ADRs are the only vehicle for change. |

---

## 4. The Nine Sacred Invariants

These invariants are load-bearing. Breaking any one of them in code, test, or
operation is a constitutional defect, regardless of intent.

1. **Event Spine** — one ordered bus of versioned envelopes feeds every surface; interfaces are projections.
2. **Capability Broker** — every privileged operation is broker-mediated, identically for every principal.
3. **Deterministic Runs** — a run replays to identical state given the same journal and seeds.
4. **Journal** — every run persists an append-only, hash-chained NDJSON journal.
5. **Receipts** — every run closes with a verifiable receipt computed from its journal.
6. **Local-first Core** — the core is fully functional offline; network is a declared, mediated capability.
7. **Machine Parity** — CLI, API, and SDKs honor the same contracts; an "API gap" is impossible by construction.
8. **Open Contracts** — schemas, event registry, error catalog, and API description are versioned specs, additive-only within a major.
9. **Human Authority** — irreversible or ambiguous power is exercised only through durable human gates.

---

## 5. Ratified Decision Register (implementation-binding)

The following decisions were ratified in the constitutional design sessions (D-A
through D-O) and the ASCENSION XVIII amendment sessions (D-M′, D-P through D-T; see
§11). They are binding on all implementation. An ADR may refine mechanics; it may
not contradict these without Founder amendment.

| # | Decision | Binding statement |
|---|---|---|
| D-A | Broker fails closed | `evaluate()` returns Deny when the request cannot be evaluated. Fail-open is structurally impossible. |
| D-B | Event sourcing applies to Runs | Runs are event-sourced; non-run subsystems may journal records but are not run-replayable. |
| C-C | Per-run sequence | Envelope `seq` is allocated by the run's single journal writer: gapless, monotonic, 1-based. Call sites never choose seq. |
| D-D | Actor + cause attribution | Every envelope carries `actor {kind, id}` and `cause {kind, ref}`. Unattributed events are invalid. |
| D-E | blob_ref, not bytes | Large payloads live in the content-addressed blob store; the journal carries `blob_ref {alg, hash, size}` (blake3). |
| D-F | Journaled decisions | decide → journal → act. A privileged action fires only after its decision record exists in the journal. |
| D-G | Single writer | One writer per journal, enforced by an O_EXCL lock with stale-owner detection. |
| D-H | ULID identity | All entities carry ULID-based CRNs (`crn_<ns>_<ulid>`); monotonic sortability is relied upon for stitching and cursors. |
| D-I | NDJSON + blake3 chain | Journals and audit ledgers are NDJSON with a blake3 hash chain; `hash = blake3(canonical(record sans hash))`. |
| D-J | Gateway is the single gate | All model I/O crosses the Model Gateway; no component speaks to providers directly. |
| D-K | Zero telemetry | No network egress except broker-mediated, declared capabilities. Doctor explains, never phones. |
| D-L | Refusal Log | Every broker denial is journaled and auditable; denials are first-class observable facts. |
| D-M′ | Command surface law *(supersedes D-M "Daily Seven")* | The CLI command surface grows only by ratified Founder directive, and every command honors the Five Guarantees (D-N). The surface of record is `vae --help` — help and dispatch never disagree. The ratified surface at v1.3: `init, run, resume, explain, journal, doctor, dev, serve, package, provenance, repo, ci, release, tour, account, ai, center`. The bare invocation (`vae` with no command) is the **welcome front door**: a read-only teaching surface that measures this directory and points at the next step — it exits 0 in every output mode and is never a usage error. `init` carries the ratified **template face**: `vae init --template NAME` scaffolds from the deterministic template registry (one L0 source of truth); bare `init` is exactly `--template minimal`. (Supersession rationale in §11-A1; surface growth in §11-A2 and §11-A3.) |
| D-N | Five Guarantees | (1) `--help` always teaches and never executes; (2) `--json` is stable NDJSON; (3) `--dry-run` is side-effect-free; (4) every run closes with a receipt; (5) exit codes are honest: 0 ok · 2 usage · 3 broker-denied · 4 provider-down · 5 partial-with-repair-hint. |
| D-O | Research is constitutional | Research is a declared, broker-mediated, journaled subsystem; external content is untrusted and fenced; provenance is mandatory. |
| D-P | Git identity law | Every commit in this repository is authored `Auren <auren@vaerion.dev>`. No temporary or ambient identities. Protected history is never rewritten; historical identity violations are recorded honestly and remedied only by Founder-approved decision. |
| D-Q | Canonical protection law | The canonical store enforces, by pre-receive hook: fast-forward-only `main`, refusal of `main` deletion, and immutability of `v*` tags. The hook law is adversarially probed after every provisioning. |
| D-R | Single verification authority | `tools/verify.ts` is the ONE verification entrypoint — locally, in CI, and in every future surface. CI re-runs it; no surface ever re-implements the gates. A workflow that runs gate logic without it is a constitutional defect. |
| D-S | Release readiness is measured, never estimated | Every readiness, trust, or health claim is a measurement with an honesty label: `VERIFIED` (measured locally), `UNVERIFIED` (authored but not measurable in this environment), or `NEVER EXECUTED`. Unmeasurable capabilities are never claimed as capabilities. |
| D-T | Phase ledger law | Completed work is recorded in the worklog with evidence (commit, gates, artifacts). A phase without repository evidence is not complete, whatever any prior session claimed. The ledger is reconciled against the repository at every phase boundary. |

---

## 6. Governing Stage Decisions (MS-0/MS-1 scope)

Per the Founder Completion Order (FR-13), Stages 15–22 were ratified as law. The
decisions directly governing this repository phase:

- **Stage 6 — Repository Architecture.** Monorepo with strict layer model L0–L4
  (L0 foundation/config · L1 store/broker/tools/gateway · L2 domain services ·
  L3 public API · L4 porcelain). Layer lint is a merge gate. Contracts live in
  `spec/` and are single-source-of-truth. Structure protection: new subsystems
  require a registered ADR; generated artifacts are derived, never hand-edited.
- **Stage 7 — System Architecture.** The three load-bearing ideas (§1) plus the
  state-store inventory: run journals (`.vaerion/journal/*.ndjson`), blob CAS
  (`.vaerion/blobs/blake3/**`), audit ledger (`.vaerion/audit.log`), lockfile
  (committed), caches (disposable). Envelope v1 shape is normative
  (`spec/schemas/envelope.schema.json`).
- **Stage 20 — Testing and Verification.** Pyramid: unit (deterministic, port-injected)
  / integration (real fs, fake providers) / contract (spec ⇄ code ⇄ goldens) /
  chaos (kill/resume correctness) / performance (budget gates). Hermeticity: no
  network, no wall-clock, no ambient randomness outside ports. Golden fixtures
  regenerate only via explicit bless with rendered diffs.
- **Stage 21 — Release Discipline.** Release blockers (§8) are absolute. Every
  release ships with verification reports. Secrets never enter the repository.
- **Stage 22 — Implementation Roadmap.** Milestone law (§7) with the Founder
  Completion Order governing stage-by-stage ratification.

---

## 7. Milestone Law

| MS | Name | Exit criteria (enforced) |
|---|---|---|
| MS-0 | Skeleton and Law-in-Repo | Repository skeleton per Stage 6; constitution + contracts in-repo; verification infrastructure runs; zero placeholder files. |
| MS-1 | Runtime Spine | Complete Event Spine; journal with blake3 chain, single writer, verify/replay/recovery; blob CAS; receipts; chaos suite green; broker CONTRACTS frozen. |
| MS-2 | Permission Broker | Broker engine per contracts: fail-closed evaluation, journaled decisions, durable gates, permission graph, review diffs, audit ledger, refusal log. |
| MS-3 | Model Gateway | Provider adapters behind the single gate; streaming normalization; budget metering; secrets protocol; redaction property-proofs. |
| MS-4 | Intelligence + Agents | Project intelligence; context packs with provenance; agent executor; workflows with human gates; hermetic eval harness. |
| MS-5 | Surfaces | CLI porcelain (Daily Seven complete); local API daemon; SDKs with parity tests; extension kit alpha. |
| MS-6 | Packaging + Hardening | Reproducible bundles; installers; docs sweep; accessibility; performance double-check. |
| GA | General Availability | Burndown complete; GO/NO-GO archived; release train rehearsed. |

Status of record (reconciled against the repository at the v1.1 amendment): MS-0
through MS-5 **complete**; MS-6 **in progress** (reproducible bundles, distribution
packaging, CI pipeline, beta docs shipped; native installers, performance
double-check, accessibility sweep remain); GA pending.

---

## 8. Release Blockers (absolute)

1. All verification gates green (build, deps, format, lint, types, unit, integration, chaos, golden, architecture, constitutional).
2. Journal verification green on all golden and chaos fixtures.
3. No secret material anywhere in the repository or its history.
4. Zero telemetry verified (no unmediated egress in code paths).
5. Architecture boundaries verified by layer lint.
6. Constitutional verification green (invariant checks + decision register).
7. Reports generated and truthful (BUILD / VERIFICATION / ARCHITECTURE / ROADMAP_PROGRESS).
8. *(added v1.1)* Release claims carry honesty labels (D-S): every environment-dependent claim in release evidence is marked VERIFIED, UNVERIFIED, or NEVER EXECUTED — a claim without a label is a defect.

---

## 9. Amendment Procedure

1. Only the Founder may ratify an amendment.
2. Amendments are recorded as new ADRs with explicit `supersedes` links; the
   value order (§2) and Sacred Invariants (§4) may only be amended by a new
   constitution version.
3. Implementation may never drift ahead of law: code that exceeds ratified
   decisions is a defect even when it works.

---

## 10. The Engineering Oath

> Build with discipline. Build with receipts. Build with verification.
> Build Vaerion.

---

## 11. Amendment Log

### A3 — v1.2 → v1.3 (ASCENSION XVIII Phases 3–6; Founder-authorized by the continuous execution directive — "Execute the next FOUR phases as one continuous engineering program")

- **Why it changed.** The Founder re-issued roadmap Phases 3–6 (recorded NOT complete
  at v1.1 by the D-T adjudication — zero repository evidence) as ONE engineering
  program: account, ai, init-templates, command-center. Executing them ratifies new
  command surfaces and a template face for `init`. Without an amendment the law
  would lag the ratified directive — the exact drift A1 and A2 closed (§9.3:
  implementation may never drift ahead of law, so the law moves FIRST).
- **What changed.** D-M′ surface list: `account`, `ai`, `center` added (14 → 17
  commands) and `init` gains the ratified `--template` face with the deterministic
  template registry as its single source (bare `init` is exactly `--template
  minimal`). Nothing else in the register moved: D-A…D-T retain their binding
  statements; the Five Guarantees (D-N) are unchanged; the value order (§2) and
  Sacred Invariants (§4) are untouched.
- **Ratified phase intents (binding on implementation).**
  **Phase 3 — account.** The identity & attribution surface (P5, D-D): ONE L2
  identity module becomes the single source of local actor construction (collapsing
  the scattered literals), and `vae account` MEASURES who acts in this workspace —
  actors observed in the journals (deterministic fold), the git commit-identity
  audit (D-P, via the same primitives `vae repo` uses), and declared secret
  PROFILES (names only, never values). Read-only; no cloud account exists or may
  exist (P1: "Not a cloud service. No accounts.").
  **Phase 4 — ai.** The grounded-question surface (P8, D-J): the research pipeline
  folds into ONE shared L2 implementation (no parallel systems — `run research` and
  `ai ask` execute the same pipeline), and `vae ai ask` assembles a journaled,
  provenance-carrying context pack over declared sources, then answers through the
  gateway single gate. `vae ai models` reports the capability matrix. Default model
  is the local seeded provider (P1: works offline). New event types: none required
  — the One Context Path already journals every step.
  **Phase 5 — init-templates.** `vae init --template NAME` from a deterministic,
  validated, byte-stable template registry (L0); the pre-A3 default config bytes
  are preserved exactly as the `minimal` template; unknown templates are a usage
  error with a stable diagnostic code.
  **Phase 6 — command-center.** The operator cockpit: `vae center` (read-only,
  measured snapshot of workspace operations — runs, receipts, metering, refusals,
  audit integrity — and repository trust) and the web face command-center section
  fed by the SAME measured primitives through `tools/status.ts` (never a second
  implementation).
- **Compatibility impact.** None breaking. Unknown commands still exit 2 with
  E1600; every existing command keeps its contract, output faces, and exit codes.
  `init` without `--template` produces byte-identical output to the pre-A3 default.
  The research-pipeline refactor preserves the journaled event sequence and payload
  shapes of `run research`/`run demo` (pinned by tests).
- **Constitutional justification.** §9.2 permits amendment by recorded decision;
  the value order (§2) and Sacred Invariants (§4) are untouched, so a version
  increment (not a new constitution) is the correct vehicle. The four phases apply
  P5 (attribution), P8 (one context path), P2 (deterministic templates), and P7
  (honest surfaces) respectively — each phase strengthens the previous one, as the
  Founder's directive demands.
- **Version increment.** 1.2 → 1.3.

### A2 — v1.1 → v1.2 (ASCENSION XVIII Phase 2; Founder-authorized by the continuous execution directive — "Continue with the next phase in the roadmap")

- **Why it changed.** The roadmap of record (Phase 1 stage summary, ASC-XVIII-PHASE-1)
  names the next phase: the **empty-laptop experience** — "bare `vae`, welcome, tour,
  doctor flow". Phases 2–7 were adjudicated NOT complete at v1.1 (zero repository
  evidence, D-T); Phase 2 is now executed against that recorded definition. The
  command surface grows by exactly one ratified command (`tour`), and the bare
  invocation changes from a usage error to the welcome front door. Without an
  amendment the law would lag the ratified roadmap — the exact drift A1 closed.
- **What changed.** D-M′ surface list: `tour` added (13 → 14 commands). D-M′ now also
  defines the bare invocation as the welcome front door (read-only, teaching,
  exit 0 in every output mode). Nothing else in the register moved: D-A…D-T
  retain their binding statements; the Five Guarantees (D-N) are unchanged.
- **Compatibility impact.** None breaking. Unknown commands still exit 2 with
  E1600; every existing command keeps its contract, output faces, and exit
  codes. The bare-invocation change replaces an error surface with a teaching
  surface — P7 (honest surfaces) upgraded, not weakened. `--json` on the bare
  invocation emits the same stable NDJSON contract as every other command.
- **Constitutional justification.** §9.2 permits amendment by recorded decision;
  the value order (§2) and Sacred Invariants (§4) are untouched, so a version
  increment (not a new constitution) is the correct vehicle. The welcome front
  door and the tour are applications of P7 and P4 (the engine teaches the human;
  automation never hides the surface).
- **Version increment.** 1.1 → 1.2.

### A1 — v1.0 → v1.1 (ASCENSION XVIII Phase 8; Founder-authorized by the Phase 8 directive)

- **Why it changed.** (a) D-M ("Daily Seven" — exactly seven commands) had already
  drifted from reality: `serve` (MS-5), `package` (MS-6) and `provenance` (PHASE Ω)
  were shipped by ratified Founder directives without amending the register — the
  law lagged the repository. (b) Phase 8 ratifies Git, CI, and release readiness as
  part of the constitutional runtime, which required new register law. (c) The
  ASCENSION XVIII phase ledger had to be reconciled against repository evidence
  (worklog + git history): Phases 0–1 complete; Phases 2–7 have no repository
  evidence and are recorded NOT complete (D-T).
- **What changed.** D-M superseded by D-M′ (command surface law); new decisions
  D-P, D-Q, D-R, D-S, D-T added to §5; §8 gains blocker 8 (honesty labels); §7
  gains a status-of-record note; this §11 added.
- **Compatibility impact.** None breaking: D-M′ strictly supersedes D-M (no
  surface removal); all Five Guarantees (D-N) unchanged; the value order (§2) and
  Sacred Invariants (§4) are untouched. Existing commands keep their contracts.
- **Constitutional justification.** §9.2 permits amendment by new recorded
  decision with explicit supersedes links; the value order and invariants are
  unchanged, so a version increment (not a new constitution) is the correct
  vehicle. Honest reconciliation of the ledger is itself an application of P7
  (honest surfaces) and the Honesty Law of the ASCENSION XVIII mission.
- **Version increment.** 1.0 → 1.1.
- **References re-verified at amendment time.** `docs/constitution/` path
  references (CLI `dev` output, MAIN_HELP, docs) updated to v1.1; no duplicate
  law IDs in §5 (D-A…D-T unique; C-C retained with its historical prefix); no
  obsolete sections retained; §7 status note matches the measured milestone board.

### Phase ledger (D-T — reconciled at every phase boundary)

| Phase | Era | Status | Evidence of record |
|---|---|---|---|
| Ω + artifacts | PHASE Ω | ✅ complete | tag `v0.1.7-rc2`; commits `9d6cbd2`, `6ab6068`; six gates green |
| 0 | ASCENSION XVIII | ✅ complete | commit `34b015d`; `docs/ga/FOUNDATION-AUDIT-ASCENSION-XVIII.md` |
| 1 | ASCENSION XVIII | ✅ complete | commits `1c6892f`→`f8f341e`; four install channels verified; trust chain rebuilt; worklog `ASC-XVIII-PHASE-1` |
| 8 | ASCENSION XVIII | ✅ complete | commits `68ef1e5`→`9d3dad8`; tag `v0.1.8-rc1`; six gates green (335/0/2191/26); worklog `ASC-XVIII-PHASE-8` + `ASC-XVIII-PHASE-8-OPS` |
| 2 | ASCENSION XVIII | ✅ complete | commits `1a810d8`, `39027c4`; six gates green (352/0/2302/27); worklog `ASC-XVIII-PHASE-2`; Constitution v1.2 (A2) |
| 3–6 | ASCENSION XVIII | ▶ in flight | the Founder's continuous execution directive ("Execute the next FOUR phases as one continuous engineering program"); one L2 identity module + `vae account`; the shared research pipeline + `vae ai`; the template registry + `vae init --template`; the center fold + `vae center` + web face. Each phase boundary reconciles its row below with commit + gates evidence (D-T) |
| 7 | ASCENSION XVIII | ❌ NOT complete | zero repository evidence (no commands, no spec entries, no tests, no worklog records) — Founder re-issue or cancellation required |

### Synchronization ledger (D-Q + D-S — the operational record of every synchronization audit)

Remote reality is measured, never assumed. This ledger is appended by the
Founder's GitHub-synchronization directive; every claim below is a measurement
taken on the dated audit, honestly labeled.

| Date (UTC) | Remote | Commit of record | Tag of record | Measured evidence |
|---|---|---|---|---|
| 2026-09-02 | `canonical` — `/home/z/vaerion-canonical.git` | `9d3dad8` — local HEAD == remote `main`, divergence 0/0 | `v0.1.8-rc1` — tag object `7d75198` identical on both sides | `git fetch` clean; ahead/behind measured `0 0`; D-Q pre-receive hook present and law-verified (ff-only `main`, no deletion, `v*` immutable); release trust chain re-verified live (`dist-verify` → signature OK Ed25519, ALL CHECKS PASSED, exit 0); git tag is annotated (`Auren <auren@vaerion.dev>`), **not** git-cryptographically signed — the artifact-level Ed25519 manifest signature is the signature of record |

**GitHub status (measured 2026-09-02; D-S labels).** The repository carries no
GitHub remote (`git remote -v` lists only `canonical`), the `gh` CLI is not
installed, and no `GITHUB_TOKEN`/`GH_TOKEN` credentials exist in the environment.
GitHub synchronization is **NEVER EXECUTED** — root cause, measured: missing
remote + missing authentication. The only measured GitHub surface is network
reachability (`https://github.com` → HTTP 200). A GitHub remote and credentials
are Founder-gated provisioning; until then `canonical` is the sole
synchronization authority of record, and no GitHub claim may be made beyond this
paragraph (Honesty Law).
