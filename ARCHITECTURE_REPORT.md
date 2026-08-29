# ARCHITECTURE_REPORT — Vaerion MS-0/MS-1

| | |
|---|---|
| **Date** | 2026-08-29 |
| **Governing law** | `docs/constitution/VAERION_CONSTITUTION_v1.0.md` (§1 three load-bearing ideas, §4 nine Sacred Invariants, §5 decision register) |
| **Boundary verification** | `tools/layerlint.ts` — 173 runtime edges, 0 violations |

---

## 1. Layer model (as built)

```
L4  porcelain      cli/                     — Daily Seven, Five Guarantees
L2  domain         runtime/  research/      — run harness · research subsystem
L1  primitives     spine/ journal/ store/ receipts/ broker/
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

## 2. How the Sacred Invariants are realized

1. **Event Spine** — `spine/`: envelope v1 with mandatory `actor` + `cause`;
   registry-gated emission (no ambient events); one ordered bus; surfaces are
   subscribers. Unknown types decode (forward-compat) but cannot re-emit.
2. **Capability Broker** — `broker/contracts/`: fail-closed evaluation is
   structural; declarations are ceilings; the graph may only narrow. The MS-2
   engine will implement exactly these frozen contracts.
3. **Deterministic Runs** — `runtime/run.ts`: state is a pure fold
   (`runStateReducer`) of the journal; `FixedClock`/`SeededIdGen` ports make
   tests byte-deterministic; `C2` check bans wall-clock/randomness outside ports.
4. **Journal** — `journal/`: append-only NDJSON; blake3 chain over canonical
   records; single-writer O_EXCL lock; per-append fsync; gapless per-run seq.
5. **Receipts** — `receipts/`: receipts are computed from the journal (a fold,
   not an assertion) and land as the terminal record; the CLI surfaces them.
6. **Local-first Core** — no network paths exist in the engine or SDK
   (C1 constitutional check); research is local-source-only by construction.
7. **Machine Parity** — the SDK calls the same engine functions the CLI does;
   parity is asserted by `sdk-parity.test.ts`, not assumed.
8. **Open Contracts** — `spec/` is the published form of the runtime law;
   `C4` verification fails on drift between `spec/` and code.
9. **Human Authority** — durable gates are journal records (survive process
   death); resolution is idempotent across restarts; prompt decisions open
   gates; the CLI `resume` path is the human surface.

## 3. Data flow (one privileged action)

```
principal → DecisionRequest ──► evaluatePolicy (fail-closed)
                                 │ allow │ deny ──────────► journaled + audited (Refusal Log)
                                 ▼ prompt
                          decision record → journal (decide→journal→act)
                                 │
                                 ▼
                          gate record (open) → spine event → human `vae resume --answer`
                                 │
                                 ▼
                          gate record (resolved) → action may fire
```

Everything above is hash-chained: journal records and audit entries share the
same blake3 chain primitive; tampering is detectable at every layer
(chaos-verified).

## 4. Research subsystem (constitutional placement)

Research sits at L2 and obeys One Context Path: local documents are
fingerprinted (blake3) → content goes to the blob CAS (journal carries
`blob_ref`) → excerpts are fenced `<untrusted src=…>` → evidence + provenance
records are journaled → the local BM25 index is journaled → context packs are
pure functions over journaled facts and become visible to a run only via the
journaled `research.context.prepared` event. External content is untrusted by
type, not by convention; the trusted/untrusted boundary is structural
(`E1401` on violation).

## 5. Substrate decision (ADR-0018 — Proposed)

The invariants are substrate-neutral; MS-0/MS-1 are implemented in TypeScript
on Bun because that is the substrate in which this work could be **actually
built and verified end-to-end** (every guarantee above is executed, not
described). The journal format, envelope schema, and broker contracts are
byte-stable across a future re-platform. ADR-0018 requests Founder
ratification before MS-3 shipping milestones; the runtime/binary-size goals of
the original blueprint are honestly deferred until then.

## 6. Key invariants to preserve in MS-2

- `evaluatePolicy`'s fail-closed fall-through must never gain an "allow by default".
- Gate records are append-only: resolution appends, never mutates.
- The journal writer remains the ONLY seq allocator and the ONLY writer per run.
- Snapshots remain accelerators: replay equality is the law, tested in chaos.
- Research stays network-free unless a declared, broker-mediated capability
  (with fencing + provenance) is ratified.
