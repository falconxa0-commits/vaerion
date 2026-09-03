# Vaerion CLI Manual — `vae`

> **Provenance and honesty note.** This manual was generated for engine
> `0.1.12-rc1` from the CLI's single source of truth — the `COMMAND_HELP`
> registry in `packages/vaerion/src/cli/vae.ts` — and cross-checked against
> `packages/vaerion/src/cli/commands.ts`, `src/cli/io.ts` (exit codes), and
> `src/cli/ui.ts` (rendering profiles). Every command topic listed here was
> verified by executing `vae <command> --help` on this tree before this file
> was written. Flags not present in the registry are not documented.
>
> Shell completions are being implemented in this same campaign and are
> not yet part of the registry, so they are not documented here. There is
> no `--version` global flag; the version is printed by the welcome banner
> and `vae dev`.

---

## Synopsis

```
vae [global flags] <command> [args] [flags]
```

Bare `vae` (no command) opens the welcome front door: it measures the
current directory read-only and points at the next step. Exit 0 in every
output mode; never a usage error.

Help is always safe: `--help` (or `-h`) is parsed **before** any command
executes and before any config, workspace, or filesystem access. Every
command topic has its own help page:

```
vae --help
vae init --help
vae run --help
vae serve --help
```

## Conventions

### The help-first and machine-mode guarantees

The CLI entrypoint (`packages/vaerion/src/cli/vae.ts`) carries these
guarantees:

1. `--help` is parsed before any side effect; help always teaches, never
   executes.
2. `--json` switches every command to stable NDJSON (machine mode). The
   JSON contract is byte-stable and is what the SDK and tests consume.
3. `--dry-run` is threaded into every mutating command: it prints the plan
   and writes nothing.
4. Exit codes are honest (0–5, see the table below).

### Output profiles

The renderer resolves one of three profiles (`src/cli/ui.ts`):

| Profile | When | Behavior |
|---|---|---|
| `json` | `--json` passed | Stable NDJSON; never painted, never decorated |
| `plain` | default when stdout is not a TTY | Byte-stable text, zero ANSI — the pipe/CI contract |
| `rich` | stdout is an interactive TTY | Unicode panels, truecolor, badges; decoration only in a real terminal |

The rich profile is suppressed when any of these hold: `NO_COLOR` is set,
`TERM=dumb`, `CI` is set, or stdout is not a TTY. Explicit override beats
ambient detection: `VAE_UI=rich` forces rich rendering (including through
pipes — intended for evidence capture); `VAE_UI=plain` forces plain. The
render width is clamped to 56–120 columns (default 100 when unknown).

Piped output is byte-free of ANSI by construction; this is pinned by tests
(`tests/integration/color-accessibility.test.ts`).

### Global flags

| Flag | Effect |
|---|---|
| `--json` | Stable NDJSON output (machine mode, guaranteed) |
| `--plain` | Human-readable output (default) |
| `--dry-run` | Zero side effects — plan only, nothing written |
| `--cwd DIR` | Operate on DIR as the workspace (default: `.`) |
| `--help`, `-h` | Show help for the topic and exit 0 (never executes) |

### Workspaces

Every command operates on exactly one workspace: `vaerion.yaml` (your
declared intent) plus `.vaerion/` (state). There is no ambient state
anywhere else. Within `.vaerion/`:

| Path | Contents |
|---|---|
| `.vaerion/journal/` | One append-only, blake3 hash-chained `<run>.ndjson` per run |
| `.vaerion/blobs/` | The content-addressed store (blob CAS) |
| `.vaerion/exports/` | Redacted journal exports (`<run>.redacted.ndjson`) |
| `.vaerion/package/` | Reproducible bundle build state |
| `.vaerion/audit.log` | The audit ledger (hash-chained; never hand-edit) |
| `.vaerion/refusals.log` | The durable Refusal Log (hash-chained) |

Receipts are the closing record of every run: the last journal record of a
run is its receipt, and `vae explain`/`vae center` surface it.

---

## Command reference

The command surface is "the Daily Seven + additive commands". Each topic
below mirrors its real `--help` text; only flags that exist are listed.

### `vae init`

```
vae init [--template minimal|demo|agent] [--name NAME] [--dry-run]
```

Scaffolds `vaerion.yaml` (strict schema 0.1) and the `.vaerion/` workspace
from the deterministic template registry. Templates:

- `minimal` — the default; bare `vae init` is exactly this template.
- `demo` — a demo workspace (`./docs` + `./sources` capabilities), ready
  for `vae run demo`.
- `agent` — an agent workspace: mockbrain planner, declared tools, and an
  explicit policy rule for the agent's model.invoke grant.

Every template is byte-stable (the only parameter is `--name`) and
validates against the strict config law; telemetry is structurally false.
Refuses to overwrite an existing `vaerion.yaml`. Unknown templates are a
usage error (`E1203`). `--dry-run` prints the plan and writes nothing.

### `vae run`

```
vae run research --sources P[,P] --query Q [--max-docs N] [--dry-run]
vae run demo [--sources P,P] [--query Q]
vae run model --model P/M [--prompt TEXT] [--system TEXT] [--seed N]
              [--op chat|embed|rerank] [--input-json JSON] [--query Q]
              [--docs-json JSON] [--max-tokens N] [--intent TEXT] [--dry-run]
vae run agent --goal TEXT [--planner inline|model] [--steps N] [--plan-json JSON]
vae run workflow --dag FILE [--resume RUN_ID]
```

`research` and `demo` execute a local research run through the full
constitutional pipeline: declared capability → broker decision per source
(journaled) → fingerprint → fence → blob CAS → evidence → local index →
query → citations → context pack → snapshot → receipt. Every step is
attributed and hash-chained. Config policy rules evaluate first: a deny
stops the run (exit 3); a prompt pauses it with a durable gate (exit 0,
awaiting) for `vae resume`. `demo` defaults to `./docs/constitution` +
`./docs/adr` with a fixed query. Exit 3 if the broker denies; exit 5 if
the journal fails final verification.

`model` invokes through the gateway single gate: broker decision
(`model.invoke`, journaled; ceiling = `gateway.providers` in
`vaerion.yaml`) → broker `secret.read` decision when the provider needs a
credential (the value is resolved at call time, never journaled) → adapter
over the sanctioned transport → usage and integer micro-USD cost metered
on the spine → receipt. `mockbrain/*` models are the local seeded virtual
provider (no network; byte-identical outputs for the same seed). A prompt
policy pauses the run with a durable gate; a deny exits 3; budget overrun
exits `E1703`.

`agent` runs the supervised agent loop: every step (model, tool, note,
context) is journaled with round/index coordinates. `--planner inline`
requires `--plan-json` (a declared JSON step array — the hermetic
determinism device); `--planner model` plans through the gateway single
gate (`agents.plannerModel`, default `mockbrain/mock-1`). Tools must be
declared in `vaerion.yaml` AND granted by policy rules; undeclared tool
calls are refused fail-closed (`E1801`). Broker refusals are fatal; the
step ceiling stops loudly (`E1804`); gates pause for `vae resume`.

`workflow` executes a DAG `{id, nodes:[{id, deps, step, maxAttempts?}]}`,
validated fail-closed (`E1803`); deterministic topological scheduling
(lexicographic tie-break); node outputs are content-addressed and
journaled; `--resume RUN_ID` continues an interrupted run from its journal
fold (crash-safe).

### `vae resume`

```
vae resume RUN_ID [--answer JSON]
```

Restores a run deterministically from its journal. If a durable human gate
is pending, resume **without** `--answer` first: it renders the human
review (question, options, the linked decision, a review diff when
present). Then resolve with `--answer JSON` (default when omitted:
`{"approved":true}`). Approval of a broker prompt records an elevation
(journaled + audited); agent runs continue after approval. A denial ends
the run (exit 3).

### `vae explain`

```
vae explain RUN_ID
```

Reconstructs the run's narrative (decisions, gates, events, receipt) from
its hash-chained journal, plus the gateway metering rollup (tokens and
integer micro-USD per model) folded from the same journal. Exit 5 if the
journal fails verification.

### `vae journal`

```
vae journal ls
vae journal show RUN_ID
vae journal verify RUN_ID
vae journal recover RUN_ID [--dry-run]
vae journal export RUN_ID [--out PATH] [--dry-run]
```

Append-only journal operations. `recover` truncates **only** a torn crash
tail and re-seals the chain with an auditable note. `export` produces a
redacted, independently verifiable derivation (default output:
`.vaerion/exports/<run>.redacted.ndjson`).

### `vae doctor`

```
vae doctor
```

Verifies config validity, every journal's hash chain, every referenced
blob in the CAS, evidence↔blob↔fingerprint triangulation, audit-ledger
continuity, the Refusal Log chain, and the gateway picture (provider
capability matrix, declared providers/secret NAMES/budgets). Performs no
network access and resolves no secret values — zero telemetry is
constitutional. Exit 5 with `Fix:` hints on failures.

### `vae dev`

```
vae dev
```

Engine status: version, substrate (ADR-0018), layer map, workspace state,
milestone position. Read-only.

### `vae serve`

```
vae serve [--port N] [--host ADDR]
```

Starts the local API daemon (ADR-0010/ADR-0020): loopback HTTP/SSE over
the same engine contracts the CLI exercises — run starts, durable gate
answers, continuations, cancellations, event streams with journal cursor
replay, the gateway capability matrix (secret NAMES only), and the
generated OpenAPI description at `/openapi.json`.

Authentication is a pairing token generated at start and printed **once**
(`Authorization: Bearer <token>` on every call except `/health`,
`/version`, `/openapi.json`). Headless starts pre-provision via
`VAE_TRUST=<token>` — the token is then never printed. Shutdown:
`POST /shutdown` with the token echoed in the body. Non-loopback binds are
refused (`E2001`); remote exposure requires a ratified transport-security
ADR, never a flag. Default listener: `127.0.0.1:7897` (port 0 asks the OS
for an ephemeral port).

### `vae package`

```
vae package build [--out PATH] [--dry-run]
vae package verify BUNDLE [--dry-run]
```

`build` (ADR-0016) folds the declared inputs (`package.include` paths from
`vaerion.yaml`, plus every declared extension artifact — each pin-verified
before it is bundled) into a `.vxn` bundle. Entries are canonically
ordered; compression is zstd at the pinned level; content identity is
blake3. Identical inputs produce byte-identical bundles. The build also
regenerates `vaerion.lock` (generated, committed, never hand-edited). The
build run is journaled and closes with a receipt.

`verify` is the pure check: recomputes every digest, compares the manifest
pins against `vaerion.yaml` AND `vaerion.lock` (a mismatch is a hard
failure — the digest-swap defense), and reports an honest per-check
findings list. It never executes package content. Exit 0 verified; exit 5
with `E2206` + findings when the bundle must be refused.

### `vae provenance`

```
vae provenance ARTIFACT
```

Permanent provenance for anything Vaerion created — evidence, not
branding. Every digest that can be recomputed from the bytes is
recomputed, and the verification status is honest per kind: `.vxn` bundle
(full pure format check), `vaerion.lock` (seal cross-checked against the
on-disk bundle; `E2205` findings when evidence does not hold), a redacted
`*.ndjson` export (derivation header), or a release `MANIFEST.json`
(displayed as recorded). Exit 0 when the evidence holds; exit 5 with
findings when it does not.

### `vae repo`

```
vae repo
vae repo verify
```

Repository intelligence, measured never assumed. Read-only: every git
invocation runs with `--no-optional-locks` and fixed argv, so a
measurement can never mutate the repository it measures. The summary
reports branch, detached HEAD, staged/unstaged/untracked paths, conflicts,
merge/rebase/cherry-pick/bisect state, worktrees, submodules, tags at
HEAD, the commit-identity audit of the last 50 commits, and the canonical
remote state (reachability, main sync, tag push, protection hook) — each
VERIFIED when measured here and UNVERIFIED when it cannot be. `verify`
reports trust findings only. Exit 0 when no blocker-severity finding
exists; exit 5 otherwise. History is immutable: violations are recorded,
never rewritten.

### `vae ci`

```
vae ci validate
vae ci simulate --event push|pull_request|workflow_dispatch|tag [--ref NAME]
```

CI understanding: the workflows under `.github/workflows` are the remote
projection of the single verification authority (`tools/verify.ts`); no
surface may re-implement the gates. `validate` parses every workflow and
reports structural findings with stable codes: unparsable YAML (`E2307`),
shape defects (`E2304`), gate logic without the authority (`E2305`), the
step-own-env-in-if drift class (`E2306`), unpinned substrate versions, and
secret material echoed toward logs. `simulate` projects which workflows
trigger and which jobs would run for a measured event/ref —
deterministically, from the workflow text alone. A projection is NOT an
execution; remote outcomes are never claimed.

### `vae release`

```
vae release readiness [--live-gates]
```

The constitutional release evaluator: can this repository ship, measured
only. Each check carries an honesty label and a Fix: verification-gates
(`--live-gates` re-runs the gates live through the single authority),
git-tree-clean, git-identity-head, git-identity-history, release-tag
binding, version-lockstep, ci-validity, canonical-sync, release-artifacts,
worklog-ledger, reports-present. Fail-closed: unmeasurable means blocked.
Exit 0 READY; exit 5 BLOCKED with the blocker list. The evaluation is
journaled with a receipt when the repository is a Vaerion workspace.

### `vae tour`

```
vae tour
```

A guided, read-only walk of the engine: nine steps — what Vaerion is, this
directory, the config law, the journal, doctor, the gateway single gate,
your first run, the trust surface, where to go next — each measured
against this machine and this directory (no network, no writes). It
teaches by pointing at real commands; it never executes them. The same
directory yields byte-identical `--json` output.

### `vae account`

```
vae account
```

The identity and attribution surface. Read-only. Measures who acts here:
the actor law (canonical local actor and broker principal ids), the actors
observed in this workspace's journals, the commit identity (HEAD author +
recent-commit audit), and the declared secret PROFILES — names only, never
values (values resolve only behind broker decisions). Vaerion has no
cloud accounts: your identity is local, attributed, and yours. The same
workspace yields byte-identical `--json` output.

### `vae ai`

```
vae ai ask --question TEXT [--sources P,P | --capability NAME]
           [--model P/M] [--seed N] [--max-tokens N] [--max-docs N]
           [--intent TEXT] [--dry-run]
vae ai models
```

`ask` is the grounded question: a declared capability (`--capability`) or
an explicit `--sources` declaration (never ambient, never network) → one
broker decision per source (journaled; deny exits 3, a prompt policy
pauses with a durable gate for `vae resume`) → the one research pipeline
(fingerprint → fence → blob CAS → evidence → index → citations → context
pack, journaled and provenance-carrying) → the answer crosses the gateway
single gate with the fenced pack as the system prompt → metering folded
from the journal; the run closes with a receipt. Default model:
`mockbrain/mock-1` — the local seeded virtual provider (no network,
byte-identical answers for the same question, sources, and seed).
Untrusted source content travels only inside its fence.

`models` reports the gateway capability matrix (secret NAMES only).
Read-only.

### `vae center`

```
vae center
```

The operator cockpit. Read-only. One measured core folds this workspace's
artifacts into an honest operations snapshot: operations (runs, gateway
metering rollup, referenced blobs), integrity (audit-ledger and
refusal-log hash chains), and the release readiness digest when this
workspace is a repository checkout. Exit 0 when journals, both chains, and
every blob verify; exit 5 with the failing section otherwise.

---

## Exit codes

Honest exit codes are law (`src/cli/io.ts`):

| Code | Meaning |
|---|---|
| `0` | ok |
| `1` | internal error (an engine bug or an unmapped failure) |
| `2` | usage error (bad invocation, unknown command, unknown template) |
| `3` | broker-denied (a policy deny, a refused gate answer) |
| `4` | provider-down (gateway transport failures) |
| `5` | partial — completed with findings; the output carries repair hints |

The CLI maps stable E-codes to exit codes deterministically
(`runCli` in `src/cli/vae.ts`):

| Exit | E-codes mapped |
|---|---|
| 2 | `E1600` (unknown command / usage), `E1203` (unknown template), `E1700`, `E1701`, `E2204`, `E2300` |
| 3 | `E1300`, `E1301`, `E1302` (permission broker deny family) |
| 4 | `E1601`, `E1702`, `E1704`, `E1705`, `E1706` (gateway/provider down family) |
| 5 | `E1703` (budget), `E2200`–`E2203`, `E2205`, `E2206` (bundle/refusal findings), all `E23xx` (CI surface findings) |
| 1 | everything else |

Measured examples: an unknown command prints
`E1600 unknown command: <name>. Fix: run \`vae --help\` ...` and exits 2;
`vae doctor` outside a workspace reports `E1200 vaerion.yaml not found`
and exits 5; `vae doctor` on a healthy workspace exits 0.

## Error codes (E-codes)

Stable diagnostics live in `spec/errors.yaml` — the single source of truth
(81 codes at this writing; additive-only within v1: never reused, never
remapped). The runtime module `packages/vaerion/src/kernel/errors.ts` is
the L0 mirror of that catalog, and verification asserts both stay in sync.
Every entry carries a stable `name`, a `summary`, and a `fix` hint; the
CLI renders errors with their `Fix:` and a `Docs:` anchor of the form
`spec/errors.yaml#E####`. Ranges:

```
1xxx journal & persistence      11xx event spine
12xx configuration              13xx permission broker
14xx research                   15xx runtime/restore
16xx surface/usage              17xx model gateway
18xx agents, workflow, evals    19xx internal invariants (always engine bugs)
20xx local API daemon           21xx extension host
22xx reproducible bundles       23xx CI surface
```

See `docs/TROUBLESHOOTING.md` for the diagnostic walk-through and
`spec/errors.yaml` for the full catalog.

## Environment variables recognized by the CLI

| Variable | Effect |
|---|---|
| `VAE_UI` | Force the render profile: `rich` or `plain` (overrides TTY detection) |
| `VAE_TRUST` | Pre-provision the daemon pairing token for headless `vae serve` starts (the token is then never printed) |
| `NO_COLOR` | Disable color (rich profile suppressed) |
| `TERM=dumb` | Degrade to plain text |
| `CI` | Degrade to plain text (non-interactive contract) |

---

*This manual documents the registry of record at engine `0.1.12-rc1`
(release commit `485016f`). The registry is the one authority: if code and
this file ever disagree, the code wins and this file is a defect.*
