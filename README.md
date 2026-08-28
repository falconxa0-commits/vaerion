# Vaerion — The AI-Native Development Engine

> A deterministic, local-first runtime layer where AI agents do real
> work under human authority — observable, replayable, explainable.

`vae` is not an IDE, not a chat assistant, not a CLI wrapper around a
model. It is an **execution substrate**: the run is the unit of work,
the journal is the truth of what happened, and the Capability Broker is
the one door through which privilege exists.

```
Protocol over application · Substrate over features · Contracts over implementations
Simplicity over flexibility · Determinism over convenience · Local-first over cloud-first
Human authority over automation · Evolution without betrayal
```

## The law, in one screen

- **Nine Sacred Invariants** — Event Spine · Capability Broker ·
  Deterministic Runs · Journal · Receipts · Local-first Core · Machine
  Parity · Open Contracts · Human Authority. Breach is a C1 felony,
  reverted on sight.
- **The Five Guarantees** (constitutional, every command, forever):
  1. `--help` always teaches.
  2. `--json` always parses (schema-stable envelopes).
  3. `--dry-run` previews every change, faithfully.
  4. A Receipt follows every change: what changed · cost · undo · record.
  5. Honest exit codes: `0` ok · `2` usage · `3` refusal · `4` run failure · `5` internal.
- **Refusal over guess.** Every refusal is explained in plain language,
  offers the next legitimate step, and is recorded (Refusal Log).
- **Zero telemetry. Permanently.** Observability is exported by the
  operator, never harvested.

The full ratified law lives in-repo: [`CONSTITUTION.md`](CONSTITUTION.md).

## 60 seconds

```bash
bun install
bun run vae -- --help                     # help that teaches
mkdir -p /tmp/vae-demo && cd /tmp/vae-demo
bun run --cwd <repo> vae init --plain     # scaffold + Receipt
bun run --cwd <repo> vae run selfcheck    # journaled, broker-mediated, receipted
bun run --cwd <repo> vae journal --list --plain
bun run --cwd <repo> vae explain <run-id> --plain   # post-hoc causal explanation
```

`vae run` executes **declared** plans (`runs/*.yaml`) — never improvised
work. Decisions are journaled **before** they act; checkpoints precede
effects; the journal is a blake3 hash chain that detects any tamper.

## The verification floor

```bash
bun run verify
```

| Gate | Meaning |
|---|---|
| `constitution` | The repository physically inhabits the law (D4.7, D6.3) |
| `layerlint` | L0–L4 dependency matrix, 14 units, zero violations (D6.4) |
| `typecheck` | Strict TypeScript, zero errors |
| `test` | 141 tests: units, properties, integration, Five Guarantees conformance |
| `fixtures` | Golden fixtures — binding precedent (D4.3, D20.2) |
| `security` | No secrets in the tree (D19.5 posture) · zero telemetry patterns (D2.5, FR-3) |

Green means **proven**, not hoped (Stage 20).

## Repository shape

```
CONSTITUTION.md      the ratified law, in-repo (D4.7)
packages/vae-*       fourteen units behind the L0–L4 layer law (D6.2, D6.4)
spec/                versioned contracts — the courtroom with daylight (D6.3)
fixtures/            golden fixtures — binding precedent (D20.2)
tools/               the courts: layerlint, fixture runner, security scans
docs/                architecture, onboarding, ADRs, roadmap status, reports
sdks/typescript      SDK preparation (conformance-locked at MS-5, D17.2)
.github/workflows/   the D20.8 gate set, operational minus journeys
```

See [`docs/architecture.md`](docs/architecture.md) for the layer law and
unit ownership; [`docs/onboarding.md`](docs/onboarding.md) for the
15-minute path; [`docs/roadmap-status.md`](docs/roadmap-status.md) for
exactly where MS-0 stands, deferrals included, nothing silent.

## Status

**MS-0 — Skeleton and Law-in-Repo** (Stage 22 / Part VIII): implemented
and verification-complete, ready for Founder review. Roadmap order is
law: MS-1 Spine & Journal → MS-2 Broker hardening → MS-3 Execution →
MS-4 Gateway & Context → MS-5 CLI/API/SDK parity → MS-6 Extensions → GA.

## License

License decision deferred to Governance/Release by ratification (D2.9,
FR-5). All rights reserved until then — `SPDX-License-Identifier: NONE`.
