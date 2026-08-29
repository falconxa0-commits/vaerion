# ARCHITECTURE_REPORT — Vaerion MS-0/MS-1/MS-2

| | |
|---|---|
| **Date** | 2026-08-29 |
| **Governing law** | `docs/constitution/VAERION_CONSTITUTION_v1.0.md` (§1 three load-bearing ideas, §4 nine Sacred Invariants, §5 decision register) |
| **Boundary verification** | `tools/layerlint.ts` — all runtime edges checked, 0 violations |

---

## 1. Layer model (as built)

```
L4  porcelain      cli/                     — Daily Seven, Five Guarantees
L2  domain         runtime/  research/      — run harness · research subsystem
L1  primitives     spine/ journal/ store/ receipts/ broker/ (contracts + engine + refusal-log)
L0  foundation     kernel/ config/          — errors · ids · clock · canonical · redact · hash · config
```

Runtime dependency matrix (enforced by layerlint; type-only imports exempt as
erased edges):

| From ↓ To → | L0 | L1 | L2 | L4 |
|---|---|---|---|---|
| L0 | ✅ | ✗ | ✗ | ✗ |
| L1 | ✅ | ✅ | ✗ | ✗ |
| L2 | ✅ | ✅ | ✅ | ✗ |
| L4 | ✅ | ✅ | ✅ | ✅ |

Additional forbidden pairs (also enforced): `journal → runtime`, `broker →
runtime` (dependency inversions the run harness owns), and any engine import of
`sdks/` or `tools/`.

The MS-2 broker engine lives at **L1** and stays I/O-free: it evaluates and
returns; the harness (L2) sequences journaling. That is what keeps the
broker→runtime inversion forbidden while making the broker first-class.

## 2. How the Sacred Invariants are realized

1. **Event Spine** — `spine/`: envelope v1 with mandatory `actor` + `cause`;
   registry-gated emission; one ordered bus; durable subscribers replay from
   cursors (`SpinePersistence`, now directly tested). Unknown types decode
   (forward-compat) but cannot re-emit.
2. **Capability Broker** — `broker/`: contracts (frozen) + **engine (MS-2)**:
   three-layer evaluation — request shape (fail-closed E1301) →
   permission-graph ceiling (E1300) → policy first-match with structural
   fail-closed fall-through. The ceiling is built from `vaerion.yaml`
   (`graphFromConfig`): declared-domain grants must sit inside the ceiling;
   undeclared domains follow the human's explicit declaration. Grants only
   ever narrow.
3. **Deterministic Runs** — `runtime/run.ts`: state is a pure fold
   (`runStateReducer`) of the journal; `FixedClock`/`SeededIdGen` ports make
   tests byte-deterministic; `C2` bans wall-clock/randomness outside ports.
4. **Journal** — `journal/`: append-only NDJSON; blake3 chain over canonical
   records; single-writer O_EXCL lock; per-append fsync; gapless per-run seq.
5. **Receipts** — `receipts/`: computed from the journal as the terminal
   record.
6. **Local-first Core** — no network paths in engine or SDK (C1);
   research is local-source-only by construction.
7. **Machine Parity** — the SDK exercises the same engine functions as the
   CLI, now including the broker surface (refusals, audit, evidence
   verification); parity is asserted, not assumed.
8. **Open Contracts** — `spec/` 0.1.1 is the published form of the runtime
   law; `C4` fails on drift between `spec/` and code.
9. **Human Authority** — prompt decisions pause runs (never auto-close);
   gates carry `decision_id` links; `resume` renders the review (question,
   options, decision, rendered diff) BEFORE any answer; approvals record
   elevations (audit `elevation` + `broker.elevation.recorded`); denials are
   honest exit-3 outcomes; resolution stays idempotent across restarts.

## 3. Data flow (one privileged action, MS-2 law)

```
principal → DecisionRequest (stated intent, redactable action)
              │
              ▼
   BrokerEngine.evaluate
      1. shape layer      — un-evaluable ⇒ deny E1301
      2. ceiling layer    — permission graph must cover (else deny E1300)
      3. policy layer     — first match wins; no match ⇒ deny E1301
              │
              ▼
   decide → journal (decision record w/ redacted action) → audit entry
              │ deny ──────────────► Refusal Log entry (hash-chained)
              │ prompt ────────────► durable gate (decision_id linked);
              │                       run PAUSES (lock released, no receipt)
              ▼ allow
   act
```

Human loop for a prompt:

```
vae resume RUN            → renders review (gate, decision, diff, hint)   [exit 0, awaiting]
vae resume RUN --answer … → resolveGate (idempotent, journaled)
      approved            → audit "elevation" + broker.elevation.recorded → run closes w/ receipt
      denied              → journaled denial, NO elevation                [exit 3]
```

Policy precedence in `vae run`: standing human law (`vaerion.yaml
policy.rules[]`) evaluates BEFORE the command-line declaration; every source
gets its own decision (narrowest scope; refusals name the exact path).

Everything above is hash-chained: journal records, audit entries, and refusal
entries share the same blake3 chain primitive; tampering is detectable at
every layer (chaos-verified; refusal tamper unit-tested; golden-pinned).

## 4. Research subsystem (constitutional placement)

Research sits at L2 and obeys One Context Path: local documents are
fingerprinted (blake3) → content goes to the blob CAS (journal carries
`blob_ref`) → excerpts are fenced `<untrusted src=…>` → **full evidence +
provenance records are journaled** (R-RT2: state restorable by folding the
journal) → the local BM25 index is journaled (`IndexedDoc` is
canonicalJson-safe; `LocalIndex.fromDocs` rebuilds from replayed docs) →
context packs are pure functions over journaled facts, visible only via the
journaled `research.context.prepared` event.

MS-2 adds **triangulated evidence verification** (`research/verification.ts`):
evidence ↔ blob bytes ↔ provenance fingerprint, plus excerpt containment.
Store diagnostics pass through untouched (E1007/E1008); provenance lies are
E1600; excerpt escapes are E1401. Wired into `vae doctor` and the SDK.

## 5. Substrate decision (ADR-0018 — Proposed)

The invariants are substrate-neutral; MS-0/MS-1/MS-2 are implemented in
TypeScript on Bun because that is the substrate in which this work could be
**actually built and verified end-to-end**. The journal format, envelope
schema, and broker contracts are byte-stable across a future re-platform.
ADR-0018 requests Founder ratification before MS-3 shipping milestones.

## 6. Key invariants to preserve in MS-3

- `evaluatePolicy`/`BrokerEngine`'s fail-closed fall-through must never gain an "allow by default".
- The ceiling never widens: `graphFromConfig` must keep refusing grants that exceed DECLARED ceilings (E1300).
- Gate records are append-only: resolution appends, never mutates; a prompt never seals a run.
- The journal writer remains the ONLY seq allocator and the ONLY writer per run.
- The Refusal Log is append-only and chained like the journal; `doctor` must keep verifying it.
- Snapshots remain accelerators: replay equality is the law, tested in chaos.
- Research stays network-free unless a declared, broker-mediated capability (with fencing + provenance) is ratified.
- Model Gateway (MS-3) enters through the broker's `model.invoke` domain — no provider call may bypass decide→journal→act.
