# Onboarding — the 15-minute path (D3.6 preparation)

This is the developer onboarding path that the Release Gate (D3.6) will
measure at MS-5. Follow it top to bottom; every step is real.

## 0. Prerequisites (2 minutes)

- [Bun](https://bun.sh) ≥ 1.3 (`bun --version`)
- A terminal. That is all. The engine is local-first (Sacred Invariant VI).

## 1. Get the engine (2 minutes)

```bash
git clone <this repository> && cd vaerion
bun install
```

## 2. Feel the law (3 minutes)

```bash
bun run vae -- --help          # Guarantee 1: help that teaches
bun run vae -- help E2010      # errors are curriculum: E#### + Fix
```

Read the Daily Seven. Seven commands, no command zoo (D3.2).

## 3. Create a workspace (3 minutes)

```bash
mkdir -p /tmp/my-first-engine && cd /tmp/my-first-engine
bun run --cwd <repo> vae init --dry-run --plain   # Guarantee 3: preview, zero effect
bun run --cwd <repo> vae init --plain             # Receipt: what changed · cost · undo · record
ls -a        # vaerion.yaml, vaerion.lock, runs/, PROJECT.md, .vaerion/
```

Open `vaerion.yaml`. Everything is declared; nothing is implicit. The
lockfile pins the configuration fingerprint — drift is refused, never
silently accepted (D12.4 posture).

## 4. Execute a declared run (3 minutes)

```bash
bun run --cwd <repo> vae run selfcheck            # journaled, broker-mediated, receipted
bun run --cwd <repo> vae journal --list --plain   # the run exists in append-only truth
bun run --cwd <repo> vae explain <run-id> --plain # the North Star: post-hoc causal explanation
```

What happened, mechanically: the plan fingerprint was journaled; each
step made a broker decision (journaled BEFORE the act, D11.4); a
checkpoint preceded each effect (D11.6); the journal chain is blake3
and verifiable (`vae journal <id> --verify`).

## 5. Verify the engine itself (2 minutes)

```bash
cd <repo>
bun run verify   # constitution → layerlint → typecheck → tests → fixtures → security
```

Every green gate means proven, not hoped (Stage 20). The gates are the
D20.8 set minus journeys (which arrive at MS-5, per the roadmap).

## Where to go next

- `docs/architecture.md` — the layer law and the fourteen units.
- `CONSTITUTION.md` — the law itself. Read Parts I–IV first.
- `docs/roadmap-status.md` — what exists, what is next, nothing silent.
