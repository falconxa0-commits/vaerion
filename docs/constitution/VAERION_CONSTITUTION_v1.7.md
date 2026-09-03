# VAERION CONSTITUTION — v1.7

| | |
|---|---|
| **Document** | VAERION_CONSTITUTION_v1.7 — the ratified law of the Vaerion engine |
| **Status** | `RATIFIED — MATERIALIZED INTO REPOSITORY` |
| **Priority chain** | Constitution → Philosophy (P1–P11) → Stage decisions → ADR → code |
| **Amendment** | Founder authority only (see §9). No agent, reviewer, or contributor may amend. |
| **Implementation authority** | This repository is the executable expression of this document. Where code and law disagree, the law wins and the code is a defect. |
| **Supersedes** | v1.6 (retained unmodified at `VAERION_CONSTITUTION_v1.6.md` as historical record); v1.5 (retained unmodified at `VAERION_CONSTITUTION_v1.5.md` as historical record); v1.4 (retained unmodified at `VAERION_CONSTITUTION_v1.4.md` as historical record); v1.3 (retained unmodified at `VAERION_CONSTITUTION_v1.3.md`); v1.2 (retained unmodified at `VAERION_CONSTITUTION_v1.2.md`); v1.1 (retained unmodified at `VAERION_CONSTITUTION_v1.1.md`); v1.0 (retained unmodified at `VAERION_CONSTITUTION_v1.0.md`) |

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
| D-Q | Synchronization protection law *(supersedes D-Q "Canonical protection law" — scope extended to every synchronized remote; v1.6 A6)* | The canonical store enforces, by pre-receive hook: fast-forward-only `main`, refusal of `main` deletion, and immutability of `v*` tags. Every synchronized remote of record enforces the same properties by its sanctioned mechanism — branch protection on `main` (no force-push, no deletion, linear history), release-tag immutability by policy. The protection law is adversarially probed after every provisioning — on the canonical store by push probes, on synchronized remotes through the sanctioned API — and the protection state is recorded with D-S honesty labels. Required verification checks on a remote are staged fail-closed: a check may only be REQUIRED once a measured green run of that check exists (a check that cannot run is not a check). |
| D-R | Single verification authority | `tools/verify.ts` is the ONE verification entrypoint — locally, in CI, and in every future surface. CI re-runs it; no surface ever re-implements the gates. A workflow that runs gate logic without it is a constitutional defect. |
| D-S | Release readiness is measured, never estimated | Every readiness, trust, or health claim is a measurement with an honesty label: `VERIFIED` (measured locally), `UNVERIFIED` (authored but not measurable in this environment), or `NEVER EXECUTED`. Unmeasurable capabilities are never claimed as capabilities. |
| D-T | Phase ledger law | Completed work is recorded in the worklog with evidence (commit, gates, artifacts). A phase without repository evidence is not complete, whatever any prior session claimed. The ledger is reconciled against the repository at every phase boundary. |
| D-U | Reality Recovery Law *(added v1.7 A7)* | Every major campaign begins with the Reality Recovery Protocol, executed as if the agent has never seen the repository: (1) LOCATE — repository location, branch, HEAD, working tree, remotes, tags, commits; (2) MEASURE — version, constitution, roadmap, phase ledger, worklog, tests, CI, releases, packages; (3) COMPARE — the repository against the roadmap, the constitution, the documentation, the release records, and the reports; every difference is investigated, never assumed away; (4) IDENTIFY — the real remaining work as completed / incomplete / blocked / unverified. No memory, no summary, no conversation history, and no prior report substitutes for measurement; inherited claims that fail measurement are recorded as corrected reality with D-S labels. Nothing proceeds until reality is measured. |
| D-V | Implementation Rule + Root Cause Law *(added v1.7 A7)* | Implementation never begins before two campaign records exist and are committed: the **Reality Report** (current state, completed phases, missing phases, defects, risks) and the **Execution Plan** (what will be built, why, the architecture location, the verification method). Defects are fixed at root cause, never patched at the symptom: detect → measure → reproduce → understand → fix the root cause → verify prevention. The best fix removes the entire defect class; a surface patch without a root-cause record is itself a defect. |
| D-W | Campaign Close Law *(added v1.7 A7)* | A campaign closes only with the **Remaining Reality Report**, recorded in the worklog and the reports of record, with five sections: Completed (proven by evidence) · Verified (measured) · Unverified (authored but not measurable in this environment) · Remaining (still needed) · Founder Decisions (items requiring human authority). "Complete." alone is never a campaign close. |
| D-X | Declaration Standard *(added v1.7 A7)* | "Vaerion is ready" may be declared only when ALL of the following hold by measurement: reality recovered, constitution aligned, architecture verified, features complete, packages proven, installations verified, documentation complete, audits passed, release validated, and remaining risks documented. Until every condition is measured, the statement of record is exactly: **"Vaerion is progressing toward readiness."** Readiness is a measured human decision (P4), never an automation claim. |
| D-Y | The Empty Machine Test *(added v1.7 A7)* | The ultimate experience test binds every release: a developer with an empty machine — no Vaerion installed, no knowledge of the system — can discover, install, verify the installation, initialize, understand the commands, create value quickly, recover from mistakes, upgrade safely, and remove cleanly. Every leg of the journey (discover → install → verify → initialize → use → upgrade → remove) carries D-S evidence per platform or an honest UNVERIFIED label; a package is a product only when it installs, executes, upgrades, and removes — its existence is never its proof. |

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

Status of record (reconciled at the Phase 10 boundary by A5): MS-0 through
MS-5 **complete**; MS-6 **complete** — the GA campaign (Phases 7–10, §11-A4)
executed its remaining exit criteria as permanent gated law: the performance
double-check is the `perf-budget` gate, the accessibility sweep is the
`a11y-structural` gate plus the browser-measured audit, and distribution
packaging remains honestly split VERIFIED (npm, PyPI, universal installer,
deb) / UNVERIFIED host-gated (brew, winget, dmg, rpm — authored, awaiting
their platforms). GA is **rehearsed and pending Founder GO**: the release
train passed end-to-end (Phase 9), the burndown is archived
(docs/ga/BURNDOWN.md), and the GO/NO-GO dossier awaits the Founder's
signature (docs/ga/GO-NO-GO.md) — GA is a human decision (P4), not a
milestone automation can declare.

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

### A7 — v1.6 → v1.7 (THE MASTER CONSTITUTIONAL DIRECTIVE, Phases 15–18; Founder-authorized by the MASTER CONSTITUTIONAL DIRECTIVE — "PROMPT 1 — THE LAW OF VAERION: Constitutional Foundation, Engineering Philosophy, Architecture Doctrine, Reality Recovery Protocol", Parts I–IV)

- **Why it changed.** The Founder issued the Master Constitutional Directive as the
  standing law of the ecosystem: Articles I–X (what Vaerion is, what it refuses to
  become, the absolute engineering principles, the Reality Recovery Protocol, the
  architecture doctrine, the verification philosophy, behavior rules, the
  completion standard, stop conditions), Parts I–II (constitutional engineering
  law D-A-class: reality, single sources of truth, no parallel systems, thin
  clients, verification and failure honesty, root cause, no fabrication, release
  engineering, immutability, security, performance, accessibility, cross-platform,
  package law, stop conditions, completion standard), Parts III (developer
  experience, installation, package ecosystems, shell, editor, registry, artifact,
  offline, upgrade/removal law), and IV (experience standard, the Empty Machine
  Test, audits, campaign execution mode, the implementation rule, the completion
  verification engine, the remaining-work discovery law, the final declaration
  standard). Measured against the register (D-A delta analysis, D-S labeled), the
  great majority of the directive re-affirms law already materialized: the value
  order (§2), the Sacred Invariants (§4), P1–P11, D-A…D-T, §8 blockers 1–8, and
  Stage 20's verification pyramid. The genuinely NEW binding content is the
  campaign PROCESS law — the Reality Recovery Protocol, the Implementation Rule,
  the Root Cause Law, the Campaign Close Law, the Declaration Standard, and the
  Empty Machine Test — which the repository has practiced as discipline but never
  ratified as register law. Under §9.3 the law moves FIRST: without this
  amendment, every future campaign would run on unratified process. The amendment
  also records the reality recovered at campaign start: the canonical store was
  AGAIN absent at the session boundary (second occurrence — the provisioning was
  ad-hoc shell, never versioned), the GitHub credential plumbing was lost and
  restored (0600 file outside the repository; identity verified as
  `falconxa0-commits`), and the CLI carried stale law-of-record literals (the tour
  and welcome surfaces taught `VAERION_CONSTITUTION_v1.3.md` — two generations
  behind; `dev.next_milestone` lagged the completed ASC-XIX program) — the
  hand-copied-literal class Phase 11 killed for counters survived in the law
  references themselves.
- **What changed.** Five decisions ADDED to §5 — D-U (the Reality Recovery Law:
  locate → measure → compare → identify, executed as if the agent has never seen
  the repository, nothing proceeds until reality is measured), D-V (the
  Implementation Rule: Reality Report + Execution Plan committed before code; the
  Root Cause Law: detect → measure → reproduce → understand → fix root cause →
  verify prevention), D-W (the Campaign Close Law: every campaign closes with the
  five-section Remaining Reality Report), D-X (the Declaration Standard: "ready"
  only under the full measured condition list — otherwise the statement of record
  is "Vaerion is progressing toward readiness"), D-Y (the Empty Machine Test: the
  discover → install → verify → initialize → use → upgrade → remove journey
  carries D-S evidence or UNVERIFIED per platform; a package's existence is never
  its proof). NO existing decision moved: D-A…D-T retain their binding statements;
  the D-M′ command surface is UNCHANGED at 17 commands; the Five Guarantees (D-N)
  are unchanged; the value order (§2) and Sacred Invariants (§4) are untouched.
  Deliberately NOT duplicated (D-B — the mapping of record): the No-Fabrication
  law = D-S + §8 blocker 8; the Stop Conditions = P4 + P6 + §9.3; the thin-client
  and one-pipeline doctrine = Sacred Invariants 1 and 7 + the value order; the
  verification classes = Stage 20 + §8 blockers; the release engineering and
  immutability law = §8 + D-P/D-Q + Stage 21. What A7 ratifies is the PHASE
  PROGRAM (binding on implementation, per the D-T ledger):
  **Phase 15 — the materialization.** A7 law committed with the pin tests moved
  and extended (v1.7 ratified; v1.6 retained unmodified; D-U…D-Y pinned); the
  campaign's Reality Report and Execution Plan committed as the FIRST artifacts
  D-V ever requires of itself.
  **Phase 16 — the live-reference law.** ONE derivation of the constitution of
  record in the engine (highest ratified version present, fail-closed); the CLI
  welcome surface, `dev`, the `tour` teaching steps, and `tools/status.ts`
  converge on it; the stale-literal class dies at root (Law 4 via D-V); the
  `dev.next_milestone` text reflects the measured state of record.
  **Phase 17 — the provisioning law.** The D-Q canonical pre-receive hook is
  versioned as law text in the engine (`src/repo/canonical.ts`); ONE sanctioned
  provisioner and prover (`tools/canonical-provision.ts`) applies the hook,
  runs the adversarial push probes (non-fast-forward `main` REFUSED, `v*` tag
  overwrite REFUSED, `main` deletion REFUSED), and reports with D-S labels —
  re-provisioning becomes deterministic and law-pinned, closing the
  session-boundary loss class at root. Executed for real: the canonical store
  re-provisioned, probed, and synchronized 0/0.
  **Phase 18 — the program close.** D-T ledger rows, §11 synchronization-ledger
  rows (canonical + GitHub, measured), worklog entries for every phase, EIGHT
  gates green on the final tree, GitHub synchronization measured (token identity
  verified; branch protection state re-measured), and the Remaining Reality
  Report (D-W) delivered to the Founder.
- **Compatibility impact.** None breaking. Additive register law and process
  commitments only; no CLI surface change; no contract change; no output-face
  change beyond the Phase 16 reference corrections (the law paths the surfaces
  teach become TRUE — P7 strengthened, not weakened).
- **Constitutional justification.** §9.2 permits amendment by recorded decision;
  the value order (§2) and Sacred Invariants (§4) are untouched, so a version
  increment (not a new constitution) is the correct vehicle. The five decisions
  apply D-A (reality before action) at campaign scale, P4 (the declaration of
  readiness remains human), P6 (fail-closed derivation and provisioning), P7
  (honest references and honest close reports), and P11 (the process law evolves
  without betraying the architecture).
- **Version increment.** 1.6 → 1.7.

### A6 — v1.5 → v1.6 (ASCENSION XIX — THE PRODUCTION OPERATIONS CAMPAIGN, Phases 11–14; Founder-authorized by the LEAP PROGRAM directive — "Advance approximately FOUR PHASES forward as one engineered campaign… strengthening Vaerion into a production-grade AI-native development engine")

- **Why it changed.** Reality measured at campaign start (D-S): the remote
  verification pipeline executed SIX real runs on GitHub — all six RED — with
  three root causes proven at log level: the record-artifact upload step
  excludes hidden files by default, so the green gate record never uploads;
  the host-relative `journal.append` perf budget (400 ms, calibrated on the
  sandbox host) breached at 452.95 ms on the sanctioned CI runner; and a red
  gate's failure output was structurally truncated by the verify entrypoint's
  last-40-lines detail window, so CI could not name its own failure.
  `ROADMAP_PROGRESS.md` — the roadmap report of record under §8 blocker 7 —
  was last regenerated at the Phase 6 boundary (constitution v1.3) and
  recommended work completed by two later campaigns. GitHub `main` carried NO
  branch protection (measured 404) while D-Q covered only the canonical store.
  The Founder ratified the remaining operations work as ONE four-phase
  campaign. Without an amendment the law would lag the ratified directive
  (§9.3: implementation may never run ahead of law — the law moves FIRST).
- **What changed.** D-Q superseded by the synchronization protection law: the
  SAME protection properties the canonical store enforces by hook now bind
  every synchronized remote of record by its sanctioned mechanism, with
  measured adversarial probes and D-S-labeled protection state; required
  checks are staged fail-closed. NO other register decision moved:
  D-A…D-T (minus D-Q) retain their binding statements; the D-M′ command
  surface is UNCHANGED at 17 commands; the Five Guarantees (D-N) are
  unchanged; the value order (§2) and Sacred Invariants (§4) are untouched.
  What A6 ratifies is the PHASE PROGRAM (binding on implementation, per the
  D-T ledger):
  **Phase 11 — the CI truth law.** The verification pipeline (the workflow
  that re-runs `tools/verify.ts` per D-R) must (a) upload its measured record
  — hidden-file inclusion where the record path is a dotfile; (b) be
  diagnostically honest on failure — a red gate NAMES its failure: the full
  gate output is persisted and the failure excerpt is printed; (c) be
  PORTABLE — the budgets of record hold on every sanctioned host, with the
  calibration medians recorded per host (D-S labels); (d) the roadmap report
  of record is GENERATED from the one measured status source (no
  hand-maintained roadmap text). All pinned by contract tests. No CLI surface
  change.
  **Phase 12 — the remote protection law.** D-Q executed on the synchronized
  GitHub remote: measured branch protection on `main` (no force-push, no
  deletion, linear history, enforced for administrators), adversarial probes
  through the sanctioned API, protection recorded with D-S labels;
  least-privilege workflow permissions. Required status checks stay STAGED
  (fail-closed) until a measured green run exists (Phase 13).
  **Phase 13 — the CI execution law.** At a gates-green phase boundary the
  synchronized `main` runs the verification pipeline on the remote for real;
  the run is measured (conclusion, uploaded record artifact, timing) and
  recorded in the synchronization ledger; the first fully-green remote run is
  the evidence of record; any surfaced host-specific failure is root-caused
  under this phase's law, never documented around. After a measured green
  run, the required check is elevated (completing D-Q's staged law).
  **Phase 14 — the program close.** Version lockstep 0.1.11-rc1, annotated
  release tag, artifact pack + consumer trust chain, canonical + GitHub
  synchronization (divergence 0/0, tag identical both sides), §11
  synchronization-ledger rows, worklog entries for every phase, and a
  zero-based reality recovery feeding the final report.
- **Compatibility impact.** None breaking. The workflow change is internal
  to the CI surface that D-R already governs; the perf report gains an
  additive host field (P3 additive-only); the roadmap report becomes
  generated (same consumers, truthful content); remote-side protection adds
  refusals the canonical store already enforces.
- **Constitutional justification.** §9.2 permits amendment by recorded
  decision; the value order and Sacred Invariants are untouched, so a
  version increment (not a new constitution) is the correct vehicle. The
  program applies D-R (one verification authority — now honest in failure
  and green in artifact), D-S (every claim measured and labeled), P6
  fail-closed (a check that cannot run is not required), and P7 (honest
  surfaces — CI tells the truth when red).
- **Version increment.** 1.5 → 1.6.

### A5 — v1.4 → v1.5 (ASCENSION XVIII — THE GA GATE; Phase 10 boundary reconciliation under the A4 program)

- **Why it changed.** The A4 program's fourth phase — the GA gate — is
  complete: the burndown is archived (docs/ga/BURNDOWN.md), the GO/NO-GO
  dossier is archived (docs/ga/GO-NO-GO.md), the release train is rehearsed
  end-to-end (docs/ga/RELEASE-TRAIN-REHEARSAL.md), and the program closes
  with version lockstep 0.1.10-rc1, the release tag, the artifact trust
  chain, and canonical + GitHub synchronization. §7's status of record and
  the D-T ledger had to be reconciled to that measured reality at the
  boundary (D-T law) — the law records what the repository proves.
- **What changed.** §7 status of record: MS-6 moves from "in progress" to
  **complete** (the performance double-check and the accessibility sweep are
  now permanent gates `perf-budget` and `a11y-structural`; distribution
  packaging honestly split VERIFIED/UNVERIFIED host-gated); GA moves from
  "pending" to **rehearsed and pending Founder GO** (P4: the GO decision is
  the Founder's; the dossier proposes). The D-T ledger row for Phase 10 is
  reconciled to complete. NO register decisions moved: D-A…D-T retain their
  binding statements; the D-M′ command surface is UNCHANGED at 17 commands;
  the Five Guarantees (D-N) are unchanged; the value order (§2) and Sacred
  Invariants (§4) are untouched.
- **Compatibility impact.** None breaking. Documentation and ledger law
  only; no CLI surface change; no contract change.
- **Constitutional justification.** §9.2 permits amendment by recorded
  decision; the value order and Sacred Invariants are untouched, so a
  version increment (not a new constitution) is the correct vehicle. The
  reconciliation applies D-T (the ledger matches repository reality at every
  phase boundary), D-S (every status carries its label), and P4 (GA remains
  a human decision — the law itself refuses to declare it).
- **Version increment.** 1.4 → 1.5.

### A4 — v1.3 → v1.4 (ASCENSION XVIII — THE GA CAMPAIGN, Phases 7–10; Founder-authorized by the continuous-execution directive — "EXECUTE THE REMAINING PROGRAM AS ONE ENGINEERING CAMPAIGN. You may complete approximately FOUR roadmap phases if—and only if—they form one coherent architectural program.")

- **Why it changed.** The measured remaining roadmap at v1.3 was: Phase 7
  (recorded NOT complete — zero repository evidence — awaiting Founder re-issue
  or cancellation), the MS-6 close-out (performance double-check, accessibility
  sweep; native-installer verification is host-gated), and GA preparation
  (release train rehearsed, burndown complete, GO/NO-GO archived — §7). The
  Founder re-issued the remaining program as ONE architecture-first campaign of
  four phases. Without an amendment the law would lag the ratified directive —
  the exact drift A1–A3 closed (§9.3: implementation may never run ahead of
  law, so the law moves FIRST).
- **What changed.** NO register decisions moved: D-A…D-T retain their binding
  statements; the D-M′ command surface is UNCHANGED at 17 commands (none of the
  four phases adds, removes, or renames a command); the Five Guarantees (D-N)
  are unchanged; the value order (§2) and Sacred Invariants (§4) are untouched.
  What A4 ratifies is the PHASE PROGRAM (binding on implementation, per the D-T
  ledger below):
  **Phase 7 — the performance budget law** (re-issued with this recorded
  definition; executes the §7 MS-6 "performance double-check" as a permanent
  gated property, not a one-off audit). Engine-critical operations — journal
  append, journal chain verify, journal replay, broker evaluate, receipt
  compute, blob store round-trip, gateway metering fold — are measured by ONE
  deterministic harness (fixed iteration counts, fixed seeded input sizes,
  median-of-N) against typed budget contracts; the gate runs through the single
  verification authority (D-R) as a verify.ts step and fails closed on breach;
  the report is rich-plain-JSON with an honesty label per metric (host-relative
  wall-clock ceilings, deterministic SHAPE). No CLI surface change.
  **Phase 8 — the accessibility law** (executes the §7 MS-6 "accessibility
  sweep"). The human-surface audit: the web face is measured for semantic
  structure, alternative text, labeling, keyboard operability, focus visibility,
  and landmark integrity by a deterministic structural checker invoked through
  the single verification authority (D-R), plus a browser-measured audit
  recorded with D-S honesty labels; CLI color accessibility (NO_COLOR, TTY
  honesty, `--plain`) is behavior-pinned by tests so no color-only signal ever
  carries meaning; the docs sweep records the accessibility posture. Defects
  found are fixed at root, not documented around.
  **Phase 9 — the release-train rehearsal** (executes the §7 GA exit criterion
  "release train rehearsed"). ONE deterministic rehearsal runner exercises the
  full train end-to-end in a sandbox — pack at the release ref, consumer trust
  chain verification, install through a verified channel, run in the installed
  tree, provenance and uninstall with nothing left behind — and produces a
  measured rehearsal report; duplicated release logic collapses into the runner.
  **Phase 10 — the GA gate** (executes the §7 GA exit criteria "burndown
  complete; GO/NO-GO archived"). The burndown ledger reconciles every §8
  release blocker, MS-6 item, and Founder-gated item to measured status with
  honesty labels; the GO/NO-GO dossier archives the measured recommendation
  (P4: the Founder issues GO; the dossier proposes); the §7 status of record is
  reconciled at the boundary; the program closes with version lockstep, release
  tag, artifact trust chain, and canonical + GitHub synchronization.
- **Compatibility impact.** None breaking. No CLI surface change; every
  existing command keeps its contract, output faces, and exit codes. The
  verification record gains gate entries through the ONE entrypoint (D-R);
  no surface re-implements gate logic.
- **Constitutional justification.** §9.2 permits amendment by recorded
  decision; the value order and Sacred Invariants are untouched, so a version
  increment (not a new constitution) is the correct vehicle. The four phases
  apply P2 (deterministic budgets), P7 (honest human surfaces), P3 (protocol
  discipline rehearsed as release procedure), and P4/P5 (human authority over
  GA, every claim attributed and measured) — each phase strengthens the
  previous one, as the directive demands.
- **Version increment.** 1.3 → 1.4.

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
| 3 | ASCENSION XVIII | ✅ complete | commit `c16de89`; six gates green (363/0/2362/28); worklog `ASC-XVIII-PHASE-3`; one L2 identity module + `vae account` (A3) |
| 4 | ASCENSION XVIII | ✅ complete | commit `af5608d`; six gates green (377/0/2441/29); worklog `ASC-XVIII-PHASE-4`; the ONE shared research pipeline + `vae ai` (A3) |
| 5 | ASCENSION XVIII | ✅ complete | commit `60c2d3e`; six gates green (388/0/2498/30); worklog `ASC-XVIII-PHASE-5`; the deterministic template registry + `vae init --template` + E1203 (A3) |
| 6 | ASCENSION XVIII | ✅ complete | six gates green (397/0/2538/31); worklog `ASC-XVIII-PHASE-6`; the ONE center fold + `vae center` + the web face command-center section (A3); release tag + version lockstep land at program close |
| 7 | ASCENSION XVIII | ✅ complete | one deterministic perf harness (src/perf/perf.ts: seven engine-critical operations, typed budget contracts, median-of-N) + verify.ts gate 6 "perf-budget" (D-R); SEVEN gates green (410/0/2664/32); worklog `ASC-XVIII-PHASE-7`; executes the §7 MS-6 performance double-check |
| 8 | ASCENSION XVIII | ✅ complete | nine deterministic a11y invariants (tools/a11y-check.ts) + verify.ts gate 7 "a11y-structural" (D-R); CLI color accessibility behavior-pinned; browser-measured audit docs/ga/ACCESSIBILITY-AUDIT.md; 3 defects fixed at root; EIGHT gates green (431/0/2710/34); worklog `ASC-XVIII-PHASE-8-ACC` |
| 9 | ASCENSION XVIII | ✅ complete | ONE rehearsal runner (tools/rehearsal.ts: nine fixed steps, fail-closed D-R departure, scratch-only side effects); the REAL train PASSED end-to-end at v0.1.9-rc1 (trust chain ALL CHECKS PASSED; installed vae lockstep verified); report docs/ga/RELEASE-TRAIN-REHEARSAL.md; D-N gap fixed (`version --json` NDJSON); EIGHT gates green (443/0/2752/35); worklog `ASC-XVIII-PHASE-9` |
| 10 | ASCENSION XVIII | ✅ complete | the burndown (docs/ga/BURNDOWN.md) + the GO/NO-GO dossier (docs/ga/GO-NO-GO.md) archived; §7 reconciled by A5; program close: version lockstep 0.1.10-rc1, tag `v0.1.10-rc1`, artifact trust chain, canonical + GitHub synchronization (§11 synchronization ledger) |
| 11 | ASCENSION XIX | ✅ complete | the CI truth law (A6): record upload `include-hidden-files: true` (the 6/6-red-run root cause); red gates NAME failures (tools/gate-output.ts + verify.ts full-output persistence .vaerion-logs/); journal.append budget re-based 400→900 ms with the GitHub-runner median of record (452.95 ms) + additive report `host`; measured test counts in `.vaerion-verification.json` (the one measured source — status.ts counters now derive); ROADMAP_PROGRESS.md GENERATED from tools/status.ts (the stale hand-written era closed); EIGHT gates green (461/0/2812/36); worklog `ASC-XIX-PHASE-11` |
| 12 | ASCENSION XIX | ✅ complete | D-Q executed on the synchronized GitHub remote (`falconxa0-commits/vaerion`): branch protection applied by tools/remote-protect.ts (no force-push, no deletion, linear history, enforced for administrators) and VERIFIED against the descriptor; deletion refusal LIVE-probed (HTTP 404 + ref verified untouched); force-push refusal enforced by measured configuration, destructive probe NOT EXECUTED by design; required checks STAGED fail-closed (elevation at Phase 13); least-privilege workflow permissions (contents: read); report of record docs/security/REMOTE-PROTECTION.md; EIGHT gates green (475/0/2848/37); worklog `ASC-XIX-PHASE-12` |
| 13 | ASCENSION XIX | ✅ complete | the CI execution law: run #7 (`33692553230` @ `97e5778`) — the FIRST fully-green remote run, every step green including the record upload, artifact downloaded and verified (ok:true, 8/8 gates, measured 475/0/2848/37); the harness-test timeout surfaced BY NAME by the Phase 11 diagnostics and fixed (60s timeboxes); the staged check ELEVATED per the A6 clause, the elevation MEASURED (push declined at pre-receive — required checks are structurally incompatible with the direct-push sync path), the discovery recorded and the check restored STAGED with the elevation guard preserved (P4: a PR-based flow is a Founder decision); run #8 (`33693201464` @ `5676962`) — SUCCESS; report of record updated; worklog `ASC-XIX-PHASE-13` |
| 14 | ASCENSION XIX | ✅ complete | program close: version lockstep 0.1.11-rc1 across every measured surface (18 surfaces; goldens re-blessed — only the engine_version cascade moved); the eval-golden hermeticity defect fixed (found by the bless itself); EIGHT gates green (478/0/2853/37); release commit `fd0941c`; tag `v0.1.11-rc1` pushed ONCE to each remote; dist-pack deterministic tarball 1,334,410 bytes + Ed25519 trust chain ALL CHECKS PASSED; canonical + GitHub synchronization 0/0 (§11 ledger); the remote release job GREEN (bootstrap-key path disclosed); worklog `ASC-XIX-PROGRAM-CLOSE` |

### Synchronization ledger (D-Q + D-S — the operational record of every synchronization audit)

Remote reality is measured, never assumed. This ledger is appended by the
Founder's GitHub-synchronization directive; every claim below is a measurement
taken on the dated audit, honestly labeled.

| Date (UTC) | Remote | Commit of record | Tag of record | Measured evidence |
|---|---|---|---|---|
| 2026-09-02 | `canonical` — `/home/z/vaerion-canonical.git` | `9d3dad8` — local HEAD == remote `main`, divergence 0/0 | `v0.1.8-rc1` — tag object `7d75198` identical on both sides | `git fetch` clean; ahead/behind measured `0 0`; D-Q pre-receive hook present and law-verified (ff-only `main`, no deletion, `v*` immutable); release trust chain re-verified live (`dist-verify` → signature OK Ed25519, ALL CHECKS PASSED, exit 0); git tag is annotated (`Auren <auren@vaerion.dev>`), **not** git-cryptographically signed — the artifact-level Ed25519 manifest signature is the signature of record |
| 2026-09-02 (program close) | `canonical` — `/home/z/vaerion-canonical.git` | `4b9aa9c` — local HEAD == remote `main` | `v0.1.9-rc1` — tag object `38a59f9`, peeled commit `8c76203` (the release lockstep commit) identical both sides | fast-forward push accepted by the D-Q hook; tag pushed once (immutability respected); consumer trust chain re-verified (`dist-verify` → signature OK Ed25519 fp sha256:2c835b94…, ALL CHECKS PASSED, exit 0) |
| 2026-09-02 (program close) | `github` — `https://github.com/falconxa0-commits/vaerion.git` | `4b9aa9c` — remote `main` == local `main`, divergence 0/0 | all four release tags (`v0.1.7-rc1`, `v0.1.7-rc2`, `v0.1.8-rc1`, `v0.1.9-rc1`) — every tag object SHA identical local↔remote (`4c20529`, `9a0e2d0`, `7d75198`, `38a59f9`) | `git push github main` fast-forward accepted (`c1cc3fe..4b9aa9c`); tags pushed as NEW refs (no overwrite — D-Q law untested on GitHub remote by design, GitHub branch protection is Founder-gated); `git ls-remote github` re-measured post-push: HEAD == `main` == `4b9aa9c`; authentication via the Founder-provided PAT (stored OUTSIDE the repository, git credential-store); `archive/parallel-generation` left untouched as found |

| 2026-09-03 (GA-campaign close) | `canonical` — `/home/z/vaerion-canonical.git` | `a288ec4` — local HEAD == remote `main`, divergence 0/0 | `v0.1.10-rc1` — tag object `a22b32d6`, peeled commit `a288ec4` (the lockstep commit) identical both sides | canonical RE-PROVISIONED at campaign start (session-boundary loss, disclosed): bare store + D-Q pre-receive hook (ff-only main, no main deletion, `v*` immutable); adversarial probes re-proven after provisioning (non-ff REFUSED exit 1, tag overwrite REFUSED, main deletion REFUSED; post-probe state unchanged); fast-forward push `9486d66..a288ec4` accepted; tag pushed ONCE (immutability respected); consumer trust chain re-verified at the close (dist-verify → ALL CHECKS PASSED, exit 0) |
| 2026-09-03 (GA-campaign close) | `github` — `https://github.com/falconxa0-commits/vaerion.git` | `a288ec4` — remote `main` == local `main`, divergence 0/0 | all FIVE release tags (`v0.1.7-rc1`, `v0.1.7-rc2`, `v0.1.8-rc1`, `v0.1.9-rc1`, `v0.1.10-rc1`) — every tag object SHA identical local↔remote (`4c20529`, `9a0e2d0`, `7d75198`, `38a59f9`, `a22b32d6`) | `git push github main` fast-forward accepted (`9486d66..a288ec4`); `v0.1.10-rc1` pushed as a NEW ref (one transient "missing necessary objects" refusal on the first tag push — a propagation race with the main push, retried and accepted, no overwrite); authentication via the Founder-provided PAT stored OUTSIDE the repository (0600 token file + git credential-store; the token never touched a command line or the tree — blocker 3 honored); `archive/parallel-generation` left untouched as found; post-push `git ls-remote` re-measured: HEAD == `main` == `a288ec4` |
**GitHub status (measured 2026-09-02 program close; re-measured 2026-09-03 at the GA-campaign close; D-S labels).** Superseding
the earlier NEVER EXECUTED finding: the Founder provisioned the remote
(`falconxa0-commits/vaerion`, measured: public, default branch `main`, admin/push
permissions, remote `main` at `c1cc3fe` — a strict ancestor of local `main`,
divergence 30/0 measured via authenticated ls-remote) and provided a classic PAT
(scopes measured incl. `repo`+`workflow`; stored at `/home/z/.vaerion-github-token`,
mode 0600, OUTSIDE the repository — blocker 3 honored; git credential-store
configured so the token never touches a command line or the tree). GitHub
synchronization is now **VERIFIED**: `main` fast-forwarded `c1cc3fe..4b9aa9c`,
all four release tags pushed and re-measured identical via `git ls-remote`
(tag objects + peeled commits, see the synchronization ledger). The remote
`archive/parallel-generation` branch was left untouched as found. Honest
limits (D-S): GitHub Actions execution, GitHub-side branch protection, and the
secret-provisioned key path remain NEVER EXECUTED/Founder-gated in this
environment; `canonical` remains the protection-law authority of record (D-Q
hook) while GitHub main is currently unprotected.
| 2026-09-02 (ASCENSION XIX close) | `canonical` — `/home/z/vaerion-canonical.git` | `fd0941c` — local HEAD == remote `main`, divergence 0/0 (fast-forward `9ae839a..fd0941c` accepted by the D-Q hook) | `v0.1.11-rc1` — tag object `0a95fc5`, peeled commit `fd0941c` identical both sides; pushed ONCE as a NEW ref | consumer trust chain re-verified at the close (dist-verify → Ed25519 signature OK, ALL CHECKS PASSED, exit 0) |
| 2026-09-02 (ASCENSION XIX close) | `github` — `https://github.com/falconxa0-commits/vaerion.git` | `fd0941c` — remote `main` == local `main` == canonical `main`, divergence 0/0 | all SIX release tags identical by measurement (`4c20529`, `9a0e2d0`, `7d75198`, `38a59f9`, `a22b32d`, `0a95fc5`) | runs #7/#8 on the remote FULLY GREEN (every step incl. the record upload; artifact downloaded + verified: 8/8 gates, measured 475/0/2848/37); the tag-triggered release job GREEN with the disclosed bootstrap-key path; branch protection enforced (no force-push, no deletion, linear history, admins included) with the required check honestly STAGED (the elevation incompatibility discovery, P4 Founder decision); `archive/parallel-generation` untouched as found |
