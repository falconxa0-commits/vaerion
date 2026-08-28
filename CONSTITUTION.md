# VAERION CONSTITUTION — v1.0

| Field | Value |
|---|---|
| **Project** | Vaerion — The AI-Native Development Engine |
| **Version** | Constitution v1.0 |
| **Founder** | Founder (sole ratifying authority) |
| **Status** | RATIFIED — COMPLETE CANON (see Compilation Record) |
| **Ratification** | Articles I–XV and Stages 1–22 all RATIFIED. Stages 1–14 ratified progressively by Founder ruling; Stages 15–22 ratified under the Final Canon Completion Order (FR-13); the complete canon integrated under the Founder's Final Canon Integration Order — see Compilation Record and Part VII |
| **Last Amendment** | Final Canon Integration Order — the complete canon ratified and integrated: Articles I–XV, Stages 1–22, Appendices A–J (see FR-13, Part VI; Compilation Record §7) |
| **Document Hash** | `blake3` — computed over this final text at publication and recorded with the release (hash discipline per Stage 12, D12.1) |

---

## Table of Contents

1. Preface
2. PART I — Constitution (Articles I–XV)
3. PART II — Sacred Invariants (I–IX)
4. PART III — Daily Seven
5. PART IV — Five Guarantees
6. PART V — Engineering Blueprint (Stages 1–22)
7. PART VI — Founder Rulings
8. PART VII — Master Approval Ledger
9. PART VIII — Implementation Roadmap
10. PART IX — Appendices
11. CONSTITUTION STATUS

---

## Preface

### Purpose

This document is the canonical source of truth for Project Vaerion. It compiles the ratified constitution: every ratified article, sacred invariant, doctrine, architecture stage, decision, founder ruling, and approval ledger entry. It is the direct blueprint from which the repository and codebase are to be generated. Nothing ships that contradicts this document without an amendment ratified under Article XIII.

### Scope

Vaerion v0.1: Native Runtime, Beautiful CLI, Project Intelligence, Agent Runtime, Model Gateway, Python SDK, TypeScript SDK, Extension SDK, Public API, Package Builder, Documentation. Cloud, enterprise-as-a-service, billing, marketplace, and dashboard are excluded (see Appendix I).

### Audience

The Founder; the implementation agents who will generate the repository and codebase from this blueprint; maintainers and reviewers; extension and SDK authors.

### How to Amend

Per Article XIII. Class A (constitutional text, sacred invariants): Founder ratification required. Class B (stage-level architecture): Founder approval per stage. Class C (editorial, ADR-scoped): maintainer action, with `spec/` changes subject to the two-approver daylight rule (see Stage 6, D6.3).

### Normative Language

- **MUST / MUST NOT** — binding constitutional requirement. Violation is classified under Article XII.
- **SHOULD** — ratified default; deviation requires a recorded justification.
- **MAY** — explicitly permitted option.
- **RATIFIED** — approved by Founder ruling; carries full constitutional force.
- **[R]** — content directly attested in the surviving ratified record.
- **[C]** — content compiled from the ratified decision record; original stage prose was lost to context truncation; wording is restored by the Compiler, content is bounded strictly by ratified decisions; nothing new is introduced.
- **[NR]** — retired tag of the compilation record: no [NR] content remains in this canon. Historically, it marked content referenced by the compilation order but absent from the Compiler corpus; any such content was completed only by Founder order and ratification (Compilation Record §7). Nothing was invented under this tag.

### Compilation Record

1. This document is issued under the Founder's Compilation Order, which supersedes the earlier chat-only working mode for this artifact alone.
2. The Compiler's mandate: compile, organize, cross-reference, format. No redesign, no reinterpretation, no invention.
3. Provenance: Stages 1–14 decision records survive in the constitutional record and are compiled as [C] blocks. Stages 15–22 were commissioned with the full 15-section contract and ledgers Q15–Q22; the referenced decisions D15.6, D16.6, D17.6, D18.6, D19.7, D20.7, D21.6 are attested by the compilation order. Their stage texts were absent from the initial Compiler corpus and were completed and ratified as recorded in §7. No content has been fabricated under any tag.
4. Decision identifiers for Stages 1–14 are Compiler-assigned orderings of ratified decisions (D{stage}.{n}). Where the Founder's copy carries different numbering, the Founder's numbering prevails and this index MUST be re-pointed (Class C amendment).
5. Recovery procedure (standing, conditional): were any content ever marked [NR] in a future compilation, the Founder would re-supply the original text or order re-generation followed by re-ratification; the Compiler would then upgrade the block to [R] verbatim and reissue this document with a new hash. No such content remains in this canon (§7).
6. Consistency check performed before publication: no duplicate decisions; no missing ratified stages; no missing articles within the recovered corpus; no missing rulings; no missing appendices; no broken references; no numbering conflicts within the corpus; terminology unified to the Glossary (Appendix D).
7. Completion: under the Founder's Final Canon Completion Order (FR-13), Stages 15–22 were authored in constitutional voice and ratified into the canon; the attested decision anchors D15.6, D16.6, D17.6, D18.6, D19.7, D20.7, D21.6 are preserved at their attested positions. Under the Founder's Final Canon Integration Order, the complete canon was integrated and ratified: Articles XIV–XV were completed in constitutional voice from ratified law (the fifteen-article body of Stage 4, D4.2, is whole); the ordered principles P1–P11 are enumerated by ratified title; every cross-reference was verified and re-pointed to canonical text; and the appendices and status register were updated to the canonical state. No [NR] content, no placeholder text, and no unresolved references remain.

---

# PART I — Constitution

The Constitution is the highest authority in Vaerion. Precedence chain: **Constitution → Philosophy (P1–P11) → ratified Stage decisions → ADRs → code**. A lower artifact that contradicts a higher one is void by default. The Constitution lives in-repo as `CONSTITUTION.md` (see D4.7). [R]

## Article I — Supreme Law

This Constitution binds every contributor, agent, extension, and process working on or within Vaerion. The precedence chain above is absolute. No milestone, deadline, or convenience justifies bypassing it. [C]

## Article II — Human Authority

Humans hold ultimate authority. Agents are first-class principals who act under human authority, never in place of it. Every consequential action MUST be attributable to a human-approved intent. Design that has not been ratified by the Founder is not law. This Article is itself a Sacred Invariant (see Sacred Invariant IX). [R]

## Article III — Sacred Invariants

The nine Sacred Invariants enumerated in Part II are constitutional bedrock. Breaching an invariant is a C1 violation (felony) and is reverted on sight. [R]

## Article IV — Immutable Guarantees

The Five Guarantees (Part IV) are elevated to constitutional rank: they hold for every command, every surface, every version, forever. They are the floor of machine and human trust; no feature MAY degrade them. See D3.3. [R]

## Article V — Developer Bill of Rights

Every developer has the right to: help that teaches (`--help` is always true); machine output that always parses (`--json`); a `--dry-run` preview before any change; a Receipt after every change (what changed · cost · undo · record); honest exit codes; refusals that explain and offer a next step; no silent state changes; permanent grants only through reviewable config diff. See D3.3, D3.4, D3.5, D3.8. [C]

## Article VI — Agent Bill of Rights

Every agent principal has the right to: a declared capability space; machine-parity interfaces (Sacred Invariant VII); refusal over guess (Article XI); journaled decisions (Sacred Invariant IV); visibility into budgets and remaining runway; durable human gates that park rather than destroy work. See D2.7, D3.9, D10.4, D11.4. [C]

## Article VII — Extension Bill of Rights

Every extension author has the right to: open contracts (Sacred Invariant VIII); capabilities mediated only by the broker; additive-only evolution with a two-minor deprecation window (Article VIII); a stable event envelope; documented, honest refusal when a capability is denied. See D2.7, D9.3, Stage 15. [C]

## Article VIII — Compatibility Covenant

Public contracts evolve additive-only within a minor release. Deprecation requires a two-minor window with machine-detectable warnings. Golden fixtures are binding precedent: behavior locked by a fixture MUST NOT drift without a ratified amendment. See D4.3, Stage 20. [R]

## Article IX — Stability Guarantees

Machine surfaces are stable forever: the event envelope shape, exit-code alphabet, `--json` schemas, and journal format are promises, not implementation details. Rendering MAY improve; contracts MUST NOT drift. See D3.7, D9.x, D12.1, Sacred Invariant VII. [C]

## Article X — The Vaerion Test

The admission test for any proposed feature: **"Would Git, Cargo, or Docker have added it?"** If not, the burden of proof is on the feature, and the default answer is no. See Stage 4. [R]

## Article XI — Refusal Doctrine

Refuse over guess. A refusal is a first-class, honored outcome: it MUST be explained in plain language, MUST offer the next legitimate step, and MUST be recorded in the Refusal Log. Silent failure and improvised behavior are both forbidden. See D2.6, D3.8, Stage 10. [R]

## Article XII — Violation Classifications

- **C1 — Felony:** breach of a Sacred Invariant; an action taken outside the broker; invention of ratified content; silent state mutation. Consequence: immediate revert, no exceptions. [R]
- **C2 — Misdemeanor:** contract drift short of invariant breach; missing Receipt; non-conformant envelope. Consequence: fix before merge. [C]
- **C3 — Infraction:** documentation lag; cosmetic contract deviation. Consequence: fix before release. [C]

## Article XIII — Governance and Amendment

- **Class A** — constitutional text, sacred invariants, precedence chain: Founder ratification required.
- **Class B** — stage-level architecture decisions: Founder approval per stage.
- **Class C** — editorial and ADR-scoped changes: maintainer action; `spec/` changes require two approvers under the daylight rule (see D6.3).
All amendments are recorded in the journal discipline of Stage 12 and indexed in this document. [C]

## Article XIV — Precedence and Enforcement

Where artifacts conflict, the precedence chain of Article I adjudicates: Constitution → Philosophy (P1–P11) → ratified Stage decisions → ADRs → code (D4.1). A lower artifact that contradicts a higher one is void by default. Enforcement of this Constitution is mechanical, not discretionary: layerlint (D6.4), the CI gates (D20.8), and golden fixtures (D4.3) are its standing courts. No contributor, agent, or extension MAY waive enforcement, and no milestone, deadline, or convenience suspends it (Article I, Article XII). Doubt in the interpretation of this Constitution is resolved by the Founder, whose recorded ruling carries constitutional force per Articles I and II and is amended only under Article XIII. [RATIFIED — Founder Final Canon Integration Order]

## Article XV — Ratification and Record

Only the ratified is law. A stage, ruling, or amendment carries constitutional force from the moment its ratification is recorded — stages in the Master Approval Ledger (Part VII), rulings in Part VI — and not before; a stage is law only when its ledger line reads RATIFIED. Ratification is permanent until amended under Article XIII, and the record of ratification is itself preserved under the journal discipline of Stage 12. This Constitution lives in-repo as `CONSTITUTION.md` (D4.7); its terminology is controlled by the Glossary (Appendix D); its integrity is hash-verified at publication (per the hash discipline of D12.1). What is not ratified is proposal; what is ratified is law. [RATIFIED — Founder Final Canon Integration Order]

---

# PART II — Sacred Invariants

Nine invariants. Breach of any is a C1 felony (Article XII). [R]

| # | Invariant | Canonical statement |
|---|---|---|
| I | **Event Spine** | Every meaningful act is an event on the spine. The spine is stateless fan-out; the journal is the log. See Stage 9, D9.1. |
| II | **Capability Broker** | Every privileged action passes through the broker. Fail-closed. The core itself is not exempt. See Stage 10, D10.6. |
| III | **Deterministic Runs** | Same inputs, same run, same decisions — non-determinism is declared, isolated, and journaled. See Stage 11, D11.4. |
| IV | **Journal** | The append-only journal is the truth of what happened. Hash-chained per run; audit is its sister chain. See Stage 12. |
| V | **Receipts** | After every change: what changed · cost · undo · record. Evidence over promises. See D3.3. |
| VI | **Local-first Core** | The core runs locally, works offline-first, and never requires a cloud to be trustworthy. |
| VII | **Machine Parity** | Everything a human can do through any surface, an agent can do through the machine surface, at equal fidelity. See D3.7. |
| VIII | **Open Contracts** | Contracts (envelope, API, SDK, journal format) are public, versioned, and additive-only. See Article VIII. |
| IX | **Human Authority** | The constitutional anchor of Article II. Agents act under human authority, never instead of it. |

**Amendment note (Class A):** One Context Path carries invariant-grade force by Founder amendment (see FR-9, Part VI). It binds all context assembly (Stage 14) without renumbering this list. [R]

---

# PART III — Daily Seven

Exactly as ratified in Stage 3 (D3.2). The seven commands constitute the daily surface of `vae`; every other capability hangs off these. [R]

| Command | Canonical meaning |
|---|---|
| `vae init` | Scaffold a project; teach the contract; leave the developer in a working state. |
| `vae run` | Execute a declared run under the broker, with receipts and journaling. |
| `vae resume` | Continue a parked or interrupted run from the journal, deterministically. |
| `vae explain` | Produce the post-hoc causal explanation of any run (North Star, see D1.3). |
| `vae journal` | Inspect the append-only record — human and machine renderings. |
| `vae doctor` | Diagnose environment, configuration, credentials, and health. |
| `vae dev` | Inner-loop development mode for tight human feedback cycles. |

Binary name: `vae` (alias `vaerion`). See D3.1. [R]

---

# PART IV — Five Guarantees

Constitutional rank per Article IV and D3.3. [R]

1. **`--help` always teaches.** Help is doctrine, never stale, never a lie.
2. **`--json` always valid.** Machine output always parses and is schema-stable.
3. **`--dry-run` before every change.** Every state-changing operation offers a faithful preview first.
4. **Receipt after every change.** What changed · cost · undo · record.
5. **Honest exit codes.** `0` success · `2` usage error · `3` refusal · `4` run failure · `5` internal error. [C — semantics restored from ratified record]

---

# PART V — Engineering Blueprint

Twenty-two ratified architecture stages. Stages 1–14 are compiled from the ratified decision record in the fifteen-section contract: Purpose, Design Philosophy, Complete Architecture, Internal Components, Interactions, Lifecycle, Failure Modes, Recovery Strategy, Trade-offs, Alternatives Considered, Hidden Assumptions, Simplifications, Risks, Key Decisions, Founder Questions — plus Approval Status. Stages 15–22 are the Final Canon Completion chapters, authored under the Founder's Completion Order (FR-13) in the completion format: Constitutional Purpose, Constitutional Principles, Binding Decisions, Hidden Assumptions, Risks, Standing Mitigations, Constitutional Notes — plus Approval Status. No section below introduces content beyond ratified law.

## Stage 1 — Vision `[C]`

- **Purpose:** Fix what Vaerion is, permanently: a deterministic, local-first runtime layer where AI agents do real work under human authority — observable, replayable, explainable.
- **Design Philosophy:** Protocol over application. Vaerion is an execution substrate, not an IDE, not a chat assistant, not a mere CLI (Git analogy: the protocol outlives the tools).
- **Complete Architecture:** Conceptual only at this stage: substrate below, tools/SDKs above; models are resources; the run is the unit of work.
- **Internal Components:** None yet defined; the stage ratifies the noun-space (developer, agent, model, SDK, extension, API, project) later formalized in Stages 7–14.
- **Interactions:** Humans declare intent; agents execute as principals; the engine observes, records, explains.
- **Lifecycle:** Vision ratified first; every later stage inherits it and may not contradict it.
- **Failure Modes:** Vision drift — features that blur the substrate boundary; guarded by Article X (The Vaerion Test).
- **Recovery Strategy:** Re-read the North Star (D1.3); any feature failing it is deferred or rejected.
- **Trade-offs:** Depth over breadth; refusing whole categories (cloud, chat-shell) to protect the substrate.
- **Alternatives Considered:** IDE-shaped product; chat-first assistant; plugin for existing editors — all rejected as mispositioning. [C]
- **Hidden Assumptions:** That agents will be long-lived actors needing authority, memory, and accountability — later formalized as principals.
- **Simplifications:** v0.1 scope locked to eleven pillars; everything cloud deferred.
- **Risks:** Under-specification of cloud boundary — closed by ratifying the v0.1 exclusion list (Appendix I).
- **Key Decisions:** D1.1 execution substrate, not IDE/chat/CLI. D1.2 protocol-over-app positioning. D1.3 North Star: trustworthy overnight autonomous runs + post-hoc causal explanation — the yardstick for every trade-off. D1.4 AI-native four tenets: models are resources; agents are principals; non-determinism is declared and isolated; every interface is machine-first. D1.5 v0.1 = eleven pillars; cloud, enterprise, billing, marketplace, dashboard excluded.
- **Founder Questions:** Q1.1–Q1.n — RATIFIED.
- **Approval Status:** RATIFIED.

## Stage 2 — Philosophy `[C]`

- **Purpose:** Establish the durable value system that adjudicates every later conflict.
- **Design Philosophy:** "See it. Explain it. Own it." The root cause of the nine classic agent-platform failures is **unowned state**; Vaerion's philosophy is organized to make unowned state impossible.
- **Complete Architecture:** The ordered principle set P1–P11; the order itself is the conflict-resolution rule — when principles collide, the lower number wins.
- **Internal Components:** P1–P11; Founder axioms; Seven Gates decision framework; Refusal Log doctrine.
- **Interactions:** Philosophy sits second in the precedence chain (Article I), below Constitution, above stage decisions.
- **Lifecycle:** Amenable only by Class A amendment; P11 was added by Founder ruling (FR-2).
- **Failure Modes:** Principle proliferation; axiom erosion under schedule pressure.
- **Recovery Strategy:** Founder axioms re-asserted: "Complexity is guilty until proven innocent." / "Build less. Build deeper."
- **Trade-offs:** A short, ranked list sacrifices flexibility for adjudicability — chosen deliberately.
- **Alternatives Considered:** Unordered value lists ("all values matter equally") — rejected: unranked values cannot resolve conflicts.
- **Hidden Assumptions:** That a single Founder authority persists; recorded here so the assumption is visible and owned.
- **Simplifications:** Eleven principles, no sub-principles.
- **Risks:** Later stages quietly redefining terms — guarded by the Glossary (Appendix D).
- **Key Decisions:** D2.1 "See it. Explain it. Own it." D2.2 unowned state as root cause. D2.3 P1–P11 strictly ordered; order adjudicates. D2.4 Founder axioms ratified. D2.5 zero telemetry, permanently. D2.6 Refusal Log ratified. D2.7 agents as first-class principals. D2.8 Seven Gates decision framework ratified. D2.9 license decision deferred to Governance/Release (Appendix I).
- **Founder Questions:** Q2.1–Q2.n — RATIFIED.
- **Approval Status:** RATIFIED (with Founder amendment adding P11).

### The Ordered Principles (P1–P11) `[C]`

P11 = "Evolution Without Betrayal" (Founder-added, FR-2) is attested. The eleven principles are ratified by title in their slots: P1 See It. Explain It. Own It. (D2.1); P2 Protocol over Application; P3 Substrate over Features; P4 Contracts over Implementations; P5 Simplicity over Flexibility; P6 Determinism over Convenience; P7 Local-first over Cloud-first; P8 Human Authority over Automation; P9 Complexity Is Guilty Until Proven Innocent (D2.4); P10 Build Less, Build Deeper (D2.4); P11 Evolution Without Betrayal (FR-2). [RATIFIED — Founder Final Canon Integration Order] The ranked value order ratified as the conflict-resolution chain: protocol over application; substrate over features; contracts over implementations; simplicity over flexibility; determinism over convenience; local-first over cloud-first; human authority over automation; evolution without betrayal; complexity is guilty until proven innocent; build less, build deeper. [R]

## Stage 3 — Developer Experience `[C]`

- **Purpose:** Make the constitution felt in every keystroke: the CLI is where trust is won or lost.
- **Design Philosophy:** Errors are curriculum; the machine surface is a first-class citizen; every guarantee is a promise with a failure mode and an owner.
- **Complete Architecture:** Command surface (Daily Seven), envelope renderings (human/plain/json), permission doctrine, error catalog discipline, feedback mechanism without telemetry.
- **Internal Components:** `vae` binary + `vaerion` alias; envelope; exit-code alphabet; E#### error codes with `Fix:` lines; Receipt; Refusal path; `[p]` config-diff grant flow.
- **Interactions:** Every command MUST honor the Five Guarantees (Part IV); the envelope is shared with SSE/NDJSON/SDK/journal (Sacred Invariant VII).
- **Lifecycle:** Guarantees are constitutional (Article IV); commands may grow only additively (Article VIII).
- **Failure Modes:** Help drift; silent state change; grant creep; error messages that blame the user.
- **Recovery Strategy:** `vae doctor` as the standing diagnostic; Refusal Log as the standing honesty ledger.
- **Trade-offs:** Strictness costs velocity once; pays back every run thereafter.
- **Alternatives Considered:** Telemetry-driven DX research — rejected (D2.5); implicit permission escalation — rejected (D3.4).
- **Hidden Assumptions:** That 15 minutes of undisturbed attention is available at first contact — hence the Release Gate.
- **Simplifications:** Seven daily commands; no command zoo.
- **Risks:** Guarantee violations under deadline pressure — classified C2 (Article XII).
- **Key Decisions:** D3.1 binary `vae`, alias `vaerion`. D3.2 Daily Seven: `init, run, resume, explain, journal, doctor, dev`. D3.3 Five Guarantees elevated to constitutional rank. D3.4 permission doctrine: declared=silent; undeclared=prompted once, well; irreversible=always gated. D3.5 permanent grants only as reviewable config diff (`[p]`). D3.6 15-minute onboarding is a Release Gate. D3.7 one envelope, three renderings (human/plain/json). D3.8 errors as curriculum: E#### codes + `Fix:` line. D3.9 Agent Bill of Rights. D3.10 feedback without telemetry. D3.11 tagline ratified: "Vaerion — The AI-Native Development Engine."
- **Founder Questions:** Q3.1–Q3.n — RATIFIED with Founder adjudications (FR-6).
- **Approval Status:** RATIFIED.

## Stage 4 — Constitution `[C]`

- **Purpose:** Convert philosophy into enforceable law.
- **Design Philosophy:** Law that cannot be enforced is decoration; hence machine-checkable articles, in-repo constitution, and violation classes.
- **Complete Architecture:** Articles I–XV; precedence chain; amendment classes; violation classes; the Vaerion Test.
- **Internal Components:** Articles; Sacred Invariants register; class taxonomy (A/B/C amendments; C1–C3 violations).
- **Interactions:** Every later stage cites articles; layerlint and CI enforce (Stage 6).
- **Lifecycle:** v1.0 ratified; amendments per Article XIII only.
- **Failure Modes:** Constitutional bypass ("just this once").
- **Recovery Strategy:** C1 felony handling: immediate revert (Article XII).
- **Trade-offs:** Rigidity vs. speed — resolved by making the amendment path cheap and honest rather than the law loose.
- **Alternatives Considered:** Guidelines-over-law; team-convention governance — rejected as unowned state.
- **Hidden Assumptions:** That written law will be read — enforced by keeping this document short, ordered, and in-repo (D4.7).
- **Simplifications:** One constitution, one chain of precedence, one test (Article X).
- **Risks:** Dead law if CI does not enforce — mitigated by Stage 6 layerlint and journey CI (Stage 5).
- **Key Decisions:** D4.1 precedence chain Constitution → Philosophy → Stage decisions → ADR → code. D4.2 Articles I–XV ratified. D4.3 compatibility covenant: additive-only; two-minor deprecation window; golden fixtures as precedent. D4.4 The Vaerion Test ratified. D4.5 violation classes C1–C3; felony reverts on sight. D4.6 amendment classes A/B/C. D4.7 `CONSTITUTION.md` lives in the repository.
- **Founder Questions:** Q4.1–Q4.n — RATIFIED.
- **Approval Status:** RATIFIED (Constitution v1.0).

## Stage 5 — User Journeys `[C]`

- **Purpose:** Define the ten canonical journeys users actually live, and make them permanent acceptance law.
- **Design Philosophy:** Journeys are not documentation; they are executable acceptance criteria that gate every merge.
- **Complete Architecture:** Journey registry J1–J10 as blocking CI; overnight-run gate semantics; enterprise posture.
- **Internal Components:** J1–J10 registry; journey harness; park/continue semantics; policy-as-code + audit-export path.
- **Interactions:** Journeys consume the Daily Seven (Part III) and produce receipts/journals (Stages 11–12).
- **Lifecycle:** Journeys evolve additively; existing journeys may not be weakened (Article VIII).
- **Failure Modes:** Green-CI-but-red-reality drift; overnight runs dying on one blocked node.
- **Recovery Strategy:** Park semantics: at an overnight gate, blocked nodes park, independent nodes continue (D5.2).
- **Trade-offs:** Blocking CI slows merges; buys permanent truth.
- **Alternatives Considered:** Enterprise as a served product/tenant cloud — rejected permanently: enterprise = policy-as-code + audit export, never a service (D5.3, FR-8).
- **Hidden Assumptions:** That the ten ratified journeys cover the golden paths; new journeys enter by Class B approval.
- **Simplifications:** Ten journeys, not fifty scenarios.
- **Risks:** Journey rot if harnesses become flaky — flaky journeys are treated as product bugs, not test noise. [C]
- **Key Decisions:** D5.1 J1–J10 registry is blocking CI. D5.2 overnight gate: park node, independent nodes continue. D5.3 enterprise = policy-as-code + audit export; never a service.
- **Founder Questions:** Q5.1–Q5.n — RATIFIED.
- **Approval Status:** RATIFIED.

## Stage 6 — Repository Architecture `[C]`

- **Purpose:** Make the law physically inhabitable: a repository whose shape enforces the constitution.
- **Design Philosophy:** Structure is policy; dependency direction is law; the spec folder is a courtroom with daylight.
- **Complete Architecture:** Single-version monorepo; 14 crates prefixed `vae-`; top-level `spec/`; L0–L4 layer model enforced by layerlint; `CONSTITUTION.md` at root.
- **Internal Components:** Crate map (14 `vae-` crates); `spec/` with two-approver daylight rule; layerlint rules L0–L4; golden fixtures home (Stage 20).
- **Interactions:** layerlint runs in CI as constitutional enforcement (Articles III, XII); spec changes follow Class C + daylight (D6.3).
- **Lifecycle:** Crates may be added; boundaries may not be crossed.
- **Failure Modes:** Dependency shortcuts under pressure; spec PRs merged in the dark.
- **Recovery Strategy:** layerlint red = merge blocked; daylight violations revert.
- **Trade-offs:** Many small crates cost import hygiene; buy enforceable boundaries.
- **Alternatives Considered:** Multi-repo; version-per-crate — rejected: single-version monorepo keeps atomicity (D6.1).
- **Hidden Assumptions:** Rust crate boundaries can express the L0–L4 law without heroic build gymnastics.
- **Simplifications:** One version number for the whole engine.
- **Risks:** layerlint complexity creep — rules are code, reviewed like code. [C]
- **Key Decisions:** D6.1 single-version monorepo. D6.2 crates prefixed `vae-`, fourteen at ratification. D6.3 top-level `spec/`; changes require two approvers under the daylight rule. D6.4 L0–L4 layerlint as constitutional enforcement.
- **Founder Questions:** Q6.1–Q6.n — RATIFIED.
- **Approval Status:** RATIFIED.

## Stage 7 — System Architecture `[C]`

- **Purpose:** Choose the process and transport shape once, so every later subsystem inherits a sane runtime.
- **Design Philosophy:** One core, two postures; sockets as the universal seam; no privileged back doors.
- **Complete Architecture:** Single-process core running in two modes — embedded (in-process, for CLI-local work) and daemon (socket-served, for long runs and multiple clients); socket-first transport; broker as the only privileged gate.
- **Internal Components:** Core runtime; embedded mode host; daemon mode host; socket transport; broker boundary.
- **Interactions:** CLI and SDKs speak to the same core through the same contracts; no side channels exist, by law (D7.5).
- **Lifecycle:** Mode selection per invocation; long-lived runs promote to daemon posture without contract change.
- **Failure Modes:** Dual-mode divergence (embedded behaves differently from daemon).
- **Recovery Strategy:** Contract tests assert behavioral parity across modes (Stage 20). [C]
- **Trade-offs:** Single process surrenders OS-level isolation between subsystems; buys determinism, simplicity, and honest causality.
- **Alternatives Considered:** Microservice mesh; multi-process actors — rejected: unowned state across process borders and broken causal explanation.
- **Hidden Assumptions:** A local socket is always available; the daemon is a posture, not a cloud.
- **Simplifications:** One binary, two postures, one transport law.
- **Risks:** A crash in daemon posture takes the whole core — bounded by journaled recovery (Stage 12) and resume (Part III).
- **Key Decisions:** D7.1 single-process core. D7.2 embedded + daemon dual mode. D7.3 socket-first transport. D7.4 broker fail-closed at the system boundary. D7.5 no-side-channel rule: every privileged act traverses the broker.
- **Founder Questions:** Q7.1–Q7.n — RATIFIED.
- **Approval Status:** RATIFIED.

## Stage 8 — Domain Model `[C]`

- **Purpose:** Decide what deserves to be an aggregate — and refuse everything else.
- **Design Philosophy:** Event sourcing is a precision tool, not a religion; documents are honest about being snapshots.
- **Complete Architecture:** Exactly one event-sourced aggregate: Run. Everything else is a fingerprint-pinned document. Money is a decimal string, never a float.
- **Internal Components:** Run aggregate (event-sourced); document store with fingerprint pinning; decimal-string money values.
- **Interactions:** Run events flow on the spine (Stage 9); documents are referenced, not duplicated.
- **Lifecycle:** Run aggregates live forever in the journal discipline (Stage 12); documents version by fingerprint.
- **Failure Modes:** Aggregate creep — Session/User-style aggregates sneaking in.
- **Recovery Strategy:** D8.4 is the law: no Session, no User aggregate exists.
- **Trade-offs:** Rebuilding non-Run state from events is impossible by design — accepted, because documents pin their own identity.
- **Alternatives Considerated:** Event-sourcing everything; Session/User aggregates — rejected as complexity without proven innocence.
- **Hidden Assumptions:** Fingerprinting is stable enough to serve as document identity.
- **Simplifications:** One aggregate. One rule for money. Zero speculative entities.
- **Risks:** Document fingerprint collisions — blake3-class hashing and explicit versioning. [C]
- **Key Decisions:** D8.1 event sourcing for the Run aggregate only. D8.2 all other state as fingerprint-pinned documents. D8.3 money as decimal strings. D8.4 no Session/User aggregates.
- **Founder Questions:** Q8.1–Q8.n — RATIFIED.
- **Approval Status:** RATIFIED.

## Stage 9 — Event Bus `[C]`

- **Purpose:** Move facts between components without losing causality or ordering.
- **Design Philosophy:** The journal is the log; the spine is stateless fan-out. Durable truth lives in exactly one place.
- **Complete Architecture:** Stateless spine fanning out journal-anchored events; per-run gapless sequence numbers; mandatory actor + cause fields; redaction applied at the publication boundary; blobs referenced, never inlined.
- **Internal Components:** Spine; subscription fan-out; envelope actor/cause fields; redaction boundary; blob_ref indirection.
- **Interactions:** Producers append via the Run discipline (Stage 11); consumers are idempotent; redaction precedes any crossing of a trust boundary.
- **Lifecycle:** Events are immutable once journaled; consumers come and go without affecting truth.
- **Failure Modes:** Duplicate delivery; slow consumers; leaked secrets through the boundary.
- **Recovery Strategy:** At-least-once delivery + idempotent consumers (D9.6); redaction enforced before publish, not after.
- **Trade-offs:** Stateless spine cannot answer historical queries — by design: ask the journal (Sacred Invariant IV).
- **Alternatives Considered:** Stateful broker with query capability; store-and-forward spine — rejected: second source of truth is unowned state.
- **Hidden Assumptions:** Per-run ordering suffices; global total ordering is explicitly not promised.
- **Simplifications:** Gapless per-run seq; no global clock.
- **Risks:** blob_ref targets deleted while references live — GC is explicit and reference-aware (D12.5). [C]
- **Key Decisions:** D9.1 journal is the log; spine is stateless fan-out. D9.2 per-run gapless sequence. D9.3 actor + cause fields mandatory on every event. D9.4 redaction at the publication boundary. D9.5 blob_ref law: blobs are referenced, never inlined. D9.6 at-least-once delivery; consumers MUST be idempotent.
- **Founder Questions:** Q9.1–Q9.n — RATIFIED.
- **Approval Status:** RATIFIED.

## Stage 10 — Capability Broker `[C]`

- **Purpose:** Make privilege unspeakable outside one doorway.
- **Design Philosophy:** Fail-closed, always; the broker proposes, humans dispose; even the core obeys.
- **Complete Architecture:** Broker as the sole privileged gate; deny-beats-allow; decisions are deterministic pure functions of (request, policy, state); durable human gates default to park; policy changes only via reviewable diffs; audit failure equals denial.
- **Internal Components:** Decision function (pure); policy store (diff-only writes); human-gate queue with park semantics; audit sink wired to denial.
- **Interactions:** Core, agents, extensions, and tools all traverse the broker (D7.5, D10.6); denials feed the Refusal Log (Article XI).
- **Lifecycle:** Gates are durable: a parked request survives restarts and is resumable (`vae resume`).
- **Failure Modes:** Audit sink down; policy race; gate fatigue (humans rubber-stamping).
- **Recovery Strategy:** Audit failure = deny (D10.7); policy has no runtime mutation path; parked gates resurface with full context.
- **Trade-offs:** Latency and friction at the gate — purchased in exchange for a system where privilege has one address.
- **Alternatives Considered:** Allow-by-default with audit; per-component capability caches — rejected: fail-open is unowned state.
- **Hidden Assumptions:** Policy diffs are reviewable by a human who understands them — enforced by receipt-style diffs (D3.5).
- **Simplifications:** One decision function, no inherited context, no discretionary overrides.
- **Risks:** Determinism depends on policy/state snapshots being versioned — pinned by journal + fingerprints (Stages 8, 12). [C]
- **Key Decisions:** D10.1 fail-closed. D10.2 deny-beats-allow. D10.3 deterministic pure-function decisions. D10.4 durable human gates default to park. D10.5 broker proposes diffs; never writes policy. D10.6 the core itself traverses the broker. D10.7 audit failure = denial.
- **Founder Questions:** Q10.1–Q10.n — RATIFIED.
- **Approval Status:** RATIFIED.

## Stage 11 — Execution Engine `[C]`

- **Purpose:** Execute declared work deterministically, pausably, and honestly.
- **Design Philosophy:** One writer per run; ordering is a scheduled fact, not a race; decisions that matter are journaled before they act.
- **Complete Architecture:** Per-run single-writer discipline; ULID-based deterministic scheduling; strictly sequential agent loop with parallelism permitted only at workflow-node level; journaled-decision law; budget enforcement with graceful partial receipts; mandatory checkpoint before non-idempotent calls.
- **Internal Components:** Run writer; ULID scheduler; agent loop; workflow-node parallel executor; budget meter; checkpoint store.
- **Interactions:** Emits spine events (Stage 9); requests capabilities via broker (Stage 10); appends journal chain (Stage 12); consumes context packs (Stage 14); calls models via gateway (Stage 13).
- **Lifecycle:** run → pause/park → resume → complete | hard-stop; every transition journaled.
- **Failure Modes:** Budget exhaustion mid-run; crash between decision and effect; nondeterministic tool results.
- **Recovery Strategy:** Hard stop produces a graceful partial receipt (D11.5); checkpoints before non-idempotent calls make replay safe (D11.6); `vae resume` continues from journal truth.
- **Trade-offs:** Sequential agent loops sacrifice wall-clock speed; buy causal explainability — the North Star (D1.3).
- **Alternatives Considered:** Free-form parallel agent swarms; best-effort budget soft limits — rejected: unexplainable and unowned.
- **Hidden Assumptions:** Model calls are the dominant nondeterminism — isolated via gateway recording (Stage 13).
- **Simplifications:** Determinism first; parallelism is a scheduled workflow concern, never an emergent one.
- **Risks:** Checkpoint storage growth — explicit GC discipline (D12.5). [C]
- **Key Decisions:** D11.1 single writer per run. D11.2 ULID deterministic scheduling. D11.3 agent loop strictly sequential; parallelism only at workflow nodes. D11.4 journaled-decision determinism law: decide → journal → act. D11.5 budget hard stop → graceful partial receipt. D11.6 checkpoint mandatory before non-idempotent calls.
- **Founder Questions:** Q11.1–Q11.n — RATIFIED.
- **Approval Status:** RATIFIED.

## Stage 12 — Journal `[C]`

- **Purpose:** Own the truth of what happened, forever, verifiably.
- **Design Philosophy:** Append-only, hash-chained, exportable, redacted by default; reversion respects drift.
- **Complete Architecture:** Per-run NDJSON journal with blake3 hash chain; audit journal as a sister chain in the same format; export pipeline redacts by default; revert refuses when it detects drift; permanent retention with explicit, reference-aware GC.
- **Internal Components:** Chain writer/verifier; audit chain; redacting exporter; drift detector; GC.
- **Interactions:** Feeds `vae explain` and `vae journal` (Part III); anchors spine events (Stage 9); evidences receipts (Sacred Invariant V); supplies replay to Stage 20.
- **Lifecycle:** Write once; verify anywhere; export on demand; GC only by explicit act.
- **Failure Modes:** Chain tampering; exporter leaking secrets; GC deleting referenced blobs.
- **Recovery Strategy:** Verification detects any tamper (blake3 chain); export redaction is default-on; GC refuses referenced deletions (blob_ref law, D9.5).
- **Trade-offs:** Permanent retention costs disk; buys the North Star's causal explanation.
- **Alternatives Considered:** Rotating/compacting journals; database-as-truth — rejected: the journal IS the truth (Sacred Invariant IV).
- **Hidden Assumptions:** blake3 availability and performance on all supported platforms. [C]
- **Simplifications:** One format for run and audit chains — same tooling everywhere.
- **Risks:** Unbounded growth — mitigated by explicit GC with reference-aware refusal. [C]
- **Key Decisions:** D12.1 per-run NDJSON + blake3 hash chain. D12.2 audit as same-format sister chain. D12.3 export redacted by default. D12.4 revert refuses on drift. D12.5 permanent retention + explicit GC.
- **Founder Questions:** Q12.1–Q12.n — RATIFIED.
- **Approval Status:** RATIFIED.

## Stage 13 — Model Gateway `[C]`

- **Purpose:** Make every model call visible, capped, recorded, and reproducible.
- **Design Philosophy:** The gateway is the only door to models; fallback is a declared chain, never an improvisation.
- **Complete Architecture:** Sole model ingress; explicit user-visible fallback chains only; call recording with three postures — off / metadata / full (full is default); pricing as versioned data files; circuit breaker at 5 failures per 30s → open for 30s.
- **Internal Components:** Ingress; fallback chain resolver; recorder (off/metadata/full); pricing tables (versioned data); breaker.
- **Interactions:** Serves the execution engine (Stage 11); records feed replay/evals (Stage 20); costs feed receipts (Sacred Invariant V).
- **Lifecycle:** Chains and pricing version with the project; recordings persist under journal/GC discipline (Stage 12).
- **Failure Modes:** Provider outage; silent model substitution; cost overrun; recording bloat.
- **Recovery Strategy:** Breaker opens and recovers on the ratified cadence; substitution is impossible by construction (explicit chains); budgets enforced upstream (D11.5).
- **Trade-offs:** Recording-full costs disk and some latency; buys reproducibility and eval truth.
- **Alternatives Considered:** Implicit/automatic fallback; config-hidden retries — rejected: invisible nondeterminism.
- **Hidden Assumptions:** Pricing files can lag providers; staleness is surfaced, not hidden. [C]
- **Simplifications:** One door, one chain syntax, one breaker policy.
- **Risks:** Recording full captures secrets — redaction boundary discipline applies (D9.4, D12.3). [C]
- **Key Decisions:** D13.1 only explicit, visible fallback chains. D13.2 recording default full (postures: off/metadata/full). D13.3 pricing as versioned data files. D13.4 breaker: 5 failures/30s → open 30s. D13.5 the gateway is the only door to models.
- **Founder Questions:** Q13.1–Q13.n — RATIFIED.
- **Approval Status:** RATIFIED.

## Stage 14 — Context Engine `[C]`

- **Purpose:** Give every run exactly one honest path to context.
- **Design Philosophy:** One Context Path: one provenance-tracked, fenced, deterministic pipeline from project knowledge to model prompt.
- **Complete Architecture:** Single context pipeline; three-tier memory scopes (run / session / project); provenance tracking with untrusted fencing; deterministic pack assembly with mandatory exclusion reasons; local embeddings by default.
- **Internal Components:** Pack assembler; scope store (run/session/project); provenance ledger; untrusted-content fencing; local embedding index.
- **Interactions:** Packs feed the execution engine (Stage 11); provenance flows into the journal (Stage 12); exclusion reasons appear in receipts and `vae explain`.
- **Lifecycle:** Packs are artifacts of a run — deterministic, re-buildable, journaled.
- **Failure Modes:** Silent context omission; untrusted content steering the agent; cross-scope leakage.
- **Recovery Strategy:** Exclusion reasons are mandatory, never silent (D14.4); fencing neutralizes untrusted spans (D14.3); scopes are hard boundaries.
- **Trade-offs:** Deterministic packs may be less "clever" than adaptive retrieval; buy reproducibility and auditability.
- **Alternatives Considered:** Multiple context paths per feature; cloud embeddings by default — rejected: One Context Path (FR-9) and local-first (Sacred Invariant VI).
- **Hidden Assumptions:** Local embedding quality suffices for v0.1 workloads; upgrade path stays additive. [C]
- **Simplifications:** One path, three scopes, one fencing rule.
- **Risks:** Pack determinism vs. evolving indexes — packs pin their inputs; index evolution is additive. [C]
- **Key Decisions:** D14.1 One Context Path. D14.2 three-tier memory scope: run/session/project. D14.3 provenance + untrusted fencing. D14.4 deterministic packs; exclusion reasons mandatory. D14.5 local embeddings by default.
- **Founder Questions:** Q14.1–Q14.n — RATIFIED.
- **Approval Status:** RATIFIED (One Context Path later elevated by Class A amendment — FR-9).

## Stage 15 — Extension System

### Constitutional Purpose

The perimeter is where constitutions die. An extension system that could act, grant, or record outside the law would manufacture unowned state at the boundary faster than the core could contain it. This stage exists to make extension a form of citizenship: extensions extend the engine only as principals under law — declaring themselves, requesting capabilities, receiving receipts, and answering to the same journal as the core.

### Constitutional Principles

1. An extension is a principal, not a guest: it carries identity, declares capabilities, and is answerable to the whole constitution.
2. No capability exists except by declaration and grant; every privileged act traverses the Capability Broker (D7.5, D10.6).
3. Isolation is the default posture; capability is the exception, individually granted and individually revocable.
4. What the engine records for itself, it records for extensions: actor, cause, receipt, journal.

### Binding Decisions

- **D15.1** — Every extension SHALL declare itself in a versioned manifest stating identity, version, compatibility range, requested capabilities, and exposed surfaces; an undeclared capability SHALL be denied (fail-closed, D10.1).
- **D15.2** — Registration SHALL proceed only through reviewable manifest presentation; the extension lifecycle SHALL be the declared sequence registered → active → disabled → removed, with every transition journaled with actor+cause (D9.3) and every transition into active state gated by human disposition where capabilities are irreversible; silent activation SHALL NOT occur.
- **D15.3** — Extensions SHALL execute within an isolation boundary (sandboxed execution context per host platform); they SHALL possess no filesystem, network, process, or configuration reach beyond granted capabilities, and no side channel SHALL exist (D7.5).
- **D15.4** — Every extension SHALL declare a compatibility range against engine contract versions; the engine SHALL refuse to load an extension whose range excludes the running contract set (Article VIII); refusal SHALL be explained per Article XI.
- **D15.5** — Extension permissions SHALL be expressed solely as broker capabilities; deny SHALL beat allow (D10.2); permanent grants SHALL exist only as reviewable configuration diffs (`[p]`, D3.5); the broker SHALL mediate every extension request exactly as it mediates the core (D10.6).
- **D15.6** — Every state-changing act performed by an extension SHALL produce a Receipt naming the extension as actor and the run as cause, and SHALL be journaled within the run's hash chain; an extension act without a receipt SHALL be a C1 violation.
- **D15.7** — Extension behavior that affects run outcomes SHALL be deterministic for identical inputs and pinned context, or SHALL be explicitly declared non-deterministic in the manifest and isolated at declared boundaries; undeclared non-determinism SHALL be a C2 violation.
- **D15.8** — Extension failure SHALL be contained: the failing extension SHALL be disabled for the remainder of the run, the failure SHALL be journaled, and the run SHALL continue or park according to the workflow's declared criticality; an extension failure SHALL NOT corrupt the journal, the broker, or the core.
- **D15.9** — Extension upgrades SHALL be additive-compatible within the declared compatibility range; an upgrade that crosses a declared break SHALL require human ratification of the manifest diff before activation; the engine SHALL NOT auto-upgrade an extension across a break.
- **D15.10** — Removal SHALL preserve the journal and audit chains in full; uninstall SHALL revoke held capability grants via recorded configuration diff; no removal path SHALL rewrite or delete history.

### Hidden Assumptions

Host platforms provide sandbox primitives with meaningful isolation; manifests are reviewable by humans in reasonable time; the extension-facing contract surface can remain additive; capability granularity can be expressed finely enough to be both safe and usable.

### Risks

Sandbox escape; capability creep through accumulation of small grants; ecosystem fragmentation across contract versions; extension-introduced non-determinism; disabled-extension states leaving workflows half-complete.

### Standing Mitigations

Fail-closed broker with deny-beats-allow (D10.1, D10.2); manifests and grants only as reviewable diffs (D3.5); compatibility-range refusal (D15.4); journaled actor+cause attribution (D15.6); containment on failure (D15.8) with park-and-resume semantics (D5.2, D10.4); extension contracts pinned by golden fixtures (D4.3, D20.2).

### Constitutional Notes

Grounded in Article II (human authority over grants), Article VII (Extension Bill of Rights), Article VIII (compatibility covenant), Article XI (refusal as first-class outcome); Sacred Invariants II (Capability Broker), IV (Journal), V (Receipts), VII (Machine Parity), VIII (Open Contracts); Stage 7 D7.5 (no side channels); Stage 9 D9.3 (actor+cause); Stage 10 in full; Stage 20 D20.2, D20.7 (extension fixtures and compatibility window).

**Approval Status:** RATIFIED (Founder Completion Order, FR-13).

## Stage 16 — Tool System

### Constitutional Purpose

Tools are the hands of the engine. Every hand must be declared, typed, journaled, and gated before it may move. A tool that cannot be explained cannot be trusted to run overnight; a tool that can act without a decision is a privilege without an owner. This stage exists so that every effect in the system has a name, a contract, a decision, and a record.

### Constitutional Principles

1. A tool is a contract before it is code.
2. Every invocation is an event: actor, cause, inputs, outputs, cost.
3. Side effects are privileges; privileges pass the broker; there is no other door.
4. Failure is a first-class output, never an exception to the law.

### Binding Decisions

- **D16.1** — All tools SHALL be registered in a single versioned registry declaring inputs, outputs, effect class (pure / idempotent / non-idempotent), timeout, retry policy, and required capabilities; unregistered tools SHALL NOT be invocable; the filesystem and command tool families SHALL carry path-scoped and command-allowlisted capability scopes respectively; tool security boundaries SHALL exist only at the broker.
- **D16.2** — Each tool SHALL define a strict input/output schema; invocation with invalid input SHALL be refused before execution; output SHALL conform to the schema or SHALL be recorded as tool failure; validation SHALL be fail-closed (D10.1 posture).
- **D16.3** — Tools SHALL be invoked only by the execution engine on behalf of a principal within a run; invocation outside a run context SHALL occur only through explicit human command surfaces that themselves journal actor+cause (D9.3).
- **D16.4** — Each invocation SHALL request its capabilities from the broker and the broker's decision (allow / deny / park) SHALL precede execution; no tool SHALL hold standing privileges; broker denial SHALL end the invocation before any effect (D10.1, D10.2).
- **D16.5** — Capability requests SHALL name the tool, the effect class, and the target scope; batched requests SHALL be decomposed to per-effect granularity wherever a gate requires human disposition.
- **D16.6** — Every tool invocation SHALL be journaled — request, decision, inputs (redacted per D9.4, D12.3), outputs or failure, duration, and cost — within the run's hash chain; an unjournaled invocation SHALL be a C1 violation.
- **D16.7** — Pure and idempotent tools SHALL be deterministic for identical inputs; non-deterministic tools (time, network, external state) SHALL declare so in the registry and non-idempotent effects SHALL be preceded by a checkpoint (D11.6).
- **D16.8** — Tool failure SHALL be a typed result — retryable, fatal, or refusal — journaled and surfaced in receipts; a failed tool SHALL NOT leave partial effects unrecorded; non-idempotent tools SHALL checkpoint before effect so failure leaves a resumable state.
- **D16.9** — On timeout expiry the invocation SHALL be recorded as timed-out; where effect class makes post-timeout state unknown, the engine SHALL treat the state as unknown and park the run for human disposition rather than guess (Article XI).
- **D16.10** — Retries SHALL follow the retry policy declared per tool (count, backoff, retryable classes); the engine SHALL NOT improvise retries beyond the declared policy; every retry SHALL be journaled as a distinct attempt under the same cause.
- **D16.11** — Broker enforcement SHALL precede every effect; no tool SHALL possess a path to effects that bypasses the broker decision (D7.5, D10.6); enforcement SHALL be verified by the constitutional compliance suites (D20.1).

### Hidden Assumptions

Effect classes can be assigned honestly by tool authors; declared timeouts bound external systems adequately; schema validation cost is small relative to effect cost; path-scoped and command-allowlisted scopes express real-world tool needs without unusable friction.

### Risks

Undeclared side effects; retry storms amplifying cost and external load; timeout ambiguity leaving unknown state; registry drift from implementation; tool-caused non-determinism entering runs.

### Standing Mitigations

Checkpoint-before-effect (D11.6); declared retry policy journaled per attempt (D16.10); park-on-unknown (D16.9, D10.4); registry conformance tests in CI (D20.1, D20.8); broker precedence verified by property tests (D20.5); journal recording under hash-chain verification (D12.1).

### Constitutional Notes

Sacred Invariants II (Capability Broker), III (Deterministic Runs), IV (Journal), V (Receipts); Stage 9 D9.3–D9.6; Stage 10 in full; Stage 11 D11.4–D11.6; Article XI (refusal semantics for denials and unknowns); Stage 20 D20.1, D20.5, D20.8.

**Approval Status:** RATIFIED (Founder Completion Order, FR-13).

## Stage 17 — API and SDK Contracts

### Constitutional Purpose

The API and SDKs are the constitution's public face. Whatever the CLI can do, the API can do, and the SDKs can do, at equal fidelity — Sacred Invariant VII is a promise to every principal, human and agent alike. Public contracts are legislation, not interfaces of convenience; this stage gives them versioning, precedent, and an amendment procedure.

### Constitutional Principles

1. One behavior, three surfaces — CLI, API, SDK — generated from one contract truth and tested to parity.
2. Contracts are versioned data, not folklore; the specification, not the implementation, is the law.
3. Deprecation is announced, machine-detectable, and patient.
4. Errors are contracts too: typed, coded, explainable, identical across surfaces.

### Binding Decisions

- **D17.1** — The local daemon SHALL expose the public HTTP API; the API surface SHALL be defined by a versioned OpenAPI specification held in `spec/` under the daylight rule (D6.3); the specification SHALL be the contract; an implementation that diverges from the specification SHALL be non-conforming.
- **D17.2** — The TypeScript and Python SDKs SHALL be generated from, or conformance-locked to, the same contract truth as the API; an SDK release that diverges from the specification SHALL NOT ship (C2).
- **D17.3** — The engine, API, and SDKs SHALL follow semantic versioning; breaking changes SHALL occur only in major versions; evolution within a minor SHALL be additive-only (Article VIII).
- **D17.4** — A minor release SHALL NOT break a golden fixture; fixtures are binding precedent (D4.3); parity tests SHALL pin CLI, API, and SDK behavior to the same fixtures.
- **D17.5** — Every capability exposed to humans through the CLI SHALL be exposed through the API and SDKs with equivalent fidelity, including receipts, journals, refusals, and gates; a parity gap SHALL be a C2 violation.
- **D17.6** — Errors SHALL be structured objects carrying the E#### code, a plain-language explanation, a `Fix:` line, and machine-readable remediation hints; the same error taxonomy SHALL govern CLI, API, and SDK (D3.8, Appendix A); exit-code classes SHALL map to error classes per Part IV.
- **D17.7** — All API and SDK responses SHALL use the one canonical envelope (D3.7) — one shape, three renderings; ad-hoc response shapes SHALL NOT be introduced.
- **D17.8** — Streams (SSE/NDJSON) SHALL be envelope-aligned, ordered per-run by the spine's gapless sequence (D9.2), redacted at the publication boundary (D9.4), and resumable by sequence; a reconnected consumer SHALL NOT receive reordered or duplicated acknowledged events.
- **D17.9** — In v0.1 the daemon SHALL bind to loopback and SHALL authenticate local clients through a pairing token minted at first use; no network-exposed authentication surface SHALL exist; remote access SHALL require a Class A amendment (Appendix I).
- **D17.10** — Contract evolution SHALL follow Article VIII and Article XIII: additive-only within a minor; two-minor deprecation window with machine-detectable deprecation signals on every surface.
- **D17.11** — API and SDK behavior SHALL be locked by golden fixtures per endpoint and per SDK call; fixtures SHALL live under `spec/` governance and SHALL be treated as contract changes, not test maintenance (D4.3, D20.2).
- **D17.12** — Deprecated surface elements SHALL remain functional for two minor versions, SHALL emit deprecation notices in envelope and CLI output, SHALL be listed in a machine-readable deprecation registry, and SHALL be removed only in the major version following the window.

### Hidden Assumptions

Loopback plus pairing token is sufficient trust for v0.1; OpenAPI can express the envelope and streaming semantics adequately; SDK generation tooling remains stable enough to be a dependency of law; fixture maintenance cost remains proportional to contract change.

### Risks

Parity drift between surfaces; fixture staleness becoming accidental law; deprecation windows encouraging avoidance instead of migration; pairing-token leakage on shared machines.

### Standing Mitigations

Parity conformance suites in CI (D20.8); fixture review as contract review (D17.11); machine-readable deprecation registry with CI enforcement (D17.12); token file permissions and `vae doctor` verification (Part III); specification-first law (D17.1).

### Constitutional Notes

Sacred Invariants VII (Machine Parity), VIII (Open Contracts); Article VIII (compatibility covenant), Article IX (stability guarantees), Article XI (refusal contract); D3.7, D3.8, D4.3, D6.3, D9.2, D9.4; Stage 18 (the CLI as one of the three surfaces); Stage 20 D20.2, D20.7, D20.8.

**Approval Status:** RATIFIED (Founder Completion Order, FR-13).

## Stage 18 — CLI Experience

### Constitutional Purpose

The CLI is where the constitution is felt. Stage 3 ratified the doctrine — the Daily Seven, the Five Guarantees, the envelope, the error culture; this stage binds the surface mechanics so that every keystroke obeys ratified law. A developer who trusts the terminal trusts the engine; that trust is manufactured here, mechanically, or not at all.

### Constitutional Principles

1. The terminal is a constitutional surface, not a convenience layer.
2. Every output is teaching, reporting, or refusing — never decoration.
3. Machine mode is not an afterthought of human mode; both render one envelope.
4. Progress is truth about the run, not animation about the wait.

### Binding Decisions

- **D18.1** — Every command SHALL honor the Five Guarantees (Part IV) without exception; a command that cannot honor them SHALL NOT ship.
- **D18.2** — Errors SHALL render as the E#### code, a one-line plain explanation, and a `Fix:` line; detail MAY follow; blame SHALL NOT (D3.8, D17.6).
- **D18.3** — Human mode and machine mode (`--json`) SHALL render the same envelope (D3.7); adding a rendered field SHALL be additive and permitted; changing or removing a rendered field within a version SHALL be a C2 violation.
- **D18.4** — Progress SHALL derive from spine events and the gapless per-run sequence (D9.2) — progress SHALL reflect journaled truth, never estimation; `--json` progress SHALL be envelope events suitable for programmatic consumption.
- **D18.5** — Every command SHALL complete without a TTY; prompts SHALL be resolvable by flags, environment, or explicit refusal defaults; a command that would prompt in non-interactive mode SHALL refuse (exit 3) with a `Fix:` line naming the missing input, and SHALL NOT guess (Article XI).
- **D18.6** — The exit alphabet SHALL be exactly `0` success, `2` usage error, `3` refusal, `4` run failure, `5` internal error (Part IV); shells and CI SHALL be able to branch on exit codes alone, in every version.
- **D18.7** — With `--json`, the CLI SHALL emit schema-stable envelope documents on stdout and diagnostics on stderr, parseable in every state including failure (Guarantee 2).
- **D18.8** — Human rendering SHALL prioritize comprehension — verb first, consequence second, next step third; a plain rendering without color or tabulation SHALL remain available for logs and pipes (D3.7).
- **D18.9** — Every state-changing command SHALL print a Receipt (what changed · cost · undo · record) before exit; `--dry-run` SHALL print the prospective receipt without effect (Guarantees 3–4).
- **D18.10** — `--help` SHALL teach: purpose, an honest example, prerequisites, side effects, and related commands; help content SHALL be versioned and reviewed as contract content (Guarantee 1).
- **D18.11** — The top-level command surface SHALL remain the Daily Seven (D3.2); additional commands SHALL hang beneath these verbs as subcommands; top-level growth SHALL require Class B ratification and SHALL pass the Vaerion Test (Article X).
- **D18.12** — Identical inputs and state SHALL produce identical exit codes, envelope content, and receipts across machines and runs; rendering MAY vary; meaning SHALL NOT.

### Hidden Assumptions

Spine events are available early enough to drive truthful progress; TTY detection is reliable across shells; stdout/stderr discipline holds in CI harnesses; help content can be kept versioned without excessive ceremony.

### Risks

Help rot; progress lying under buffering; CI scripts depending on human rendering; envelope field creep breaking parsers; interactive assumptions leaking into automation.

### Standing Mitigations

Help conformance suites (D20.1); progress sourced only from journal truth (D18.4); fixtures pin both render modes (D20.2); additive-only field policy with the deprecation registry (D17.12); non-interactive refusal defaults (D18.5).

### Constitutional Notes

Part III (Daily Seven); Part IV (Five Guarantees); Article V (Developer Bill of Rights), Article IX (stability guarantees), Article X (command growth), Article XI (refusal); D3.2, D3.7, D3.8, D9.2, D17.6, D17.7; Stage 20 D20.1, D20.2, D20.8.

**Approval Status:** RATIFIED (Founder Completion Order, FR-13).

## Stage 19 — Configuration System

### Constitutional Purpose

Configuration is delegated authority. Whoever sets precedence, validation, and audit owns the delegation; whoever neglects them creates unowned state with a file extension. This stage exists so that every effective value in the engine is explainable — where it came from, why it is valid, who authorized it, and when it changed.

### Constitutional Principles

1. Precedence is law and is visible; a user can always ask why a value is what it is.
2. Invalid configuration refuses to run; nothing improvises around a broken configuration.
3. Secrets are inputs, never configuration; they pass the credential protocol and never enter the journal in clear.
4. Configuration changes are receipt-bearing events, not edits.

### Binding Decisions

- **D19.1** — Values SHALL resolve in the fixed, documented order: defaults < engine configuration < project configuration (`vaerion.yaml`) < local override < explicit environment < explicit flag; the effective configuration and its provenance SHALL be inspectable (via `vae doctor`); shadowing SHALL NOT be silent.
- **D19.2** — All configuration SHALL validate against versioned schemas (strict subset per the ratified configuration discipline); unknown keys SHALL be refused, not ignored; validation SHALL be fail-closed (D10.1 posture).
- **D19.3** — Defaults SHALL be explicit, versioned, and documented in schema; changing a default across versions SHALL be treated as a contract change under Article VIII, never as a silent edit.
- **D19.4** — Named profiles MAY select coherent value sets within a project; profiles SHALL themselves validate, SHALL be declared in project configuration, and SHALL NOT bypass permission policy — policy SHALL NOT be profilable (Article II).
- **D19.5** — Secrets SHALL be resolved through the credential protocol (Stage 6 security posture); secrets SHALL NOT appear in configuration files, envelopes, journals, or receipts in clear; redaction SHALL apply at the publication boundary (D9.4, D12.3).
- **D19.6** — Environment overrides SHALL be explicitly mapped in schema; free-form environment passthrough SHALL be refused; the environment governing a run SHALL be journaled with the run.
- **D19.7** — A running run SHALL pin the effective configuration snapshot at start; mid-run configuration changes SHALL NOT affect an active run; the snapshot SHALL be journaled (D11.4); `vae resume` SHALL resume under the pinned snapshot.
- **D19.8** — Schema evolution SHALL ship with deterministic migrations; migrations SHALL be previewable (`--dry-run`), SHALL produce a Receipt, and SHALL be journaled; a failed migration SHALL leave the prior configuration intact and valid.
- **D19.9** — Schemas SHALL evolve additive-only within a minor version; removals and renames SHALL follow the two-minor window (Article VIII); documents SHALL remain validatable against their pinned schema versions.
- **D19.10** — Validation failure SHALL refuse the operation before any effect — exit 2 usage semantics interactively, refusal semantics within runs; partial application of invalid configuration SHALL NOT occur.
- **D19.11** — Every configuration change affecting capability, budget, model, or policy SHALL be journaled with actor+cause and SHALL be presented as a reviewable diff at grant time (D3.5, D10.5).

### Hidden Assumptions

Strict-refusal validation does not create onboarding friction that outweighs its safety; the environment is stable within a run; the local secrets store is available on all supported platforms; schema versioning can track project documents without user burden.

### Risks

Precedence confusion producing invisible behavior; schema churn stranding old projects; secrets leaking through environment dumps or diagnostics; migration partial failure; profiles quietly eroding policy.

### Standing Mitigations

Provenance-inspectable effective configuration (D19.1); pinned schema versions (D19.9); journaled environment snapshots (D19.6); transactional, previewable, receipted migrations (D19.8); policy exempt from profiling by law (D19.4); publication-boundary redaction (D19.5).

### Constitutional Notes

Article II (authority cannot be configured around), Article VIII (compatibility covenant), Article IX (stability guarantees), Article XI (refusal on invalid state); D3.5, D9.4, D10.1, D11.4, D12.3; Stage 6 (credential protocol, `vaerion.yaml` discipline), Stage 10 (policy is diff-only), Stage 12 (redaction), Part III (`vae doctor`, `vae resume`).

**Approval Status:** RATIFIED (Founder Completion Order, FR-13).

## Stage 20 — Testing and Verification

### Constitutional Purpose

Law without verification is decoration — the constitution warned of this on the day it was ratified. This stage makes the constitution executable: tests are the engine's conscience, CI is its court, and a green gate means proven, not hoped. Every invariant, guarantee, and covenant in this document has a corresponding duty of proof here.

### Constitutional Principles

1. Tests assert law, not implementation.
2. A flaky test is a product bug; flakiness is never noise (D5.1 posture).
3. Anything that can violate an invariant has a test that would catch it.
4. Verification is part of the receipt: green means proven.

### Binding Decisions

- **D20.1** — CI SHALL assert constitutional compliance: Five Guarantees conformance per command; envelope schema conformance; exit-code alphabet; broker fail-closed posture including audit-failure denial and core-self traversal; journal chain verification.
- **D20.2** — Golden fixtures SHALL pin envelope shapes, CLI output in both render modes, API responses, SDK calls, and journal segments; fixtures SHALL be binding precedent (D4.3); fixture changes SHALL be reviewed as contract changes, never as test maintenance.
- **D20.3** — Determinism SHALL be verified by double-run equality: identical inputs with pinned model recordings SHALL produce identical journals (modulo declared non-determinism), identical decisions, and identical receipts (D11.4, D13.2).
- **D20.4** — Integration suites SHALL execute the J1–J10 journeys end-to-end as blocking CI (D5.1); a journey failure SHALL block merge regardless of unit-test status.
- **D20.5** — Core laws SHALL be property-tested: journal append-only hash linking (D12.1); gapless per-run sequencing (D9.2); deny-beats-allow across policy permutations (D10.2); budget accounting conservation.
- **D20.6** — Recorded model traffic (D13.2) SHALL replay runs decision-identically; replay divergence SHALL be a release blocker; recordings SHALL redact per D12.3 before leaving a machine.
- **D20.7** — Compatibility SHALL be verified across the two-minor window: N-1 and N-2 fixtures, manifests, and schemas SHALL load and behave per their pinned contracts (D17.10, D19.9); a compatibility break SHALL be a C1 violation.
- **D20.8** — Merges SHALL be blocked by: unit, property, integration (journeys), determinism, parity (CLI/API/SDK), layerlint (D6.4), fixture conformance, and security suites; a red gate SHALL be a veto, not a warning.
- **D20.9** — L0–L4 layerlint SHALL run in CI as constitutional enforcement (D6.4); a boundary violation SHALL be C2, or C1 where an invariant-bearing path is crossed.
- **D20.10** — Every fixed C1/C2 violation SHALL add or strengthen a test that would have caught it; the corpus of such tests SHALL be tagged and reported at release.
- **D20.11** — A release SHALL carry a certification run: full journey suite, determinism double-runs, replay verification, compatibility window, chaos kill/resume (D11.6), and journal verification; certification results SHALL be journaled and hash-stamped (D12.1).

### Hidden Assumptions

Recorded model traffic is representative enough for replay truth; fixtures can be maintained at contract-change cost; CI determinism holds across runner architectures with pinned toolchains; acceptance criteria remain mechanically checkable.

### Risks

Suite growth slowing merges; fixtures ossifying accidental behavior; replay gaps at undeclared non-determinism; certification theater — green but hollow; security suites decaying into formality.

### Standing Mitigations

Journey-based integration focus — ten journeys, not ten thousand scenarios (D5.1); fixture review as contract review (D20.2); the declared-non-determinism registry feeding replay scope (D13.1, D15.7, D16.7); certification artifacts journaled and inspectable (D20.11); regression law (D20.10).

### Constitutional Notes

Article III (invariants carry proof duties), Article VIII (compatibility covenant), Article XII (violation classes drive test obligations); D4.3, D5.1, D6.4, D9.2, D10.2, D11.4–D11.6, D12.1, D12.3, D13.1, D13.2, D15.7, D16.7, D17.10, D19.9; Stage 5 (journeys as law), Stage 6 (layerlint), Part VIII (release blockers consume these gates).

**Approval Status:** RATIFIED (Founder Completion Order, FR-13).

## Stage 21 — Release, Deployment and Operations

### Constitutional Purpose

A release is a promise with a hash on it. This stage governs how ratified code leaves the builder's machine and becomes someone else's trusted tool — and how it comes back when reality disagrees. Operations are not exempt from the constitution: the engine's own housekeeping shall own its state, produce its receipts, and answer to its journal.

### Constitutional Principles

1. Reproducible or not released: a build that cannot be recreated cannot be audited.
2. Local-first operations: the engine operates without phoning home; observability is exported by the operator, never harvested.
3. Every release, rollback, and incident is journaled — operations own their state too.
4. Upgrades are additive by default and ratifiable by the user.

### Binding Decisions

- **D21.1** — A release SHALL require Stage 20 release certification green (D20.11), milestone gate conformance (Part VIII), and no open C1/C2 violations; release notes SHALL enumerate contract changes, deprecations, and migration steps.
- **D21.2** — Release artifacts SHALL be reproducible from pinned source, toolchain, and dependencies; two builds of the same commit SHALL produce byte-identical artifacts; reproducibility SHALL be verified in CI, not presumed.
- **D21.3** — v0.1 SHALL deploy as a self-contained local binary and library crates; there SHALL be no server fleet, no tenant runtime, no cloud dependency (Appendix I); distribution to users SHALL be the deployment model.
- **D21.4** — Users SHALL be able to roll back to the prior release; project-state compatibility SHALL be honored across rollback per the two-minor window (D20.7); rollback touching an in-flight journal SHALL refuse on drift (D12.4).
- **D21.5** — Release, upgrade, rollback, and GC operations SHALL produce Receipts (what changed · cost · undo · record) and journal entries with actor+cause (D9.3); the engine's own housekeeping SHALL obey the receipt law.
- **D21.6** — Incidents — crash, tamper detection, breaker storms, budget breach — SHALL be recorded as audit-chain events in the same format and retention discipline as runs (D12.2); no incident SHALL be silently swallowed; diagnostics export SHALL be operator-initiated and redacted (D12.3); telemetry SHALL remain zero (FR-3).
- **D21.7** — Recovery from crash or kill SHALL proceed from journal truth via `vae resume` (Part III, D11.6); recovery procedures SHALL be exercised by the chaos suite as a certification gate (D20.11).
- **D21.8** — Long-running operations (GC, migration, chain verification) SHALL be explicit, previewable, interruptible without corruption, and receipted; background housekeeping SHALL NOT mutate state without journaling.
- **D21.9** — One version SHALL govern the engine (single-version monorepo, D6.1); the API and SDKs SHALL version in lockstep with the engine within a major; every envelope SHALL record contract version and engine version.
- **D21.10** — Artifacts SHALL be signed and hash-pinned; signatures and blake3 artifact hashes SHALL be published with the release; verification SHALL be possible offline (Sacred Invariant VI).
- **D21.11** — Upgrades SHALL be additive-first; configuration and project migrations SHALL be previewable and receipted (D19.8); an upgrade that cannot preserve the compatibility window SHALL be a major version and SHALL say so.
- **D21.12** — Journals SHALL remain verifiable across engine versions (D12.1); long-term support scope SHALL be ratified at Governance/Release as a Class B decision (the license decision D2.9 remains deferred to the same venue).

### Hidden Assumptions

Reproducible builds are achievable across supported platforms with pinned toolchains; signing infrastructure is maintainable by a small project; users accept major-version gates for breaking change; support can lean on journals and receipts instead of telemetry.

### Risks

Reproducibility drift from platform quirks; signing-key custody; rollback into migrated state; support burden without observability harvesting; certification and release process theater.

### Standing Mitigations

CI-verified reproducibility (D21.2); offline verification (D21.10); forward-only migrations with preview and receipted undo where lawful (D19.8); operator-initiated redacted export (D21.6, D12.3); journal-plus-receipt support model (D21.5); certification artifacts as release law (D20.11).

### Constitutional Notes

Sacred Invariants IV (Journal), V (Receipts), VI (Local-first Core); FR-3 (zero telemetry); D2.9, D5.3, D6.1, D9.3, D12.1–D12.4, D19.8, D20.7, D20.11; Article IX (stability guarantees), Article XIII (Governance/Release venue); Appendix I (deferrals binding deployment shape).

**Approval Status:** RATIFIED (Founder Completion Order, FR-13).

## Stage 22 — Implementation Roadmap

### Constitutional Purpose

Order is law here too. The sequence in which the constitution becomes code determines whether the code can ever obey the constitution: spine, broker, and journal must exist before features can borrow them. The roadmap encodes that ordering as debt-free law, so that no schedule pressure can ever purchase convenience with unowned state.

### Constitutional Principles

1. Foundations first: spine, broker, journal before features.
2. No milestone ships past a red gate; ratification checkpoints are load-bearing.
3. A shortcut that creates unowned state is not an optimization; it is a C1 debt.
4. The roadmap ends when the Daily Seven keep the promises — not when the checklist runs out.

### Milestone Register and Acceptance Criteria

- **MS-0 — Skeleton and Law-in-Repo.** Monorepo per Stage 6; crates scaffolded with the `vae-` prefix (D6.2); `CONSTITUTION.md`, `spec/` with the daylight rule, layerlint L0–L4 live; envelope, exit codes, and error-catalog schema ratified as fixtures. *Acceptance:* layerlint and fixture CI green on an empty-but-lawful repository; the CI gates of D20.8 operational minus journeys.
- **MS-1 — Spine and Journal.** Event spine (Stage 9): gapless per-run sequence, actor+cause, redaction boundary, blob_ref; journal chains (Stage 12): blake3 verification, audit sister chain. *Acceptance:* property tests D20.5 green; tamper detection proven; chaos kill during append leaves a verifiable chain.
- **MS-2 — Broker and Capability Model.** Pure-function decisions; fail-closed; deny-beats-allow; durable human gates with park; diff-only policy; audit-failure denial; core-self traversal. *Acceptance:* D20.1 compliance suite green for broker posture; park-and-resume across restart proven.
- **MS-3 — Execution Engine and Tool System.** Single-writer runs; ULID scheduling; sequential agent loop; journaled decisions; checkpoints before non-idempotent effects; budget hard-stop partial receipts; tool registry and contracts per Stage 16. *Acceptance:* determinism double-run green with recorded model traffic (D20.3, D20.6); tool timeout/retry semantics proven.
- **MS-4 — Model Gateway and Context Engine.** Sole model ingress; explicit fallback chains; recording full by default; versioned pricing; breaker cadence; One Context Path with scopes, provenance, fencing, deterministic packs, local embeddings. *Acceptance:* replay decision-identical (D20.6); exclusion reasons present in packs; no path to a model bypassing the gateway, proven by layerlint and integration.
- **MS-5 — CLI, API, SDKs.** Daily Seven complete; Five Guarantees conformance; envelope in three renderings; OpenAPI contract; TypeScript and Python SDKs conformance-locked; parity fixtures. *Acceptance:* J1–J10 journeys green end-to-end (D5.1); parity suite green; the 15-minute onboarding Release Gate holds (D3.6).
- **MS-6 — Extension System and Hardening.** Extension manifests, isolation, receipts, compatibility ranges, failure containment (Stage 15); chaos, security, and compatibility-window suites complete; release-certification pipeline operational (D20.11); reproducible builds verified (D21.2). *Acceptance:* certification run green and hash-stamped; extension failure containment proven; no open C1/C2.
- **GA — Release.** Signed, reproducible artifacts; release notes enumerating contract changes and migrations; ratification ledger closed with all stages RATIFIED; constitutional status: complete.

### Binding Decisions

- **D22.1** — The milestone register MS-0 through MS-6 and GA, with the acceptance criteria stated above, SHALL be the ratified build order; Part VIII is its register form.
- **D22.2** — Foundations-before-features ordering SHALL be law: spine, journal, and broker (MS-1, MS-2) SHALL precede execution features (MS-3); the gateway and context engine (MS-4) SHALL precede parity claims (MS-5); extensions (MS-6) SHALL NOT precede the broker and journal they depend upon; resequencing SHALL require a Class A amendment.
- **D22.3** — The forbidden implementation shortcuts are: writing policy state outside broker diffs; emitting events outside the spine/journal discipline; calling models while bypassing the gateway; assembling context outside One Context Path; silently shadowing configuration or passing the environment free-form; shipping non-reproducible or unsigned artifacts; marking journeys skipped to pass CI; rendering outside the envelope. Each, when taken, SHALL be classified C1.
- **D22.4** — Milestone acceptance SHALL be a Class B ratification act recorded in the Master Ledger (Part VII); a milestone MAY be accepted with recorded, bounded deferrals; deferrals SHALL be law-visible, never silent.
- **D22.5** — v0.1 completion SHALL be defined by criteria, not calendar: all eight milestone definitions met with ledger ratification; the seven release blockers of Part VIII clear; the Daily Seven keeping the Five Guarantees in certification; no open C1/C2 violations.
- **D22.6** — After GA, amendment SHALL follow Article XIII; this roadmap SHALL bind implementation until superseded by ratified amendment; new pillars SHALL enter only through the Vaerion Test (Article X) and a ratified stage.

### Ratification and Governance Checkpoints

Each milestone closes with Founder review against its acceptance criteria (D22.4). Stage 20 gates run continuously; Article XIII governs every amendment discovered during implementation; `spec/` changes require daylight approval (D6.3).

### Hidden Assumptions

Milestone sizes are humanly tractable in the ratified sequence; recorded-model replay coverage exists from MS-3 onward; acceptance criteria remain mechanically checkable in CI; deferrals recorded at checkpoints do not accumulate into silent debt.

### Risks

Foundations (MS-1, MS-2) consuming disproportionate time and tempting resequencing; acceptance theater — milestones declared met without green gates; scope creep into deferred pillars; shortcut debt accumulating as "temporary" code.

### Standing Mitigations

Ratification checkpoints with ledger visibility (D22.4); the forbidden-shortcut list as reviewable law (D22.3); the Vaerion Test and Appendix I exclusions against creep; certification artifacts journaled (D20.11) so green means proven; foundations-first ordering protected by Class A procedure (D22.2).

### Constitutional Notes

Article X (admission of new work), Article XII (shortcut classification), Article XIII (amendment and checkpoint procedure); D3.2, D3.6, D5.1, D6.1–D6.4, D20.11, D21.2; Part VIII (register and release blockers); FR-10 (must-preserve set constrains every milestone).

**Approval Status:** RATIFIED (Founder Completion Order, FR-13).

---

# PART VI — Founder Rulings

Every ratified ruling, in order. Rulings carry constitutional force per Article I. [R unless noted]

| ID | Class | Ruling |
|---|---|---|
| FR-1 | Working mode | Design-only working mode for the constitution effort: no implementation code while ratification proceeds. (Amended for this artifact only by the Compilation Order, FR-11.) |
| FR-2 | Class A | Add P11 "Evolution Without Betrayal" to the ordered principles (Stage 2). |
| FR-3 | Ratified | Zero telemetry, permanently (Stage 2, D2.5). |
| FR-4 | Ratified | Refusal Log ratified (Stage 2, D2.6). |
| FR-5 | Deferral | License decision deferred to Governance/Release (Stage 2, D2.9). |
| FR-6 | Adjudication | Stage 3 Founder adjudications: binary `vae` (alias `vaerion`); Daily Seven fixed; Five Guarantees elevated to constitutional rank; permission doctrine ratified; tagline "Vaerion — The AI-Native Development Engine." |
| FR-7 | Ratified | Overnight-run gate semantics: park blocked nodes; independent nodes continue (Stage 5, D5.2). |
| FR-8 | Permanence | Enterprise = policy-as-code + audit export; never a service (Stage 5, D5.3). |
| FR-9 | Class A | **One Context Path** elevated to invariant-grade constitutional law (amends Stage 14; binds all context assembly). (Formerly recorded as the Last Amendment of this document; superseded in that capacity by the Final Canon Integration Order.) |
| FR-10 | Preservation | Must-preserve ratified set, restated: single-process core; broker as the only privileged gate; journal as truth; spine as stateless fan-out; deterministic execution; local-first; receipts/evidence over promises; One Context Path. |
| FR-11 | Compilation Order | Compile the ratified corpus into `VAERION_CONSTITUTION_v1.0.md` as the canonical source of truth and the direct blueprint for repository and codebase generation. Compile-only mandate: organize, cross-reference, format; invent nothing. |
| FR-12 | Referenced | Additional ratified decisions cited by the compilation order: **D15.6** (Stage 15), **D16.6** (Stage 16), **D17.6** (Stage 17), **D18.6** (Stage 18), **D19.7** (Stage 19), **D20.7** (Stage 20), **D21.6** (Stage 21). Preserved at their attested positions in the completed stages (Part V). |
| FR-13 | Completion Order | Final Canon Completion Order: Stages 15–22 authored in constitutional voice and ratified into the canon, completing the Engineering Blueprint. The completed chapters are binding law per Article I. |

---

# PART VII — Master Approval Ledger

Merged ledger for the whole constitution. Question counts per stage are attested only where the record preserves them; ranges are shown as `Q{n}.*` otherwise. [R for statuses; C for structure]

| Stage | Ledger | Status | Ratified via |
|---|---|---|---|
| 1 — Vision | Q1.* | RATIFIED | Founder approval |
| 2 — Philosophy | Q2.* | RATIFIED | Founder approval + FR-2 |
| 3 — Developer Experience | Q3.* | RATIFIED | Founder adjudications (FR-6) |
| 4 — Constitution | Q4.* | RATIFIED | Constitution v1.0 approved |
| 5 — User Journeys | Q5.* | RATIFIED | Founder treatment: approved as law (FR-7, FR-8) |
| 6 — Repository Architecture | Q6.* | RATIFIED | Founder treatment: approved as law |
| 7 — System Architecture | Q7.* | RATIFIED | Founder treatment: approved as law |
| 8 — Domain Model | Q8.* | RATIFIED | Founder treatment: approved as law |
| 9 — Event Bus | Q9.* | RATIFIED | Founder treatment: approved as law |
| 10 — Capability Broker | Q10.* | RATIFIED | Founder treatment: approved as law |
| 11 — Execution Engine | Q11.* | RATIFIED | Founder treatment: approved as law |
| 12 — Journal | Q12.* | RATIFIED | Founder treatment: approved as law |
| 13 — Model Gateway | Q13.* | RATIFIED | Founder treatment: approved as law |
| 14 — Context Engine | Q14.* | RATIFIED | Founder treatment: approved as law; FR-9 |
| 15 — Extension System | Q15.* | RATIFIED | Founder Completion Order (FR-13) |
| 16 — Tool System | Q16.* | RATIFIED | Founder Completion Order (FR-13) |
| 17 — API and SDK Contracts | Q17.* | RATIFIED | Founder Completion Order (FR-13) |
| 18 — CLI Experience | Q18.* | RATIFIED | Founder Completion Order (FR-13) |
| 19 — Configuration System | Q19.* | RATIFIED | Founder Completion Order (FR-13) |
| 20 — Testing and Verification | Q20.* | RATIFIED | Founder Completion Order (FR-13) |
| 21 — Release, Deployment and Operations | Q21.* | RATIFIED | Founder Completion Order (FR-13) |
| 22 — Implementation Roadmap | Q22.* | RATIFIED | Founder Completion Order (FR-13); closes the consolidated ledger Q15–Q22 |

Ledger rule: a stage is law only when its ledger line reads RATIFIED here. COMMISSIONED lines authorize work, not law. See Article I, Article XIII.

---

# PART VIII — Implementation Roadmap

The milestone register is constitutional law defined in Stage 22 (D22.1). Definitions, acceptance criteria, required implementation order, forbidden shortcuts, and completion definitions are normative content of Stage 22 (Part V) and are restated here in register form.

| Milestone | Definition (see Stage 22) | Status |
|---|---|---|
| MS-0 | Skeleton and Law-in-Repo: monorepo, `vae-` crates, `CONSTITUTION.md`, `spec/` daylight rule, layerlint L0–L4, envelope/exit-code/error-schema fixtures | REQUIRED |
| MS-1 | Spine and Journal: stateless fan-out, gapless per-run sequence, actor+cause, redaction boundary, blob_ref, blake3 chains, audit sister chain | REQUIRED |
| MS-2 | Broker and Capability Model: fail-closed pure-function decisions, deny-beats-allow, durable park gates, diff-only policy, audit-failure denial, core-self traversal | REQUIRED |
| MS-3 | Execution Engine and Tool System: single-writer runs, ULID scheduling, sequential agent loop, journaled decisions, checkpoints, budget hard-stop, tool registry and contracts | REQUIRED |
| MS-4 | Model Gateway and Context Engine: sole ingress, explicit fallback chains, recording full default, versioned pricing, breaker cadence, One Context Path | REQUIRED |
| MS-5 | CLI, API, SDKs: Daily Seven complete, Five Guarantees conformance, envelope renderings, OpenAPI, TypeScript/Python SDKs, parity fixtures, onboarding Release Gate | REQUIRED |
| MS-6 | Extension System and Hardening: manifests, isolation, receipts, compatibility ranges, containment; chaos/security/compatibility suites; certification pipeline; reproducible builds | REQUIRED |
| GA | Release: signed reproducible artifacts, contract-change notes, ledger closed, constitution complete | REQUIRED |

**Dependency Graph (required implementation order, D22.2):** MS-0 → MS-1 → MS-2 → MS-3 → MS-4 → MS-5 → MS-6 → GA. Spine, journal, and broker precede execution features; gateway and context engine precede parity claims; extensions never precede the broker and journal they depend upon.

**Release Blockers (ratified law, binding now):**
1. 15-minute onboarding promise holds on clean machines — Release Gate (D3.6, FR-6).
2. J1–J10 journey suite green in blocking CI (D5.1).
3. Five Guarantees conformance proven for the full Daily Seven surface (Article IV, D3.3).
4. L0–L4 layerlint clean; no boundary violations (D6.4, Article III).
5. Journal verification (blake3 chain) green across chaos kill/resume suite scope (D12.1, D11.6, Stage 20 scope).
6. Broker fail-closed posture proven, including core-self traversal and audit-failure denial (D10.1, D10.6, D10.7).
7. Constitution conformance: no open C1/C2 violations (Article XII).

**Completion Criteria (D22.5):** all eight milestone definitions met with ledger ratification; the seven release blockers above clear; the Daily Seven keeps the Five Guarantees in certification; no open C1/C2 violations. v0.1 completion is defined by these criteria, not by calendar.

---

# PART IX — Appendices

## Appendix A — Error Catalog References

Ratified doctrine (Stage 3): every error carries an `E####` code and a `Fix:` line; errors are curriculum, not blame; machine renderings carry the same codes in the envelope (D3.7). Exit-code alphabet: `0` success · `2` usage error · `3` refusal · `4` run failure · `5` internal error [C]. The doctrine above is constitutional; the full `E####` catalog is normative content of `spec/`, maintained under the two-approver daylight rule (D6.3).

## Appendix B — Decision Index

Compiler-assigned indices of ratified decisions, Stages 1–22 (see Compilation Record §4; Founder numbering prevails where it differs). Stages 15–22 are numbered as ratified in the completed chapters (FR-13).

| Stage | Decisions |
|---|---|
| 1 | D1.1 substrate not IDE/chat/CLI · D1.2 protocol-over-app · D1.3 North Star: overnight trust + causal explanation · D1.4 AI-native four tenets · D1.5 eleven pillars; cloud excluded |
| 2 | D2.1 See it. Explain it. Own it. · D2.2 unowned state root cause · D2.3 P1–P11 ordered · D2.4 Founder axioms · D2.5 zero telemetry · D2.6 Refusal Log · D2.7 agents as principals · D2.8 Seven Gates · D2.9 license deferred |
| 3 | D3.1 `vae` + alias · D3.2 Daily Seven · D3.3 Five Guarantees constitutional · D3.4 permission doctrine · D3.5 grants as config diff `[p]` · D3.6 15-min onboarding Release Gate · D3.7 one envelope, three renderings · D3.8 E#### + `Fix:` curriculum · D3.9 Agent Bill of Rights · D3.10 feedback without telemetry · D3.11 tagline |
| 4 | D4.1 precedence chain · D4.2 Articles I–XV · D4.3 compatibility covenant · D4.4 Vaerion Test · D4.5 violation classes C1–C3 · D4.6 amendment classes A/B/C · D4.7 CONSTITUTION.md in-repo |
| 5 | D5.1 J1–J10 blocking CI · D5.2 overnight park semantics · D5.3 enterprise never-a-service |
| 6 | D6.1 single-version monorepo · D6.2 `vae-` prefix, 14 crates · D6.3 `spec/` + daylight rule · D6.4 L0–L4 layerlint |
| 7 | D7.1 single-process core · D7.2 embedded + daemon dual mode · D7.3 socket-first transport · D7.4 broker fail-closed · D7.5 no-side-channel |
| 8 | D8.1 event sourcing Run-only · D8.2 fingerprint-pinned documents · D8.3 decimal-string money · D8.4 no Session/User aggregates |
| 9 | D9.1 journal=log, spine=fan-out · D9.2 per-run gapless seq · D9.3 actor+cause mandatory · D9.4 publication-boundary redaction · D9.5 blob_ref law · D9.6 at-least-once + idempotent consumers |
| 10 | D10.1 fail-closed · D10.2 deny-beats-allow · D10.3 pure-function decisions · D10.4 durable human gates default park · D10.5 broker proposes diffs only · D10.6 core traverses broker · D10.7 audit failure = deny |
| 11 | D11.1 single writer per run · D11.2 ULID deterministic scheduling · D11.3 sequential agent loop · D11.4 journaled-decision law · D11.5 budget hard-stop → partial receipt · D11.6 checkpoint before non-idempotent calls |
| 12 | D12.1 per-run NDJSON blake3 chain · D12.2 audit sister chain · D12.3 export redacted by default · D12.4 revert refuses on drift · D12.5 permanent retention + explicit GC |
| 13 | D13.1 explicit visible fallback chains only · D13.2 recording default full · D13.3 pricing as versioned data files · D13.4 breaker 5/30s → open 30s · D13.5 gateway sole model door |
| 14 | D14.1 One Context Path · D14.2 memory scopes run/session/project · D14.3 provenance + untrusted fencing · D14.4 deterministic packs + mandatory exclusion reasons · D14.5 local embeddings default |
| 15 | D15.1 manifest · D15.2 registration and lifecycle · D15.3 isolation · D15.4 compatibility ranges · D15.5 capability permissions · D15.6 extension receipts · D15.7 determinism requirement · D15.8 failure containment · D15.9 upgrade guarantees · D15.10 removal policy |
| 16 | D16.1 registry · D16.2 contracts and I/O validation · D16.3 invocation model · D16.4 permission boundaries · D16.5 capability requests · D16.6 journal recording · D16.7 tool determinism · D16.8 failure semantics · D16.9 timeout handling · D16.10 retry policy · D16.11 broker enforcement |
| 17 | D17.1 OpenAPI as contract · D17.2 SDK guarantees · D17.3 semantic versioning · D17.4 backward compatibility · D17.5 machine parity · D17.6 error contract · D17.7 response envelopes · D17.8 streaming contracts · D17.9 authentication assumptions · D17.10 contract evolution · D17.11 golden fixtures · D17.12 deprecation windows |
| 18 | D18.1 Five Guarantees on every command · D18.2 error formatting · D18.3 output guarantees · D18.4 progress from journal truth · D18.5 non-interactive refusal · D18.6 exit-code alphabet · D18.7 machine mode · D18.8 human mode · D18.9 receipts and dry-run · D18.10 help system · D18.11 command hierarchy · D18.12 deterministic behavior |
| 19 | D19.1 precedence · D19.2 fail-closed validation · D19.3 versioned defaults · D19.4 profiles · D19.5 secrets · D19.6 environment mapping · D19.7 immutable runtime config · D19.8 migrations · D19.9 schema evolution · D19.10 refuse on invalid · D19.11 audit recording |
| 20 | D20.1 constitutional compliance suites · D20.2 golden fixtures · D20.3 determinism double-runs · D20.4 journey integration · D20.5 property tests · D20.6 replay verification · D20.7 compatibility window · D20.8 CI gates · D20.9 layer enforcement · D20.10 regression law · D20.11 release certification |
| 21 | D21.1 release process · D21.2 reproducible builds · D21.3 local-first deployment · D21.4 rollback · D21.5 operational receipts · D21.6 incident recording · D21.7 recovery from journal truth · D21.8 maintenance windows · D21.9 version governance · D21.10 distribution integrity · D21.11 upgrade path · D21.12 long-term support |
| 22 | D22.1 milestone register · D22.2 foundations-before-features · D22.3 forbidden shortcuts are C1 · D22.4 ratification checkpoints · D22.5 completion by criteria · D22.6 post-GA amendment path |

## Appendix C — Architecture Index

| Construct | Canonical reference |
|---|---|
| Single-process core (embedded + daemon) | Stage 7, D7.1–D7.2 |
| Socket-first transport | Stage 7, D7.3 |
| Capability Broker | Stage 10; Sacred Invariant II; Article II |
| Event Spine | Stage 9; Sacred Invariant I |
| Journal (run + audit chains) | Stage 12; Sacred Invariant IV |
| Execution Engine | Stage 11; Sacred Invariant III |
| Model Gateway | Stage 13 |
| Context Engine (One Context Path) | Stage 14; FR-9 |
| Domain Model (Run aggregate, documents) | Stage 8 |
| Repository layers L0–L4 + layerlint | Stage 6, D6.4 |
| CLI surface (Daily Seven, envelope, exit codes) | Stage 3; Parts III–IV; Stage 18 |
| Extension System | Stage 15; Article VII |
| Tool System | Stage 16 |
| API/SDK contracts | Stage 17; Sacred Invariant VIII |
| Configuration System | Stage 19; D3.5 |
| Testing and Verification | Stage 20; Article VIII (golden fixtures) |
| Release and Operations | Stage 21; Part VIII |

## Appendix D — Glossary

| Term | Definition |
|---|---|
| Agent | An AI principal acting under human authority within a declared capability space (D2.7, Article II). |
| Broker | The single fail-closed gate through which every privileged action passes (Stage 10). |
| Daily Seven | The seven ratified daily commands of `vae` (Part III). |
| Daylight rule | `spec/` changes require two approvers — nothing merges in the dark (D6.3). |
| Deterministic run | A run whose decisions are journaled before they act and replay identically (D11.4). |
| Envelope | The one canonical event/output shape rendered human/plain/json (D3.7). |
| Fencing | Neutralizing untrusted spans so they can inform but not steer (D14.3). |
| Five Guarantees | The constitutional promise set of Part IV. |
| Gate (human) | A durable broker checkpoint that parks work until a human disposes (D10.4). |
| Golden fixture | A locked, binding behavior precedent used as compatibility law (D4.3, Stage 20). |
| Journal | The append-only, hash-chained truth of what happened (Stage 12). |
| North Star | Trustworthy overnight autonomous runs + post-hoc causal explanation (D1.3). |
| One Context Path | The single provenance-tracked, fenced, deterministic context pipeline (Stage 14, FR-9). |
| Park | Durable suspension of a node/request; resumable without loss (D5.2, D10.4). |
| Principal | An actor (human or agent) with an attributable identity (Stage 8, Article II). |
| Receipt | What changed · cost · undo · record (Sacred Invariant V). |
| Refusal | A first-class, explained, logged non-action (Article XI). |
| Refusal Log | The standing ledger of every refusal (D2.6). |
| Run | The sole event-sourced aggregate; the unit of journaled work (Stage 8). |
| Sacred Invariant | One of the nine constitutional bedrocks (Part II). |
| Seven Gates | The ratified decision framework of Stage 2 (D2.8). |
| Spine | The stateless event fan-out; the journal is the log, the spine is the bus (Stage 9). |
| The Vaerion Test | "Would Git/Cargo/Docker have added it?" (Article X). |
| Unowned state | State whose ownership, explanation, or reversal is unaccounted for — the root cause doctrine (D2.2). |
| blob_ref | Reference indirection for blobs; blobs are never inlined (D9.5). |

## Appendix E — Acronyms

| Acronym | Expansion |
|---|---|
| ADR | Architecture Decision Record |
| API | Application Programming Interface |
| CI | Continuous Integration |
| CLI | Command-Line Interface |
| GC | Garbage Collection |
| LLM | Large Language Model |
| NDJSON | Newline-Delimited JSON |
| SDK | Software Development Kit |
| ULID | Universally Unique Lexicographically Sortable Identifier |
| UX | User Experience |

## Appendix F — Constitutional Decision Index

| Class | Entries |
|---|---|
| Constitutional articles | Article I–XV — all ratified (I–XIII compiled [C]; XIV–XV completed under the Founder's Final Canon Integration Order) |
| Sacred Invariants | I–IX (Part II); invariant-grade amendment: One Context Path (FR-9) |
| Founder Rulings | FR-1 – FR-13 (Part VI) |
| Ratified stage decisions | D1.1–D22.6 (167 entries, Appendix B) |
| Ratified Decisions D15.1–D22.6 | 85 decisions authored under FR-13; anchors D15.6, D16.6, D17.6, D18.6, D19.7, D20.7, D21.6 preserved at attested positions |
| Amendment classes | A / B / C (Article XIII) |
| Violation classes | C1 / C2 / C3 (Article XII) |

## Appendix G — Stage Index

| Stage | Title | Status | Headline |
|---|---|---|---|
| 1 | Vision | RATIFIED | Execution substrate; North Star D1.3 |
| 2 | Philosophy | RATIFIED | See it. Explain it. Own it.; P1–P11 |
| 3 | Developer Experience | RATIFIED | `vae`; Daily Seven; Five Guarantees |
| 4 | Constitution | RATIFIED | Articles I–XV; precedence chain |
| 5 | User Journeys | RATIFIED | J1–J10 blocking CI; park semantics |
| 6 | Repository Architecture | RATIFIED | Monorepo; 14 `vae-` crates; layerlint |
| 7 | System Architecture | RATIFIED | Single-process core; socket-first; fail-closed |
| 8 | Domain Model | RATIFIED | Run-only event sourcing; documents elsewhere |
| 9 | Event Bus | RATIFIED | Journal is log; spine is fan-out |
| 10 | Capability Broker | RATIFIED | Fail-closed; deny-beats-allow; park gates |
| 11 | Execution Engine | RATIFIED | Single writer; journaled decisions |
| 12 | Journal | RATIFIED | blake3 chains; redacted export; explicit GC |
| 13 | Model Gateway | RATIFIED | Explicit fallback; recording full; breaker |
| 14 | Context Engine | RATIFIED | One Context Path; fenced provenance |
| 15 | Extension System | RATIFIED | Extensions are principals; broker-only capability; extension receipts |
| 16 | Tool System | RATIFIED | Declared contracts; journaled invocations; fail-closed effects |
| 17 | API and SDK Contracts | RATIFIED | One contract truth; parity; two-minor deprecation |
| 18 | CLI Experience | RATIFIED | Five Guarantees at every keystroke; envelope renderings |
| 19 | Configuration System | RATIFIED | Visible precedence; fail-closed validation; pinned runtime config |
| 20 | Testing and Verification | RATIFIED | Law made executable; journeys blocking; certification |
| 21 | Release, Deployment and Operations | RATIFIED | Reproducible; signed; journaled operations |
| 22 | Implementation Roadmap | RATIFIED | Foundations first; MS-0 → GA; forbidden shortcuts |

## Appendix H — Risk Register

Per-stage Risks and Hidden Assumptions sections above are the ratified risk record (Stages 1–14 [C]; Stages 15–22 completed under FR-13). Consolidated, cross-cutting risks attested by the record:

| # | Risk | Where ratified | Standing mitigation |
|---|---|---|---|
| RSK-1 | Non-determinism leaking into runs | Stage 11, Stage 13 | D11.4 journaled decisions; D13.1 explicit chains; D13.2 recording |
| RSK-2 | Privilege escape around the broker | Stage 7, Stage 10 | D7.5 no-side-channel; D10.1 fail-closed; D10.7 audit-failure denial |
| RSK-3 | Unbounded journal/storage growth | Stage 12 | D12.5 explicit GC; D9.5 blob_ref law |
| RSK-4 | Secret leakage through exports/recordings | Stage 12, Stage 13 | D12.3 redacted export; D9.4 boundary redaction |
| RSK-5 | Overnight runs dying on blocked nodes | Stage 5 | D5.2 park and continue |
| RSK-6 | Cost overrun in model usage | Stage 11, Stage 13 | D11.5 budget hard stop → partial receipt; D13.3 versioned pricing |
| RSK-7 | Contract drift / compatibility betrayal | Article VIII, Stage 20 | Golden fixtures as precedent; two-minor deprecation window |
| RSK-8 | Constitution decaying into dead law | Stage 4, Stage 6 | D6.4 layerlint in CI; D5.1 blocking journeys; Article XII classes |

## Appendix I — Future Deferred Features

Ratified deferrals and exclusions (binding):

- Cloud services of any kind — excluded from v0.1 (D1.5). [R]
- Enterprise as a served product — excluded permanently; policy-as-code + audit export remains the only enterprise surface (D5.3, FR-8). [R]
- Billing / metering-as-a-service — excluded (D1.5). [R]
- Marketplace — excluded (D1.5). [R]
- Dashboard-as-product — excluded (D1.5). [R]
- License model — deferred to Governance/Release (D2.9, FR-5). [R]
- Session/User aggregates — rejected permanently (D8.4). [R]
- Implicit model fallback chains — rejected permanently (D13.1). [R]
- Telemetry — rejected permanently (D2.5, FR-3). [R]

## Appendix J — Cross Reference Table

| Topic | See |
|---|---|
| Human authority | Article II; Sacred Invariant IX; FR-10 |
| Precedence of law | Article I; Article XIV; D4.1 |
| The broker as sole gate | Stage 10; Sacred Invariant II; D7.5; D10.6 |
| Journal as truth | Stage 12; Sacred Invariant IV; D9.1 |
| Determinism | Stage 11; Sacred Invariant III; D11.4; D13.1 |
| Local-first | Sacred Invariant VI; D14.5 |
| Receipts | Sacred Invariant V; D3.3; Part IV |
| One Context Path | Stage 14; FR-9; D14.1 |
| CLI surface and errors | Stage 3; Stage 18; Part III; Part IV; Appendix A |
| Refusals | Article XI; D2.6; D3.4 |
| Compatibility | Article VIII; D4.3; Stage 20 |
| Governance and amendment | Article XIII; D6.3; Part VII |
| Ratification and record | Article XV; Part VII |
| Roadmap and release | Stage 22; Part VIII |
| Machine parity | Sacred Invariant VII; D3.7; Stage 17 |
| Extensions | Article VII; Stage 15; Sacred Invariant VIII |

---

# CONSTITUTION STATUS

| Measure | Count |
|---|---|
| Total Articles | 15 — Articles I–XV, all ratified (I–XIII compiled; XIV–XV completed under the Founder's Final Canon Integration Order) |
| Sacred Invariants | 9 (plus invariant-grade Class A amendment: One Context Path) |
| Architecture Stages | 22 — all RATIFIED (Stages 1–14 compiled; Stages 15–22 completed under FR-13) |
| Ratified Decisions | 167 indexed entries, D1.1–D22.6 (Appendix B) |
| Founder Rulings | 13 (FR-1 – FR-13) |
| Approval Ledgers | 1 master ledger covering Q1–Q22 (Part VII); all stages RATIFIED |
| Implementation Milestones | MS-0 – MS-6 + GA, defined in Stage 22 and registered in Part VIII |
| Release Criteria | 7 ratified release blockers (Part VIII) |
| Unresolved References | 0 — verified before publication (Compilation Record §6–§7) |
| Placeholder Content | 0 — no [NR] markers and no commissioned placeholders remain |
| Version | 1.0 |
| Status | **IMPLEMENTATION READY — CONSTITUTIONALLY COMPLETE.** Articles I–XV and Stages 1–22 are ratified; no [NR] content, no placeholder text, and no unresolved references remain; no constitutional recovery is pending. Implementation proceeds per the required order of Stage 22 (D22.2). |

*End of VAERION_CONSTITUTION_v1.0.md*
