# PHASE XXII — Developer Experience Audit (MEASURED)

- **Task ID:** 2-b (Phase XXII DX audit)
- **Date:** 2026-09-03 (20:46 UTC)
- **Method:** measured, not trusted. Every claim below was executed or grep-verified in this session against the working tree at version **0.1.12-rc1** (`packages/vaerion/package.json:3`, `src/cli/vae.ts:18`). CLI evidence captured via `bun run vae …` (read-only help/error paths only); no code was modified; no installs, servers, or network. One measurement caveat applied and corrected: pipe-masked exit codes were re-measured with honest capture before recording (the same defect class ASC-XX Phase 19 flagged).
- **Scope:** `packages/vaerion/src/cli/` (vae.ts, commands.ts, ui.ts, io.ts, render.ts, workspace.ts), `src/kernel/errors.ts`, `spec/errors.yaml`, `packages/vaerion/tests/`.

---

## 1. Requirement matrix

| # | Requirement | Status | Evidence (file:line or captured output) | Gap if any |
|---|-------------|--------|------------------------------------------|------------|
| 1.1 | Main help answers What/Why/Next | EXISTS | `bun run vae --help` (measured): usage line, annotated command surface with *why* prose per command (e.g. `ci simulate … "A projection is not an execution — never claimed as one."`), global flags, exit-code legend `0 ok · 1 internal · 2 usage · 3 broker-denied · 4 provider-down · 5 partial-with-repair-hint`, footer pointing at `docs/constitution/` + `spec/`. Help parsed before any side effect — `src/cli/vae.ts:464-471` ("Guarantee #1 — help first, always"). | Static text only; no `--help` flag-level granularity. |
| 1.2 | Per-command help coverage | EXISTS | `COMMAND_HELP` defines exactly 17 topics matching the D-M′ surface: init, run, resume, explain, journal, doctor, dev, serve, package, provenance, repo, ci, release, tour, account, ai, center (`src/cli/vae.ts:135-408`). Measured `vae journal --help`, `init --help`, `doctor --help`, `run --help`, `ai --help` — all teach usage + semantics + exit codes ("Exit 5 with `Fix:` hints on failures"). Topic routing works both orders: `vae --help journal` → journal topic (measured, exit 0). | — |
| 1.3 | Welcome front door (bare `vae`) | EXISTS | `src/cli/commands.ts:2280-2309` `buildWelcomePayload`: `what` (one sentence), `directory` measurement (kind fresh/workspace, runs count), `next` (command + why: fresh → `vae init`, workspace → `vae doctor`), `learn` list, `read_only: nothing was created or modified`. Measured exit 0. | — |
| 1.4 | `--version` top-level flag | MISSING | Measured: `bun run vae --version` prints the **welcome payload**, not a version line — the flag is never parsed and the bare-command welcome path absorbs it (`parseArgs` `src/cli/vae.ts:416-453` has no version branch; `runCli:490-504` treats no-command as welcome). Only the `vae version` *subcommand* prints `vae 0.1.12-rc1` / `{"version":"0.1.12-rc1"}` (`vae.ts:526-537`, measured). | Conventional `--version` contract broken; scripts parsing `vae --version` get a multi-line payload. |
| 1.5 | `vae help [topic]` alias | MISSING | Measured: `vae help` → `E1600 unknown command: help. Fix: run \`vae --help\` for the Daily Seven.` exit 2. | Trivial alias; `--help topic` already works. |
| 2.1 | Shell completions (bash/zsh/fish/powershell) | MISSING | Grep across `packages/vaerion/src` for `completion|compgen|__vae|zsh|fish|powershell|bash-completion`: only unrelated hits (HTTP "chat/completions" in `src/gateway/adapters/openai.ts:4-93`; prose "completion" in `src/agents/runtime.ts:7,406`, `src/workflow/engine.ts:193`). No completions command, no generated completion scripts, no packaging hooks. Mentioned only as a post-GA idea in `docs/vaerion-master-blueprint.md:830` ("shell completions at runtime"). | Highest-value DX gap. |
| 3.1 | NO_COLOR support | EXISTS | `src/cli/ui.ts:54` (`!vars.NO_COLOR` in rich gate), `src/cli/render.ts:9` ("NO_COLOR/TERM=dumb always degrade to plain text"), pinned by `tests/integration/color-accessibility.test.ts:64-67`. | — |
| 3.2 | TERM=dumb degradation | EXISTS | `src/cli/ui.ts:55`; pinned `tests/integration/color-accessibility.test.ts:71-73`. | — |
| 3.3 | CI environment degradation | EXISTS | `src/cli/ui.ts:56` (`vars.CI === undefined`); pinned `tests/integration/color-accessibility.test.ts:77-79`. | — |
| 3.4 | TTY detection | EXISTS | `src/cli/vae.ts:578` (`tty: process.stdout.isTTY === true`), consumed at `src/cli/ui.ts:52-57` (rich gate) and `src/cli/render.ts:54` (spinner gate). `CliIo.tty` is an injected port (`src/cli/io.ts:13-14`) so tests run non-TTY by construction. | — |
| 3.5 | Profile override escape hatch | EXISTS | `VAE_UI=rich` / `VAE_UI=plain` (`src/cli/ui.ts:49-51`); "explicit > ambient" is documented and pinned (`tests/integration/color-accessibility.test.ts:82-85`). Measured `VAE_UI=rich vae dev` emits truecolor ANSI (`033[38;2;…m`) + Unicode box glyphs even piped — intended for evidence capture. | — |
| 3.6 | Color handling | EXISTS | Custom zero-dependency `Ansi` truecolor painter (RGB 38;2 SGR), disabled → identity function (`src/cli/ui.ts:67-94`). No chalk/picocolors/supports-color anywhere (grep: 0 hits); deps are only ajv/hash-wasm/yaml (`packages/vaerion/package.json:18-22`). | — |
| 3.7 | Unicode → ASCII fallback | PARTIAL | Degradation strategy is profile-level: non-rich = plain text with no ANSI/panels (`render.ts:63-67,87,125-145`). But plain mode still carries typographic Unicode (em-dash `—`, middle dot `·`, ellipsis `…` in help text; `SYM` glyphs `✓ ✗ ⏳ ⚠ →` defined once at `ui.ts:98-106` with no ASCII twin), and there is no LANG/LC_ALL/encoding-aware transliteration. Grep for `ascii|lang|encoding|codepage` in `src/cli/`: only code comments. | On a true ASCII/POSIX locale terminal the help footer and rich panels render mojibake-adjacent; no fallback exists. |
| 3.8 | Quiet mode | MISSING | No `--quiet`/`-s` flag (parser accepts any `--x` silently — `vae.ts:428-441` — but no command reads a quiet flag); no `VAE_QUIET` env (grep: 0 hits). Banner+footer suppression only exists in json mode. | Not feasible to silence chatty commands today. |
| 3.9 | Verbose / debug / trace modes | MISSING | No `--verbose/--debug/--trace` flags, no `VAE_DEBUG`/`VAE_TRACE` env (grep over `src/`: 0 hits). Internal errors render as `E1900 <msg>` with **no stack trace, no detail dump, no trace id surface** (`vae.ts:564-566`, `render.ts:161-168`). | Debuggability of engine bugs relies on journal forensics only. |
| 3.10 | `--json` machine mode | EXISTS (with one defect) | Guarantee #2 (`vae.ts:6`): `--json` → NDJSON everywhere (`vae.ts:473`, `render.ts:59-61,71-74,91-93,152-153`). Measured: `vae version --json` → `{"version":"0.1.12-rc1"}`; `vae journal bogus --json` → `{"error":{"code":"E1600","name":"usage_error","message":"…","fix":"…","detail":null}}` exit 2. | **Defect (measured):** the unknown-*command* path bypasses json mode — `vae frobnicate --json` prints plain `E1600 unknown command: frobnicate. …` on stderr (`vae.ts:538-544` branches on `renderer.rich` only, never `mode === "json"`). Violates the stated "every command" guarantee on the first error most scripts hit. |
| 4.1 | Error codes (E####) | EXISTS | `spec/errors.yaml` = single source of truth, **81 codes**, ranges documented (measured `rg -c`), mirrored by `ERROR_CATALOG` (`src/kernel/errors.ts:116-198`) with `tools/verify.ts` asserting sync (`errors.ts:4-5`); ADR-0014 is the catalog decision. | — |
| 4.2 | Recovery hints / "Fix:" guidance | EXISTS | Error culture "stable code + what failed + why likely + `Fix:` actionable next step" (`errors.ts:7-8`); every catalog entry carries `fix` with concrete next commands (e.g. E1002 → `vae journal recover <run>`; E1200 → `vae init`; E1502 → `vae journal ls`). Measured live: `E1600 unknown command: frobnicate. Fix: run \`vae --help\` for the Daily Seven.`; `vae --cwd /tmp doctor` → per-check `fix: run \`vae init\``, summary "1 check(s) failed", **exit 5** (honest re-measure; pipe had masked it). | — |
| 4.3 | Honest exit codes | EXISTS | Five Guarantees D-N (`io.ts:4-5`, `ExitCode` at `io.ts:18-25`); code↔error-class mapping table `vae.ts:547-566`. Re-measured without pipes: unknown command/journal/run → 2; configless doctor → 5; help/welcome/tour → 0. | — |
| 4.4 | Rich error presentation | EXISTS | `errorBlock` (`src/cli/ui.ts:327-344`): panel titled `E#### · name`, dimmed catalog summary, gold `Fix:` line, auto-extracted related command from the fix text, and a `Docs: spec/errors.yaml#E####` anchor. | — |
| 5.1 | Progress / animation | EXISTS | `Spinner` (`src/cli/ui.ts:1009-1063`): 10 braille frames, 90 ms interval, `\r\u001b[2K` line rewriting, timer `unref()`'d so it never keeps a failing process alive, `succeed()` prints measured wall time via the ONE clock, silent `stop()` for dry-runs. Gated `rich && tty && raw` (`render.ts:52-55`) so pipes get a perfect no-op. Used in 4 live paths: `commands.ts:247` (model op), `:1118`, `:1606`, `:2169`. | No deterministic progress *bars* (e.g. indexing docs N/M) — spinner label only; fine for current operation latencies. |
| 6.1 | Piping / redirection behavior | EXISTS | Non-TTY ⇒ plain profile, zero ANSI (measured: `vae --help | od -c` and `vae dev | od -c` contain no `033[` bytes; `VAE_UI=rich` pipe shows them, proving the gate is the only difference). Pinned in-suite by `tests/integration/color-accessibility.test.ts` (NO_COLOR/TERM=dumb/CI/VAE_UI matrix). Plain mode is declared "the pipe/CI contract … byte-compatible with the historical output" (`render.ts:5-6`, `ui.ts:18-20`). | The --json unknown-command defect above is the one pipe-path wart found. |
| 7.1 | Editor integrations (VS Code / thin client) | MISSING (seams only) | No VS Code extension, LSP, or editor thin-client code in the repo (grep `vscode|LSP|language server|thin.client` over repo: only prose). References: `docs/adr/0010-loopback-daemon-pairing-token.md:12` ("SDKs and editor integrations need a programmatic surface beyond the CLI") and the thin-client doctrine (`docs/constitution/VAERION_CONSTITUTION_v1.7.md:264-265`, Sacred Invariants 1 & 7). The sanctioned seam exists — `serve` daemon + `sdks/typescript/` — but no editor consumes it yet. | Out of GUI sandbox scope except SDK/daemon-side enablement. |

**Counts:** 24 rows — **EXISTS 17 · MISSING 6 · PARTIAL 1** (one EXISTS row carries a measured sub-defect: 3.10).

---

## 2. Captured output snippets (verbatim, this session)

Main help (tail):
```
Global flags:
  --json                     stable NDJSON output (machine mode, guaranteed)
  --plain                    human-readable output (default)
  --dry-run                  zero side effects — plan only, nothing written
  --cwd DIR                  operate on DIR as the workspace (default: .)
  --help                     show this help and exit (never executes)

Exit codes: 0 ok · 1 internal · 2 usage · 3 broker-denied · 4 provider-down · 5 partial-with-repair-hint

Learn more: docs/constitution/ — the ratified law of record · spec/ (contracts)
```

Error quality (plain, exit 2, re-measured without pipe):
```
E1600 unknown command: frobnicate. Fix: run `vae --help` for the Daily Seven.
```

Error in `--json` mode for a routed command (exit 2):
```json
{"error":{"code":"E1600","name":"usage_error","message":"unknown journal subcommand: bogus (supported: ls, show, verify, recover, export)","fix":"Re-run with `--help`; help always teaches and never executes.","detail":null}}
```

The measured --json defect (unknown command bypasses json; plain text on stderr):
```
$ bun run vae frobnicate --json
E1600 unknown command: frobnicate. Fix: run `vae --help` for the Daily Seven.   ← not NDJSON
```

Welcome front door (bare `vae` / `vae --version`, exit 0):
```
command: welcome
engine_version: 0.1.12-rc1
what: Vaerion is the local, deterministic, auditable substrate where developers, agents, and models do real work on a codebase.
directory:
  path: /home/z/my-project/packages/vaerion
  kind: fresh
  has_config: false
  has_workspace: false
  runs: 0
next:
  command: vae init
  why: scaffold vaerion.yaml + .vaerion/ in this directory — nothing exists yet
learn:
  0: vae --help — the command surface of record (help always teaches)
  ...
```

Configless `doctor` (exit 5, per-check Fix):
```
checks:
  0:
    check: config
    ok: false
    code: E1200
    detail: vaerion.yaml not found
    fix: run `vae init`
```

Piping proof: `vae --help | od -c` and `vae dev | od -c` contain **zero** `033[` (ESC) bytes; `VAE_UI=rich vae dev | od -c` shows `\033[38;2;227;179;65m` + `╔═` box glyphs — the TTY gate is the only difference.

---

## 3. Top feasible gaps (prioritized; closable in this Linux sandbox — no GUI, no Windows/macOS)

1. **Shell completions** (row 2.1 — MISSING). Add `vae completions <bash|zsh|fish|powershell>` generating scripts from a static table of the 17 commands + known flags (the flag inventory already exists in `parseArgs`, `vae.ts:434`). Pure codegen; verifiable headlessly (emit script, smoke-parse it, assert command names present). Closes the single largest class-CLI DX gap.
2. **`--version` + `vae help [topic]`** (rows 1.4, 1.5 — MISSING). Handle `--version`/`-V` in `runCli` before the welcome fallthrough (print `vae 0.1.12-rc1`, NDJSON under `--json`); alias `help` → help path with topic routing (both mechanisms already exist — `vae.ts:465-471,526-537`). A few lines + pin tests.
3. **JSON guarantee on the unknown-command path** (row 3.10 defect). Route `vae.ts:538-544` through `renderer.error(new VaerionError("E1600", …))` so `--json` emits the NDJSON error envelope. Restores Guarantee #2 on the most-hit error path; one-line-class fix, test-pinnable.
4. **Quiet + debug modes** (rows 3.8, 3.9 — MISSING). Minimum viable: a `--quiet` flag suppressing banner/footer/welcome framing (all framing is already centralized in `render.ts helpFrame/banner/footer` call sites), and `VAE_DEBUG=1` (or `--debug`) appending the stack/detail of `E1900` internal errors on stderr. Small, isolated, testable.
5. **ASCII fallback for non-UTF-8 locales** (row 3.7 — PARTIAL). Add an ASCII twin map for `SYM` (`ok: "v"|"✓"`, arrow `->`, dot `.`, ellipsis `...`) selected when `LANG`/`LC_ALL` is `C`/`POSIX`/non-UTF-8, and an ASCII help variant (em-dash → `-`, middle dot → `.`). Deterministic, sandbox-testable; completes the terminal-UX invariant set.

Honorable mention (feasible, lower priority): deterministic progress counters for research indexing (N/M documents) alongside the spinner label (row 5.1 note); completions smoke tests for the generated scripts.

---

## 4. What already meets the bar (measured, for balance)

- Help-as-contract is genuinely enforced: `--help` parsed before side effects (`vae.ts:464-471`), 17/17 command topics, errors embed the supported-command list at the failure site (e.g. `unknown run kind (supported: research, demo, model, agent, workflow)`).
- The E-catalog (81 codes) with mandatory `Fix:` lines, `Docs: spec/errors.yaml#E####` anchors, and the 0/1/2/3/4/5 exit-code law is at or above the standard of mainstream CLIs; `doctor` fails with exit 5 + per-check fixes rather than zero-with-warnings.
- The TTY/plain/json profile matrix (NO_COLOR, TERM=dumb, CI, VAE_UI) is both implemented and pinned by a dedicated accessibility test suite — pipes and CI get byte-stable, ANSI-free output by construction.
- The rich profile (truecolor panels, badges, receipts, spinner) is a real design language, not an afterthought, and every composite is a no-op outside a raw TTY — nothing decorative leaks into machine surfaces.
