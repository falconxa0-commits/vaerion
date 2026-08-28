# ARCHITECTURE REPORT — MS-0

## The shape that enforces the law

The repository is a **single-version monorepo** (D6.1) of **fourteen
`vae-*` units** (D6.2) under a mechanical layer law (D6.4), a
`spec/` directory governed by the two-approver daylight rule (D6.3),
golden fixtures as binding precedent (D4.3, D20.2), and
`CONSTITUTION.md` at the root (D4.7). Structure is policy; dependency
direction is law; the courts run in CI (Article XIV).

```
L4  vae-cli ──────────────────── sdks/typescript
     │ only via                    │
L3  vae-api (service layer + daemon)
     │
L2  vae-agent · vae-workflow · vae-context(+research) · vae-intel · vae-ext-host · vae-package
     │
L1  vae-store · vae-capabilities · vae-tools · vae-gateway
     │
L0  vae-foundation · vae-config
```

**Matrix (enforced by `tools/layerlint.ts`, 0 violations):**
L0→L0 · L1→L0,L1 · L2→L0..L2 · L3→L0,L2 (L1 types-only) · L4→L0,L3.

The load-bearing property: `vae-cli` consumes the **L3 service layer**,
never L2 internals — the CLI exercises exactly what any external
principal gets, so an API gap is impossible by construction. `tools/`
is the court, not a layer; it ships to no one.

## One core, two postures (D7.1–D7.5)

`openEngineContext()` composes the engine once per workspace: config
resolution with provenance, journals (run + audit), blob store, spine,
broker with audit sink and refusal log, tool registry with builtins,
checkpoints, gate queue. The CLI runs this context **embedded**
in-process; the daemon serves it **over the loopback socket** with a
pairing token. No privileged path exists outside the context; no side
channels exist (D7.5).

## The spine of trust: decide → journal → act

Every consequential act flows through one discipline:

1. **Declared** — work exists only as plans (`runs/*.yaml`), validated
   (acyclic, unique, known registered tools) and fingerprinted.
2. **Decided** — the broker's pure decision function evaluates
   (request, policy, state); fail-closed; deny-beats-allow; audit
   failure = denial; human gates park durably.
3. **Journaled** — the decision is appended to the blake3 hash chain
   (gapless per-run seq, actor+cause mandatory) BEFORE any effect.
4. **Checkpointed** — before the effect (D11.6), so failure leaves a
   resumable state.
5. **Acted** — the tool executes through its declared contract
   (validated inputs, effect class, retry policy); outputs/failures are
   journaled and emitted on the spine (redacted at the publication
   boundary).

`vae explain` reconstructs this story from journal truth alone — the
North Star (D1.3) in working miniature.

## Determinism boundaries (Sacred Invariant III)

- Wall-clock time is a `Clock` port; decisions never read it.
- Serialization is canonical JSON (sorted keys); identical state hashes
  identically; journals of identical runs are byte-identical (tested).
- Non-determinism is declared at the type level (tool `deterministic`
  flag, gateway recording postures) — never ambient.
- Blakes3 (`@noble/hashes`, pure TS, vector-verified) chains every
  journal; any mutation is detectable with line-level precision.

## Substrate decision (ADR-0001)

The constitution's Stage 6 *hidden assumption* mentions Rust crate
boundaries; no ratified decision names a language. This build
environment has no Rust toolchain and no crates.io reachability, and
MS-0 acceptance demands runnable, green verification. The fourteen
units are therefore workspace units of a **Bun/TypeScript** monorepo —
preserving every ratified structural decision (D6.1–D6.4, D21.3
self-contained-binary posture via `bun build --compile` at release,
D21.2 reproducibility rules as declared contracts). The deviation is
owned in `docs/adr/ADR-0001-implementation-substrate.md` (Class C,
Article XIII), not hidden. Because all boundaries are port-based and
machine-enforced, a future Rust port moves units one at a time without
contract change (Open Contracts, Sacred Invariant VIII).

## Security posture

- **Fail-closed everywhere:** unknown capabilities denied; unknown
  config keys refused; invalid input refused before execution; unknown
  profile refused; drift refused.
- **Zero network code in the engine** — the gateway ships ports and
  machinery only; the research connector registry ships empty. There is
  no path to a model or the internet that is not first declared,
  granted, and recorded.
- **Secrets:** inputs, never configuration; grants carry names, never
  values; boundary redaction on spine publish, journal render, API
  output; the secrets court scans the tree (and found our own test
  literals during development).
- **Pairing token:** minted at first daemon use, 0600, constant-time
  compared, loopback-only binding; doctor verifies hygiene.

## Honest inventories (no fake implementations)

Crates whose implementations belong to later milestones export status
constants (`INTEL_STATUS`, `EXT_HOST_STATUS`, `PACKAGE_STATUS`) pinned
by tests, and unimplemented behavior is a **port with no
implementation** — nothing can import a fake. `vae dev` without a TTY
does one honest validation pass instead of pretending to watch. The
roadmap status carries the full law-visible deferral table (D22.4).

## What this architecture buys next

- **MS-1** plugs chaos hardening into `vae-store` (crash-during-append,
  cross-process locks, redacting export, explicit GC) without touching
  any consumer.
- **MS-2** deepens `vae-capabilities` (park/resume across restart,
  policy permutations) behind the same ports.
- **MS-3/MS-4** add real tools and model adapters as *registry
  registrations* — zero core edits (blueprint §5.1 property).
- **MS-5** locks CLI/API/SDK parity to the golden fixtures that already
  exist as precedent.
