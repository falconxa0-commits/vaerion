# ⚔️ ASCENSION XXVI+ — GA COMPLETION REPORT (the campaign close)

| | |
|---|---|
| **Campaign** | ASCENSION XXVI+ — Final GA Completion Campaign (directed by the Founder) |
| **Method** | LAW 1: fresh measurement before every act; nothing inherited; nothing fabricated |
| **Entry state (measured)** | ASCENSION XXV close `6df7f64`: gates 530/0/42 re-run fresh, `ok:true`; CI GREEN through the close commit; v0.1.13-rc1 live (8 assets, production-signed, prerelease-flagged); branch protection GET 200; secrets = exactly 1 (`RELEASE_SIGNING_KEY`); three-remote parity 0/0 |
| **Close state (measured)** | HEAD `21234b6` on local = canonical = github; gates **544/0/43 files, 9 gates, exit 0**; CI SUCCESS on main; Dependabot LIVE (6 first-sweep PRs, grouping proven); all five named engineering residuals CLOSED |
| **Divergences found between inherited claims and measurement** | **ZERO** — every XXV claim verified fresh before work began |

## 1. The five named engineering items — closed, with evidence

| # | Item (from REMAINING-REALITY-REPORT §4 / the directive) | Commit | Evidence of completion |
|---|---|---|---|
| 1a | **Dependabot enablement** | `61a6dd0` | `.github/dependabot.yml` — three ecosystems (`bun` root lockfile covering the whole workspace, `github-actions`, `pip` @ packaging/python), weekly Monday 06:00 UTC, minor+patch grouped, majors excluded from bot rides (P11) with the ignore rules naming them. **LIVE in production**: the first sweep opened 6 PRs — one group PR carrying 51 minor+patch updates (grouping proven), majors riding solo (the ignore law working). Contract-pinned by ci-truth tests (ecosystem coverage, schedule-per-ecosystem, grouping, majors-ignored). |
| 1b | **SHA-pin every external action** | `61a6dd0`, fix `21234b6` | All 6 `uses:` across both workflows pinned to full 40-hex SHAs with tag annotations; each SHA independently re-verified via the commits API. Two permanent tests: the full-SHA regex (a floating tag now FAILS the suite) + the annotation law. DEFECT LEDGER XXVI-1: the original exact-SHA test over-pinned — Dependabot's first lawful bump (upload-artifact 4→7, SHA + annotation correctly updated) failed it in production; replaced with the annotation law (the pin test cannot fight a lawful bump; bump review stays the human gate, P4). Recorded in the test itself. |
| 2 | **Daemon `packages` route group** (MS-6 leftover) | `c527531` | `POST /packages/pack`, `/packages/verify`, `/packages/import` in the route table (tag `packages`); handlers thin over RunRegistry methods composing the SAME engine calls as the CLI; `package.imported` joined the event registry additively (C4-synced); spec regenerated (17 paths); SDK client methods shipped; daemon path law (workspace-escape refused, E2204); import is verify-FIRST (a failing bundle is never admitted, E2206). **5 integration tests over real sockets** — the parity proof: the wire pack journals the IDENTICAL event-type sequence as `vae package build` (toEqual). |
| 3 | **Per-module coverage ratchets** | `61b7501` | `tools/coverage-ratchet.ts` + the checked-in baseline of record (116 modules) + a NEW `coverage-ratchet` gate fed from the tests gate's own table (suite runs once). Breach law: measured < floor − 1.0pp (the MEASURED jitter band — rehearsal.ts swung 25.00/24.51 across green runs); real regressions fail BY NAME; only a deliberate `--bless` lowers a floor. Seven permanent tests including the gate wrapper's red path. The gate proved it can fail twice before being trusted to pass. |
| 4 | **Cross-version upgrade leg (vN → vN+1)** | `e267eca` | A permanent integration test executing the REAL installer end-to-end: tagged `v0.1.12-rc1` source installed → a vN workspace journals (`init --template demo` + `run demo`) → the SAME prefix upgraded to vN+1 → the shim serves vN+1 and NOT vN → the vN tree retained (immutable law asserted) → the **vN-written journal verifies under vN+1** (`ok:true`, not torn). Scope honesty recorded: source-install path from the tag of record; a leg over a FUTURE train's released artifacts stays a rehearsal step. LIMITATIONS §2 updated from UNVERIFIED to MEASURED. |
| 5 | **Nushell + Xonsh completions** | `58fc388` | Both generators render FROM the ONE completion model (no second list to drift): Nushell external completer (`$env.config.completions.external.completer`), Xonsh via `add_one_completer`. Both carry honest UNVERIFIED markers (no host here — same law as zsh/fish/powershell). Help frames teach all six shells; docs/CLI.md's stale completions claim fixed; a new dx-surface test makes silent generator-lag impossible (every model command must render in both). |

## 2. What was measured, not assumed (the campaign's First Task)

- Governance, Constitution (v1.7), worklog, GA reports, the Founder packet — all read before any change.
- The verification suite re-run fresh at entry: 530/0/42, exit 0 — the inherited "530/0" claim VERIFIED, not trusted.
- GitHub parity, CI, release state, branch protection, secrets, signing — all re-measured via the API (see §4 of REMAINING-REALITY-REPORT).
- The registry/website surface — measured by a dedicated read-only agent (R-1) with the raw HTTP results in `docs/ga/REGISTRY-STATE-MEASUREMENT-2026-09-04.md`.
- One display artifact caught and dismissed by raw-byte measurement (`verify.yml` `branches: [main]` misread as `branches: ain]` by the terminal rendering — `od -c` proved the file intact).

## 3. Defect ledger of THIS campaign (nothing hidden)

| ID | Defect | Caught by | Resolution |
|---|---|---|---|
| XXVI-1 | The exact-SHA pin test over-pinned: Dependabot's first lawful action-bump failed CI in production | Production reality (the PR's own CI run) | Replaced with the annotation law; the defect recorded in the test comment (`21234b6`) |
| XXVI-2 | The ratchet gate's baseline was corrupted by my own corruption-drill restore one-liner (a `p` undefined bug left 100.01 in the baseline) | The new baseline-sanity test (the suite went red) | Repaired and re-blessed clean (`61b7501`) |
| XXVI-3 | The dry-run purity assertion in the pack wire test ran AFTER the real pack had written the bundle (test-logic error) | The failing test | Reordered: dry-run first, then real pack (`c527531`) |
| XXVI-4 | The cross-version test's `vae()` helper passed the cwd string into the options slot — every call defaulted to the repo root | The failing test (E1600 already-exists) | Fixed the helper (`e267eca`) |
| XXVI-5 | The first `git archive` lacked the top-level layout dir the installer requires (measured: "tarball does not contain the engine") | The failing test + a manual repro | `--prefix=vaerion-<version>/` added (`e267eca`) |
| XXVI-6 | tsc strict (noUncheckedIndexedAccess) rejected the byte-flip tamper lines in the daemon tests | The first full gate run (EXIT 1) | Explicit guards (`c527531`) |
| XXVI-7 | Two ci-truth test defects (regex missed trailing comments; comment-stripping needed) | The first test run (2 fail) | Fixed (`61a6dd0`) |

## 4. Final status table (the directive's required output)

| Item | Status | Evidence | Owner |
|---|---|---|---|
| Fresh measurement of inherited claims | **VERIFIED** | §2 above; `.vaerion-verification.json` fresh at entry | Auren |
| Dependabot (schedule/grouping/ignore/ecosystems) | **COMPLETE** | `.github/dependabot.yml` + ci-truth tests + 6 live PRs | Auren |
| Workflow SHA-pinning + least privilege | **COMPLETE** | 6/6 SHA-pinned; permissions audited (verify read-only; release-publish the only contents:write) | Auren |
| Daemon packages routes + spec + SDK | **COMPLETE** | 17-path spec; 5 socket tests; parity toEqual | Auren |
| Coverage ratchets | **COMPLETE** | 116-module baseline; 9th gate; 7 tests | Auren |
| Cross-version upgrade (vN → vN+1) | **COMPLETE** (source path) | `cross-version-upgrade.test.ts` green; LIMITATIONS §2 | Auren |
| Shell completions ×6 | **COMPLETE** (bash measured; 5 marked UNVERIFIED honestly) | dx-surface tests; generators | Auren |
| Verification suite at close | **VERIFIED** | 544/0/43, 9 gates, exit 0, fresh at every boundary | Auren |
| CI on main at close | **VERIFIED** | run for `21234b6`: success (API-measured) | Auren |
| Three-remote parity at close | **VERIFIED** | local = canonical = github = `21234b6` | Auren |
| Release of record (v0.1.13-rc1) | **VERIFIED** | live, 8 assets, production-signed, three-way verified at XXV; unchanged this campaign | Auren |
| npm publication | **BLOCKED — FOUNDER** | registry 404 (name unclaimed); no npm credential in the environment | Founder (packet: `docs/founder/FOUNDER-PACKETS.md` §A) |
| PyPI publication | **BLOCKED — FOUNDER** | registry 404; no PyPI credential | Founder (packet §A) |
| Homebrew tap | **BLOCKED — FOUNDER** | no tap exists; formula authored; a tap is a new public repo under the Founder's account — a P4 decision, packet-ready | Founder (packet §B) |
| winget submission | **EXTERNAL** | manifest authored + version-locked; submission = PR to microsoft/winget-pkgs + Microsoft review | Founder → external |
| Flatpak (Flathub) | **EXTERNAL** | manifest authored + validated; Flathub submission + review | Founder → external |
| Snap | **BLOCKED — FOUNDER** | snapcraft.yaml authored; snapcraft.io account + push + review | Founder → external |
| Chocolatey | **EXTERNAL** | nuspec + scripts authored; community moderation queue | Founder → external |
| Scoop bucket | **BLOCKED — FOUNDER** | manifest authored; a bucket is a new public repo — P4 decision, packet-ready | Founder (packet §B) |
| vaerion.dev (domain + hosted site) | **BLOCKED — FOUNDER** | domain not even registered (NXDOMAIN + RDAP measured); no registrar/hosting credentials | Founder (packet §C) |
| Live provider recordings (F-6) | **BLOCKED — FOUNDER** | no provider credentials in the environment; recorder + failure cassettes ready | Founder (packet §D) |
| Security disclosure channel (R-7) | **BLOCKED — FOUNDER** | private email route live and taught; security.txt awaits the hosted infrastructure | Founder (packet §E) |
| Windows / macOS / distro-spread execution | **EXTERNAL (host-gated)** | no such hosts here; every row named in `docs/ga/PLATFORM-MATRIX.md` | Founder (hosts) / platforms |
| F-2 legal name, F-4 substrate ratification | **FOUNDER** | recorded in LEGAL.md / ADR-0018; unchanged this campaign | Founder |
| Registry/store review timelines | **EXTERNAL** | cannot be executed or measured from here | external platforms |

## 5. The one-line reality

Every engineering item the GA gap named is now closed with measured,
permanently-pinned evidence; the product is consumable, verifiable, and
upgradeable today; and what remains before GA is exactly the Founder's
signature set (publication, credentials, domain, hosts) — packet-ready in
`docs/founder/FOUNDER-PACKETS.md` — plus the external platforms' own
timelines, and nothing else.

*Never claim completion without measurement. Never hide failures. Never convert UNVERIFIED into VERIFIED. Reality first. Evidence always.*
