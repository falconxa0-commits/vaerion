# Vaerion

<img src="public/icon-192.png" alt="The Vaerion seal — the witness rule above the V" width="88" align="right" />

**An AI-native development engine.** Local-first. Deterministic. Auditable
by construction.

Vaerion runs AI-assisted development work the way a database engine runs
transactions: every step lands on one versioned event spine, journals are
append-only and blake3-chained, permissions pass through a fail-closed
broker, runs replay deterministically, receipts are folded from journals,
and deliverables build into reproducible `.vxn` bundles whose identical
inputs produce identical bytes.

```
vae run demo --sources ./sources --query "determinism"
vae journal verify <RUN_ID>          # the chain holds — measured, not promised
vae package build                    # byte-identical bundles, sealed by vaerion.lock
```

**Status: PUBLIC BETA** (`v0.1.7-rc1`). Verified before every release;
honest about what is not yet done — see `docs/security/RISK-LEDGER.md`
and `docs/adr/README.md`.

---

## Why Vaerion exists

AI-assisted development loses its most valuable property —
trustworthiness — when the work leaves no evidence. Vaerion's answer is
architectural, not procedural:

| Property | Mechanism |
|---|---|
| Every action is evidence | One versioned event spine; append-only NDJSON journals, single writer, blake3 chain |
| Nothing acts without authority | Fail-closed permission broker; every decision journaled; durable human gates |
| Failure is recoverable | Event-sourced state, checkpoint chaining, `resume`, `journal recover` |
| Output is reproducible | Deterministic `.vxn` bundles (ADR-0016): identical inputs → identical bytes, verified by a pure check that never executes content |
| Trust is scoped | Model I/O passes one sanctioned gateway gate (ADR-0019); extensions run sha256-pin-verified in a subprocess host (ADR-0009) |
| Secrets stay secret | OS-keychain-first resolution (ADR-0013); secrets never enter journals, receipts, or bundles |
| Zero telemetry | No analytics, no undeclared network — enforced mechanically by constitutional checks on every build |

## Quickstart (15 minutes)

Install (every channel delivers the same engine — full map in
`docs/INSTALL.md`, packaging in `packaging/`):

```sh
npm install -g vaerion        # or: pip install vaerion
# or the universal installer: curl -fsSL https://vaerion.dev/install | sh
```

Or from source:

```sh
git clone <repository-url> vaerion && cd vaerion
bun install
bun run tools/verify.ts              # six gates must be green
alias vae="bun run packages/vaerion/src/cli/vae.ts"

vae init
vae run demo --sources ./sources --query "your question"
vae journal verify <RUN_ID>
vae doctor
vae provenance <BUNDLE>.vxn      # permanent evidence for anything it built
vae repo                         # measure the repository you are standing in
vae account                      # who acts in this workspace — local identity, measured
vae ci validate                  # CI must re-run the same six gates (D-R)
vae release readiness            # can this repository ship? measured only
```

New here? Run **bare `vae`** — the welcome front door measures your
directory and points at the next step — then take **`vae tour`**, a guided,
read-only walk of the whole engine (nine steps, measured against your
machine).

Full walkthrough: `docs/QUICKSTART.md` · companion workspace:
`examples/vaerion-demo/`.

## The CLI at a glance

`vae` (the Daily Seven, plus additive commands — bare `vae` opens the
welcome front door):

`init` · `run research|demo|model|agent|workflow` · `resume` · `explain` ·
`journal ls|show|verify|recover|export` · `doctor` · `dev` · `serve` ·
`package build|verify` · `provenance` · `repo` · `account` ·
`ci validate|simulate` · `release readiness` · `tour`

Every command honors `--json` (stable machine output), `--dry-run`
(plan only, nothing written), and exit codes 0–5 with the E-code
diagnostics catalog (`docs/TROUBLESHOOTING.md`).

On an interactive terminal the CLI renders the PHASE Ω design language —
panels, honest status badges, receipts, educated errors with fix and doc
pointers (see `brand/BRAND-BOOK.md`). Pipes and `--json` always receive the
stable plain contract; `VAE_UI=plain|rich` overrides the detection.

## The local daemon and SDK

`vae serve` starts a loopback-only HTTP/SSE daemon (pairing token printed
once) exposing the same contracts the CLI exercises. The TypeScript SDK
(`@vaerion/sdk`) is wire-parity-tested against the CLI — same contracts,
same behavior.

## Verification law

`bun run tools/verify.ts` runs six gates and writes the measured record
to `.vaerion-verification.json`: strict typechecks (engine, SDK), the
test suite with enforced coverage floors, layerlint architecture
boundaries, the constitutional invariants (zero telemetry, determinism,
no placeholder debt, contract sync, secret scan, config guard, egress
confinement), and repository lint. **All six must be green before any
commit.** CI re-runs the same suite on every push (`.github/workflows/`).

## Repository map

| Path | What it is |
|---|---|
| `packages/vaerion/` | The engine and the `vae` CLI |
| `sdks/typescript/` | `@vaerion/sdk` — wire-parity client |
| `spec/` | Contracts: errors, events, schemas, OpenAPI, WIT world |
| `docs/adr/` | Architecture decision records (indexed in `docs/adr/README.md`) |
| `docs/security/` | Threat model, mitigation record, remaining-risk ledger |
| `docs/ga/` | Release verification and audit packet |
| `examples/vaerion-demo/` | The 15-minute demo workspace |
| `brand/` | The design system: seal, editions, brand book (assets generated by `tools/brand-render.ts`) |
| `tools/` | Verification, status dashboard, and release tooling |

## Beta program

New to the project? `BETA-ONBOARDING.md` is the onboarding contract:
the four-stage path (install → first verified run → reproducibility
proof → daemon + SDK), the feedback severity ladder, and the privacy
posture.

## Governance and license

Vaerion is maintained under an explicit engineering constitution
(`docs/constitution/`). Architectural decisions are recorded as ADRs;
substrate-level decisions are explicitly marked until the project owner
ratifies them. Copyright (c) 2026 Auren. Licensed under the Apache
License 2.0 — see `LICENSE`. Contributions agree to the same license
(`CONTRIBUTING.md`).
