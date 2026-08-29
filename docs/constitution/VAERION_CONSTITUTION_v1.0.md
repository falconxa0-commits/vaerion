# VAERION CONSTITUTION — v1.0

| | |
|---|---|
| **Document** | VAERION_CONSTITUTION_v1.0 — the ratified law of the Vaerion engine |
| **Status** | `RATIFIED — MATERIALIZED INTO REPOSITORY` |
| **Priority chain** | Constitution → Philosophy (P1–P11) → Stage decisions → ADR → code |
| **Amendment** | Founder authority only (see §9). No agent, reviewer, or contributor may amend. |
| **Implementation authority** | This repository is the executable expression of this document. Where code and law disagree, the law wins and the code is a defect. |

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

The following decisions were ratified in the constitutional design sessions. They are
binding on all implementation. An ADR may refine mechanics; it may not contradict
these without Founder amendment.

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
| D-M | Daily Seven CLI | The command surface is exactly: `init, run, resume, explain, journal, doctor, dev` (binary `vae`). |
| D-N | Five Guarantees | (1) `--help` always teaches and never executes; (2) `--json` is stable NDJSON; (3) `--dry-run` is side-effect-free; (4) every run closes with a receipt; (5) exit codes are honest: 0 ok · 2 usage · 3 broker-denied · 4 provider-down · 5 partial-with-repair-hint. |
| D-O | Research is constitutional | Research is a declared, broker-mediated, journaled subsystem; external content is untrusted and fenced; provenance is mandatory. |

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

---

## 8. Release Blockers (absolute)

1. All verification gates green (build, deps, format, lint, types, unit, integration, chaos, golden, architecture, constitutional).
2. Journal verification green on all golden and chaos fixtures.
3. No secret material anywhere in the repository or its history.
4. Zero telemetry verified (no unmediated egress in code paths).
5. Architecture boundaries verified by layer lint.
6. Constitutional verification green (invariant checks + decision register).
7. Reports generated and truthful (BUILD / VERIFICATION / ARCHITECTURE / ROADMAP_PROGRESS).

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
