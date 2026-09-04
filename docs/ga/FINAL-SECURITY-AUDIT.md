# The Final GA Security Audit (ASCENSION XXV, Phase XXXIII)

| | |
|---|---|
| **Document** | The measured security posture at GA candidacy: supply chain, repository, and release audits — findings, residuals, and the honest risk picture |
| **Method** | Every claim below was measured fresh in this campaign (worklog Tasks 1–8); where a residual exists it is named with its owner and its risk |
| **Version of record** | `0.1.13-rc1` (the first production-signed release) |

## 1. Supply chain audit

| Check | Result | Evidence |
|---|---|---|
| Lockfile integrity coverage | **PASS** — every registry dependency pinned by version + sha512 integrity; ~1,039 pinned entries, 948 direct integrity hashes (deduplicated peers resolve through their parent's pin) | `bun.lock` audit, this phase |
| Non-registry dependency sources | **PASS — NONE** — every source is registry.npmjs.com or a workspace link; no git/file/http dependencies | same audit |
| Frozen install | **PASS** — CI installs `--frozen-lockfile` (supply-chain law, workflow-pinned); a lock drift fails the install step, as measured live (Task 3: the transient registry failure surfaced there, not as silent drift) | `.github/workflows/verify.yml` + run logs |
| Published-package dependency surface | **PASS** — the npm artifact depends on exactly three permissively-licensed packages (ajv, hash-wasm, yaml); the engine bundles no runtime dependency tree | `packaging/npm/package.json` |
| CI substrate pinning | **PASS** — Bun pinned to 1.3.14 in every workflow (the verified substrate, ADR-0018) | workflow files |
| Automated vulnerability monitoring | **CLOSED (ASCENSION XXVI+, `61a6dd0`)** — `.github/dependabot.yml` live across bun / github-actions / pip (weekly, minor+patch grouped, majors excluded from bot rides); proven in production by its first sweep (6 PRs, one group PR with 51 updates) | this audit + ci-truth tests |

## 2. Repository audit

| Check | Result | Evidence |
|---|---|---|
| Secret-material sweep (tracked tree) | **PASS** — the only pattern hits are the redaction test vectors (`[REDACTED:github_token]` literals in tests, C5-allow-listed); no real token material | `git grep` sweep, this phase |
| Secret sweep (recent history) | **PASS** — the last 30 commits' trees carry no token patterns | `git log` + `git grep` sweep |
| Git configuration | **PASS** — zero credential/token entries in `.git/config`; campaign tokens used env-only from outside the repository (chmod 600 temp files) | `git config --local --list` |
| Private key hygiene | **PASS** — `/keys/*.key` gitignored; only the public half is tracked; the production signing key exists ONLY as a GitHub secret (write-only); the ceremony's local copy was destroyed (verified absent) | `.gitignore:69`, `SIGNING-CEREMONY.md` §2 |
| Branch protection | **PASS (live)** — `main` protected: required status check `verification (all gates)` (PR merges), required linear history, force-pushes disabled, deletions disabled; **recorded residual**: administrators retain bypass (solo-maintainer direct-push law — stated in the baseline audit §6) | GitHub API `GET …/protection` → 200, Task 3 |
| Workflow least privilege | **PASS** — `verify.yml` runs with `contents: read` (uploads via the runtime token); `release-publish.yml` is the ONLY `contents: write` workflow, justified by its publish function, hardened with tag-input validation and the bootstrap-key publish refusal | workflow files, Tasks 3–4 |
| Action pinning | **CLOSED (ASCENSION XXVI+, `61a6dd0`)** — all 6 `uses:` across both workflows pinned to full commit SHAs with tag annotations (each SHA re-verified via the commits API); the floating-tag class now FAILS the suite by contract test | workflow files + ci-truth tests |
| Secrets inventory | **PASS** — exactly one Actions secret (`RELEASE_SIGNING_KEY`); no repository/user secrets exist | GitHub API secrets list (names only) |

## 3. Release audit

| Check | Result | Evidence |
|---|---|---|
| Reproducibility | **PASS** — the tarball is built twice and byte-compared on every pack (`proven: true` in the CI pack report); the publish pipeline re-packs ON the tag so the published bytes equal the verified bytes | `dist-report.json` of the live release |
| Provenance | **PASS** — the chain is: annotated tag of record → CI run on that tag → pack report pinning the exact commit (`6ebcc0d`) → Release assets carrying the pack report | Task 3 measurements |
| Signature trust | **PASS** — production Ed25519 key (ceremony: `SIGNING-CEREMONY.md`); the key of record ships inside every artifact set (manifest-bound); the pack-report bootstrap-disclosure tripwire is INVERTED into a publish refusal (`release-publish.yml` refuses a bootstrap-keyed pack) | Task 3–4 |
| Consumer verification | **PASS — three legs** on the published release: `sha256sum --check` 7/7 → engine `dist-verify` ALL CHECKS PASSED (from the shipped tarball, no repository) → independent openssl "Signature Verified Successfully" | Tasks 3–4, both tokened and anonymous passes |
| Anonymous consumer loop | **PASS** — a stranger (no credentials) discovered → downloaded all 8 assets → verified (3 legs) → ran `vae 0.1.13-rc1` | Task 4 |
| Release-channel honesty | **PASS** — rc tags carry the GitHub prerelease flag; the RELEASE-NOTES not-claimed list is published as the Release body | Task 4 |
| Registry publication | **NOT YET (F-5)** — no npm/PyPI/Homebrew/… publication has occurred; the trust chain lives entirely on GitHub Releases | by design until the Founder's publication step |

## 4. The risk ledger snapshot (honest carry)

| Risk | Status at this audit |
|---|---|
| R-1 exec sandbox (OS-level profiles per platform) | Open — engineering, post-rc hardening |
| **R-2 release signing (bootstrap key)** | **CLOSED this campaign** — production key live; ceremony law recorded; residual: in-session generation (not air-gapped), labeled |
| R-3 per-process breaker state | Open — engineering |
| R-4 real-provider cassettes (live recordings) | Open — Founder-gated (F-6); the synthetic failure-leg cassettes now pin the wire compat meanwhile |
| R-5 SSE replay cursor auth | Open — engineering |
| R-6 `vaerion.lock` upgrade path | Open — engineering (documented re-seal flow) |
| R-7 public security-reporting channel | Open — Founder-gated (private email route is live and taught in SECURITY.md) |
| **Branch protection (was plan-blocked)** | **CLOSED this campaign** — the repo went public, protection enabled and GET-verified |
| Dependabot / SHA-pinned actions | CLOSED (ASCENSION XXVI+) — see §1–2 |

## 5. Verdict

The supply chain is pinned and frozen; the repository carries no secret
material; the release trust chain is production-keyed, reproducible,
provenance-complete, and verified three ways — including by an anonymous
consumer. The remaining security work is named and owned: two low residuals
(both CLOSED by ASCENSION XXVI+), the engineering-open risk rows (R-1, R-3,
R-5, R-6), and the Founder-gated items (R-4/F-6 recordings, R-7 channel,
F-5 publication). Nothing hidden, nothing dressed.

*Repository reality wins. Constitution wins. Evidence wins.*
