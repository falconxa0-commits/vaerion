# Vaerion Environments — the honest topology

| | |
|---|---|
| **Document** | What actually exists, what each environment is for, and what is deliberately not provisioned yet |
| **Law** | Nothing here is aspirational dressed as real; every "not provisioned" is named with its owner |

## 1. The substrate truth

Vaerion is a **local-first** engine: the product runs on the *user's* machine.
There is no server-side Vaerion to operate — no database cluster, no API fleet.
"Production infrastructure" therefore means four real things:

1. the **CI substrate** that verifies every change (GitHub Actions),
2. the **release pipeline** that packs, signs, and publishes artifacts
   (`verify.yml` + `release-publish.yml`),
3. the **distribution surface** where consumers get those artifacts
   (GitHub Releases; registries pending F-5),
4. the **human surface** (the status dashboard) and the **trust surfaces**
   (this repository, the three-remote mirror).

Everything else that a hosted product would need is either owned by the user
(their model-provider keys, via the OS keychain) or does not exist by design.

## 2. The environments

| Environment | What it is | Substrate | Status |
|---|---|---|---|
| **Development** | The working repository + the status dashboard in dev mode | the campaign sandbox (`/home/z/my-project`, dev server on the sandbox port, SQLite `db/custom.db`) | live; the only writable substrate in this environment |
| **Staging** | Every push to `main`, verified on real infrastructure before anything ships | GitHub Actions (`verify.yml`): 8 gates, pinned Bun 1.3.14, frozen lockfile | live and measured — 20+ runs, step-level GREEN history |
| **Production (artifacts)** | Signed release artifacts + GitHub Releases, published by the per-tag pipeline | GitHub Releases via `release-publish.yml`; artifacts packed deterministically on the tag | live; first production-signed release `v0.1.13-rc1` (measured, three-way verified) |
| **Production (registries)** | npm / PyPI / Homebrew / winget / Chocolatey / Scoop / APT / RPM channels | external registries | **NOT PROVISIONED — Founder-gated (F-5)**: needs registry accounts, the publication decision, and platform review timelines |
| **Production (website)** | `vaerion.dev` — the hosted human surface | external hosting | **NOT PROVISIONED — Founder-gated (F-5)**; the repository page + README + the sandbox dashboard carry the role meanwhile |

## 3. Why there is no "staging server"

A staging environment exists to rehearse exactly the risks production will
face. For a local-first engine those risks are: *does the artifact install on
a fresh machine, does verification pass, does the engine run hermetically*.
The rehearsal surface for that is the **Empty Machine Test** (fresh-host
install journeys, measured since ASCENSION XX) plus CI's frozen-lockfile
install — not a long-lived server. Adding one would be infrastructure theater,
not risk reduction; if the project later grows a hosted daemon surface, the
staging tier gets designed then, under an ADR.

## 4. Secrets per environment

| Environment | Secret | Where it lives |
|---|---|---|
| CI (staging + release) | `RELEASE_SIGNING_KEY` (Ed25519 PKCS8) | GitHub Actions secrets, sealed-box encrypted; write-only (see `docs/security/SIGNING-CEREMONY.md`) |
| User machines | model-provider keys | the user's OS keychain, resolved by the broker; never enter journals/receipts/bundles (ADR-0013) |
| Repository | GitHub token (administrative) | env-only, never in files; rotated after campaigns |

## 5. The one-line reality

Development is this sandbox, staging is every push on GitHub's infrastructure,
production is the signed artifact set on GitHub Releases — everything beyond
that is F-5, owned by the Founder, and honestly labeled.
