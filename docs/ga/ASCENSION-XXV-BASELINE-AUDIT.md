# ASCENSION XXV — Baseline Reality Audit

| | |
|---|---|
| **Document** | The Phase XXV baseline: every ASCENSION XXV directive claim re-measured against repository reality before any implementation |
| **Measured at** | Session start, branch `main` @ `4bd5f48` (clean tree) |
| **Law** | LAW 1 — no memory, no summaries, no assumptions. Everything below was executed fresh in this session; the command results are the evidence. |
| **Verdict** | The directive's "CURRENT VERIFIED STATE" is **CONFIRMED with two reality changes** the records did not know about: the GitHub repository is now **PUBLIC** (unblocking branch protection), and the **canonical bare remote no longer exists** (environment reset). Details below. |

## 1. Repository reality (measured)

| Surface | Claim on record | Measured this session | Verdict |
|---|---|---|---|
| Working tree | clean | `git status`: "nothing to commit, working tree clean" on `main` | MATCH |
| HEAD | the Phase XXIV close + worklog | `main` = `4bd5f48` (worklog commit on top of close `d1bbd3f`) | MATCH |
| Tags | 7 tags, `v0.1.12-rc1` of record | 7 tags measured: `v0.1.7-rc1` … `v0.1.12-rc1` | MATCH |
| Tag of record object | annotated `888758a` → commit `485016f` | `git rev-parse`: tag object `888758a144…`, peeled `485016f0c7…`, type `tag` | MATCH |
| Remotes | three-remote parity 0/0 | `canonical` → `/home/z/vaerion-canonical.git` **DOES NOT EXIST** (`fatal: does not appear to be a git repository`); `github` reachable | **DIVERGENCE — see §5** |
| GitHub main | local == github | `git ls-remote github`: `refs/heads/main` = `4bd5f484…` == local HEAD, byte-identical | MATCH |
| GitHub tag of record | byte-identical tag object | ls-remote `refs/tags/v0.1.12-rc1` = `888758a144…` == local tag object | MATCH |
| Version surfaces | register-enforced lockstep at `0.1.12-rc1` | spot-checked `packaging/python/vaerion/__init__.py` = `0.1.12-rc1`; the 18-surface register + negative sweep is CI-enforced (green in §2) | MATCH |
| root `package.json` | `0.1.7-rc2`, deliberately out of register | measured `"version": "0.1.7-rc2"`, `"private": true` — matches the register-scope decision recorded in the version-register test header | MATCH |

## 2. Verification reality (measured fresh, this session)

- **Local gates**: `bun run tools/verify.ts` re-run from a cold start — **ALL GATES GREEN, 523 tests / 41 files / 0 failures, exit 0**. The eight gates (typecheck×2, tests, layerlint 107 files/504 edges, constitutional-check 7 invariants/81 codes, perf-budget, a11y-structural, repo-lint) each printed GREEN.
- The directive's "✅ 523/0 tests locally" is **VERIFIED**, not inherited.

## 3. CI reality (measured via GitHub API, token env-only)

- **20 workflow runs** on record. The six most recent, all `verify`:

| run | ref | head | status / conclusion | when (UTC) |
|---|---|---|---|---|
| 33810311685 | main | `4bd5f48` (current HEAD) | completed / **success** | 2026-09-03T21:53:09Z |
| 33810085726 | main | `d1bbd3f` | completed / **success** | 2026-09-03T21:50:29Z |
| 33805318732 | v0.1.12-rc1 | `485016f` | completed / **success** (verify + signed-release jobs) | 2026-09-03T20:58:13Z |
| 33805316308 | main | `7a1e44f` | completed / **success** | 2026-09-03T20:58:11Z |
| 33720287459 | main | `b6c5fac` | completed / **success** | 2026-09-03T05:46:30Z |
| 33720093555 | main | `e0c43a4` | completed / **success** | 2026-09-03T05:43:53Z |

- **The current local HEAD has already been CI-verified on GitHub infrastructure** (run 33810311685). The release workflow produced the signed artifact set for `v0.1.12-rc1` (run 33805318732), previously verified three ways (sha256 → engine `dist-verify` → openssl).
- Measurement hygiene note: a first `cat` of `.github/workflows/verify.yml` rendered `branches: [main]` as `branches: ain]` (terminal mangling, not file content). The file was re-read with the Read tool and is intact. Recorded as a reminder that even "reading" is an act of measurement that can fail once.

## 4. Security reality (measured; no secret value ever printed)

| Surface | Measured state | Consequence |
|---|---|---|
| GitHub Actions secrets | `GET /actions/secrets` → `total_count: 0` | `RELEASE_SIGNING_KEY` is **not set**; every tag run fails closed to the session-bound bootstrap key, disclosed in the pack report (RISK-LEDGER R-2 / F-3). The ceremony is still open. |
| Branch protection | `GET /branches/main/protection` → HTTP 404 "Branch not protected" | Previously **BLOCKED by plan** (repo was private). Now see §6: the blocker's condition has changed. |
| Repository visibility | API: `"private": false, "visibility": "public"` | **NEW REALITY**: the repo is public. This satisfies the exact condition the API's original 403 named ("Upgrade to GitHub Pro **or make this repository public**"). Branch protection is now **enableable** — a previously BLOCKED item converts to engineering work. |
| Token hygiene | token valid (HTTP 200), scope admin; stored ONLY in `/tmp/.vae_github_tok` (chmod 600, outside the repo), used via `VAE_GITHUB_TOKEN` env | zero tokens in any tracked file, `.git/config`, or commit. Rotation after the campaign remains recommended (the token transited chat in plaintext during provisioning). |
| Key material | `keys/release-signing.pub` tracked (public half only); `.gitignore` line 69 excludes `/keys/*.key` | the private key never enters version control — verified, not assumed |
| CI trust chain | release job consumes `RELEASE_SIGNING_KEY` fail-closed (workflow lines 92–104); pack report discloses bootstrap generation | the fail-closed design is verified in the workflow text that CI itself ran green |

## 5. Infrastructure reality (measured)

| Surface | Measured state |
|---|---|
| Dashboard (the human surface) | Next.js dev server **serving HTTP 200** on the sandbox port; `dev.log` tail shows 200s with only the benign pre-existing `metadataBase` warning |
| Database | single SQLite file `db/custom.db` (Prisma) — local-only |
| Hosting / staging / production | **none exist** — the only substrate is this sandbox. Phase XXVIII will document the environment topology honestly: what is real here (dev), what is named-but-not-provisioned (staging/prod), and what is Founder-gated (hosting procurement) |
| Monitoring / backups / incident response | none in this environment; the incident-response surface exists as documentation (`docs/security/`) — operations tooling is Phase XXVIII scope |
| Canonical remote | the bare mirror `/home/z/vaerion-canonical.git` was **lost with the environment reset** (the `/home/z` listing contains only `my-project` + tooling). The three-remote law's third leg must be re-provisioned before the campaign can claim three-way parity again |

## 6. Reality changes vs. the records (the two the records did not know)

1. **Repository is PUBLIC.** The prior campaign's BLOCKED row — "Branch protection on `main` (owner: Founder, GitHub plan; API 403: *Upgrade to GitHub Pro or make this repository public*)" — has had its escape condition met by an external action nobody recorded. Branch protection converts BLOCKED → **enableable engineering work** in this campaign. The Go/No-Go packet's §5 decision block lists "branch-protection decision" as a precondition; it can now be *closed*, not just decided.
2. **The canonical remote is GONE.** The worklog's final "three-remote parity 0/0" was true when measured and is now un-claimable: two-remote parity (local == GitHub) is what exists. Repair path (lawful, no history rewrite): re-init the bare mirror from the current tree and push `main` + all 7 tags as new refs. Executed in this campaign's first implementation step.

## 7. What Phase XXV does NOT claim

- No publication has occurred (npm/PyPI/Homebrew/registry surfaces remain F-5, Founder + platforms).
- No production key exists yet — the signing ceremony is Phase XXVII scope; until then every release remains bootstrap-keyed and disclosed.
- No Windows/macOS/distro-host verification appeared in this environment; those stay UNVERIFIED with their recorded reasons (REMAINING-REALITY-REPORT §3).
- The two CI runs on `d1bbd3f`/`4bd5f48` verify *gates*, not new campaign work — this audit itself is the first ASCENSION XXV artifact.

## 8. Baseline verdict for the campaign

The directive's starting state is confirmed by fresh measurement: engine complete, CLI complete, 523/0 gates green locally AND on GitHub for the current HEAD, release pipeline verified, documentation universe present, dashboard serving, Public Beta = GO stands on its own recorded evidence.

The campaign therefore opens from a true baseline. The GA gap list remains exactly what the records name — F-2..F-6, the four channel manifests, the named engineering legs — plus the two §6 reality changes (one an unblock to exploit, one a loss to repair). Every phase that follows re-applies LAW 1 to its own slice before touching code.

*Repository reality wins. Constitution wins. Evidence wins.*
