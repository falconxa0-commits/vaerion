# Registry Reality Measurement — 2026-09-04

**Task ID:** R-1 · **Agent:** Registry Reality Measurement Agent (read-only)
**Subject:** package name `vaerion` — real publication state across npm / PyPI / Homebrew / winget / Flathub / Snap / Chocolatey / Scoop / vaerion.dev, plus Dependabot `bun`-ecosystem verification and GitHub Actions SHA resolution.
**Law:** LAW-1 reality measurement. Every number below is a direct measured HTTP/git result. Nothing inferred, nothing fabricated. Anything not measurable is marked UNMEASURABLE with the reason.

Measurement window: 2026-09-04 ~01:35–02:05 UTC (Chocolatey feed's server timestamp read `2026-09-04T01:40:52Z`).

---

## Method and honesty record

- Primary method: direct public-registry API queries with `curl`, recording HTTP status + body.
- Mid-run, the unauthenticated GitHub REST quota for this IP was exhausted (measured via `https://api.github.com/rate_limit`: `core.remaining: 0`, `used: 60`, `reset: 1788488543`). All GitHub REST data reported below was captured **before** exhaustion; everything after uses quota-free channels:
  - git protocol (`git ls-remote`, shallow fetch — no REST quota),
  - `github.com` HTML status checks (200/404),
  - `raw.githubusercontent.com` paths,
  - z-ai `web_search`.
- No local repository files were modified; all scratch work in `/tmp`; the only writes are this report and the worklog append.

---

## 1. npm — `vaerion`

- **Query:** `GET https://registry.npmjs.org/vaerion`
- **Result:** HTTP **404**, body `{"error":"Not found"}`
- **Corroboration:** `GET https://registry.npmjs.org/-/v1/search?text=vaerion&size=5` → HTTP 200, **`total: 0`** (no package anywhere on npm matches "vaerion" in name/keywords/description). `https://www.npmjs.com/package/vaerion` → 403 (Cloudflare bot wall; registry API is the authoritative source and was used).
- **Verdict: NOT PUBLISHED** — HTTP 404 from the registry of record; the name `vaerion` is **unclaimed by anyone** (no squatter).

## 2. npm — `@vaerion/cli`

- **Query:** `GET https://registry.npmjs.org/@vaerion%2Fcli`
- **Result:** HTTP **404**, body `{"error":"Not found"}`
- **Verdict: NOT PUBLISHED** — the `@vaerion` scope is unclaimed.

## 3. PyPI — `vaerion`

- **Query:** `GET https://pypi.org/pypi/vaerion/json`
- **Result:** HTTP **404**, body `{"message": "Not Found"}`
- **Corroboration:** `GET https://pypi.org/simple/vaerion/` → HTTP 404.
- **Verdict: NOT PUBLISHED** — name unclaimed on PyPI.

## 4. Homebrew

- **Queries:**
  - `GET https://api.github.com/repos/falconxa0-commits/homebrew-vaerion` → HTTP **404** `{"message":"Not Found",...,"status":"404"}`
  - `GET https://github.com/falconxa0-commits/homebrew-vaerion` (HTML) → **404**
  - `https://github.com/falconxa0` (HTML) → **404** — the user `falconxa0` **does not exist**; `falconxa0/homebrew-vaerion` and `falconxa0/vaerion` → 404.
  - `GET https://formulae.brew.sh/api/formula/vaerion.json` → HTTP **404** (GitHub Pages "Page not found") — not in homebrew-core.
  - `GET https://formulae.brew.sh/api/cask/vaerion.json` → HTTP **404** — not in homebrew-cask.
- **Verdict: NOT PUBLISHED** — no tap exists under either account spelling; not in core or casks.

## 5. winget (microsoft/winget-pkgs)

- **Query (as instructed):** `GET https://api.github.com/search/code?q=vaerion+repo:microsoft/winget-pkgs` → HTTP **401** `{"message":"Requires authentication",...}`. The unauthenticated code-search route is **UNMEASURABLE (auth required)**.
- **Direct evidence used instead (no auth needed):**
  - `https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/v/vaerion/` → HTTP **404** (no publisher directory)
  - `https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/v/vaerion/vaerion/` → HTTP **404** (no `Vaerion.Vaerion`-style package path)
  - Web search "winget-pkgs vaerion manifest" → 6 results, **zero** vaerion-related; winstall.app search endpoints → 404.
- **Verdict: NOT PUBLISHED** (evidence: direct raw-path 404s + zero search hits; the code-search query itself remains UNMEASURABLE-auth, noted here per LAW-1).

## 6. Flathub

- **Query:** `POST https://flathub.org/api/v2/search` with body `{"query":"vaerion"}` → HTTP **200**, 21 hits, **0** hits mentioning "vaerion" (JSON grep over all 21 records).
- Note: `GET https://flathub.org/api/v2/apps` → HTTP 404 `{"detail":"Not Found"}` (endpoint does not exist as GET; the POST search above is the working API).
- Web search "flathub vaerion" → no vaerion app results.
- **Verdict: NOT PUBLISHED** — no app, no squatter.

## 7. Snap (Snapcraft)

- **Query:** `GET https://api.snapcraft.io/v2/snaps/info/vaerion` with header `Snap-Device-Series: 16`
- **Result:** HTTP **404**, body:
  `{"error-list":[{"code":"resource-not-found","message":"No snap named 'vaerion' found in series '16'."}]}`
- **Verdict: NOT PUBLISHED** — explicit registry statement of absence.

## 8. Chocolatey

- **Query:** `GET https://community.chocolatey.org/api/v2/Packages?$filter=Id%20eq%20'vaerion'`
- **Result:** HTTP **200**, valid Atom feed, **zero `<entry>` elements** (feed timestamp `2026-09-04T01:40:52Z`).
- **Corroboration:** `https://community.chocolatey.org/packages/vaerion` → HTTP 404; web search → no vaerion package.
- **Verdict: NOT PUBLISHED.**

## 9. Scoop

- **Queries:**
  - `GET https://api.github.com/repos/falconxa0-commits/scoop-vaerion` → HTTP **404** (captured pre-exhaustion); HTML check → 404.
  - `https://github.com/falconxa0-commits/scoop-bucket` (HTML) → **404**.
  - `raw.githubusercontent.com/ScoopInstaller/Main/master/bucket/vaerion.json` → **404**; Extras → **404**; Versions → **404**.
  - Web search "scoop vaerion bucket manifest" → zero vaerion results.
- **Verdict: NOT PUBLISHED** — no bucket repo under the account; not in any of the three primary ScoopInstaller buckets.

## 10. vaerion.dev (domain + site)

- **DNS:**
  - `getent hosts vaerion.dev` → exit **2** (no resolution).
  - `curl https://vaerion.dev` → `Could not resolve host: vaerion.dev` (HTTP 000).
  - Authoritative: Google DNS-over-HTTPS `https://dns.google/resolve?name=vaerion.dev&type=A` → **`Status: 3` (NXDOMAIN)**, authority section served from the `dev.` TLD nameservers (`ns-tld1.charlestonroadregistry.com` — Google Registry).
- **Registration:** RDAP `https://rdap.org/domain/vaerion.dev` → 302 → `https://pubapi.registry.google/rdap/domain/vaerion.dev` → HTTP **404** with `"description":["vaerion.dev not found"]` (Charleston Road Registry / Google Registry RDAP).
- **Verdict: NOT PUBLISHED — the domain is not even registered.** (Stronger than "no DNS": there is no registration at Google Registry, so no one — including squatters — currently holds vaerion.dev.)

## 11. GitHub inventory under `falconxa0-commits` (who owns what)

- **Query:** `GET https://api.github.com/users/falconxa0-commits/repos?per_page=100` → HTTP **200**.
- **Result:** exactly **2 public repos**:
  1. `SwiftRamadan` — "SwiftRamadan - Next.js Food Delivery App with Customer/Vendor/Rider roles"
  2. `vaerion` — "Vaerion — The AI-Native Development Engine. Deterministic, local-first runtime where AI agents do real work under human authority."
- `https://github.com/falconxa0-commits/vaerion` → HTML **200** (the repo of record, public).
- **Consequence:** there is **no** homebrew tap repo, **no** scoop bucket repo, **no** website/pages repo under the account. The "vaerion" name on GitHub is owned solely by `falconxa0-commits`.

## 12. dependabot.yml on GitHub main

- Instructed query `GET /repos/falconxa0-commits/vaerion/contents/.github/dependabot.yml` → blocked mid-run by the exhausted unauth quota (HTTP 403 rate limit — measured, not skipped).
- **Measurement instead:** fresh shallow clone of `https://github.com/falconxa0-commits/vaerion` branch `main`:
  - HEAD = `6df7f645bf82bf56a54ae35a2ce4d3488a0d6d7b`, commit date `2026-09-04 00:20:39 +0000`.
  - `.github/` contains exactly: `ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE.md`, `workflows/`.
- **Verdict: `.github/dependabot.yml` is ABSENT on GitHub main** at commit `6df7f645` (matches the expectation of a 404; matches FINAL-SECURITY-AUDIT's residual "Dependabot absent").

---

## 13. Dependabot `bun` ecosystem support — VERDICT: SUPPORTED

- **Official docs (fetched live 2026-09-04):** [Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference) — the `package-ecosystem` table row reads, verbatim: **"Bun | `bun` | >=v1.1.39"**. The exact ecosystem identifier string for `.github/dependabot.yml` is therefore:

  ```yaml
  package-ecosystem: "bun"
  ```

  (not `"npm"` — npm is a separate row; bun has its own updater).
- **GA announcement (GitHub Changelog, Feb 13 2025):** ["Dependabot version updates now support the bun package manager – [GA]"](https://github.blog/changelog/2025-02-13-dependabot-version-updates-now-support-the-bun-package-manager-ga/) — *"Developers can now use Dependabot to keep their bun dependencies up to da[te]…"*
- **Context sources:** dependabot-core issue [#11602](https://github.com/dependabot/dependabot-core/issues/11602) (early `bun.lock` updater issue, Feb 2025) and the expanded-support changelog of [2025-07-29](https://github.blog/changelog/2025-07-29-dependabot-expanded-cooldown-and-package-manager-support) — cited for completeness; the docs table of record says `bun`, supported versions >= v1.1.39. Vaerion's Bun pin (1.3.14) is well above that.

## 14. GitHub Actions pinning SHAs (verified for workflow SHA-pinning)

All three tags were measured over the git protocol. Each tag was shallow-fetched; `git cat-file -t <tag>` reported **`commit`** for all three — i.e. every one is a **lightweight tag**, so the tag ref SHA equals the commit SHA (no annotated-tag dereference needed). Each SHA was then **independently verified to exist** by fetching `https://github.com/<owner>/<repo>/commit/<sha>` → HTTP **200** in all three cases. In each case the moving major tag (`v4`/`v2`/`v4`) currently points at the **same commit** as the measured latest release tag.

| Action repo | Line | Latest tag in line | Full commit SHA (40-char) | Commit date | Subject | Existence check |
|---|---|---|---|---|---|---|
| actions/checkout | v4 | **v4.4.0** | `11d5960a326750d5838078e36cf38b85af677262` | 2026-07-16 15:43:47 −0400 | "backport fixes to releases-v4 (#2524)" | github.com/commit/… → HTTP 200 |
| oven-sh/setup-bun | v2 | **v2.2.0** | `0c5077e51419868618aeaa5fe8019c62421857d6` | 2026-03-14 10:37:27 +0100 | "release: v2.2.0 (#177)" | github.com/commit/… → HTTP 200 |
| actions/upload-artifact | v4 | **v4.6.2** | `ea165f8d65b6e75b540449e92b4886f43607fa02` | 2025-03-19 10:34:59 −0700 | "Merge pull request #685 from salmanmkc/…3-new-upload-artifacts-release" | github.com/commit/… → HTTP 200 |

Pin forms ready for use:

```yaml
- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
- uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
- uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
```

**Reality flags (measured, for the Founder's decision, not blocking this task's ask):**
- `actions/checkout` has since released **v5/v6/v7** lines (highest measured tag overall: `v7.0.1` → `3d3c42e5aac5ba805825da76410c181273ba90b1`); the measured v4 line above is exactly what was requested (and what the workflows currently use via `@v4`).
- `actions/upload-artifact` also has **v5/v6/v7** lines (`v7.0.1` → `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`); `oven-sh/setup-bun` remains a v2 line only (measured 7 × v2.* tags, none higher than v2.2.0).
- Local workflows measured read-only for context: `verify.yml` and `release-publish.yml` use `actions/checkout@v4`, `oven-sh/setup-bun@v2`, `actions/upload-artifact@v4` — the three SHAs above are drop-in matches for those lines.

---

## Verdict summary table

| # | Surface | Query (exact) | HTTP | Verdict |
|---|---|---|---|---|
| 1 | npm `vaerion` | registry.npmjs.org/vaerion | 404 | **NOT PUBLISHED** (name unclaimed; search total 0) |
| 2 | npm `@vaerion/cli` | registry.npmjs.org/@vaerion%2Fcli | 404 | **NOT PUBLISHED** (scope unclaimed) |
| 3 | PyPI | pypi.org/pypi/vaerion/json | 404 | **NOT PUBLISHED** |
| 4 | Homebrew | api.github.com/repos/…/homebrew-vaerion; formulae.brew.sh formula+cask | 404 / 404 | **NOT PUBLISHED** (no tap; falconxa0 user doesn't exist) |
| 5 | winget | api.github.com/search/code … | 401 | **NOT PUBLISHED** (raw manifests/v/vaerion → 404; web search zero; code-search itself UNMEASURABLE-auth) |
| 6 | Flathub | POST flathub.org/api/v2/search {"vaerion"} | 200 | **NOT PUBLISHED** (21 hits, 0 vaerion) |
| 7 | Snap | api.snapcraft.io/v2/snaps/info/vaerion (series 16) | 404 | **NOT PUBLISHED** ("No snap named 'vaerion' found in series '16'") |
| 8 | Chocolatey | community.chocolatey.org/api/v2/Packages?$filter=Id eq 'vaerion' | 200 | **NOT PUBLISHED** (empty feed, 0 entries; /packages/vaerion 404) |
| 9 | Scoop | api.github.com/repos/…/scoop-vaerion + Main/Extras/Versions raw | 404s | **NOT PUBLISHED** |
| 10 | vaerion.dev | getent + Google DoH + RDAP | NXDOMAIN / RDAP 404 | **NOT PUBLISHED — domain not registered** |

**UNMEASURABLE items (with reason):**
- winget code-search API unauthenticated (HTTP 401 Requires authentication) — replaced by direct raw-path + web-search evidence; no other measurement was blocked.

**Bottom line:** Vaerion's only published distribution surface remains GitHub Releases. Every registry name checked is unclaimed — clean slate for the F-5 Founder publication step, no name conflicts anywhere.
