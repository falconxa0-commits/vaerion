# The Founder Packets — ready for signature (ASCENSION XXVI+ close)

| | |
|---|---|
| **Document** | Every Founder-owned decision, packet-ready. Nothing here is executed without the Founder's written act (P4: automation proposes; humans dispose). |
| **Inputs of record** | `docs/ga/REGISTRY-STATE-MEASUREMENT-2026-09-04.md` (the registry reality) · `docs/ga/ASCENSION-XXVI-COMPLETION-REPORT.md` (the engineering close) · `LEGAL.md` · `docs/security/SIGNING-CEREMONY.md` · `packaging/README.md` (the verification matrix) |

## §A — Publication checklist (npm + PyPI)

Measured state: `npm` 404 for `vaerion` and `@vaerion/cli` (both names
unclaimed); `PyPI` 404 (`/pypi/vaerion/json`, `/simple/vaerion/`).
Everything needed to publish is authored and version-locked
(`packaging/npm/`, `packaging/python/` — 22 register surfaces, CI-locked
lockstep).

Steps awaiting the Founder (only you can hold the credentials):

1. [ ] npm: create/authorize an npm account under the project identity; `npm publish` needs a granular token. **Provide the token as a GitHub secret** (`NPM_TOKEN`) and the publish step can be added to `release-publish.yml` for the next train — or publish manually per the checklist in `packaging/npm/README.md`.
2. [ ] PyPI: create the project account; upload the built wheel (the wheel was built and its install verified offline — `docs/LIMITATIONS.md` §2). A trusted-publisher (OIDC) binding to this repo's release workflow is the recommended no-token path.
3. [ ] Decide the release-train cadence: the daemon `packages` route group + the new event type are on `main`, CI-green, and ship with the next train (`v0.1.14-rc1`) — say the word and the train flow of record runs (bump → notes → tag → publish dispatch → three-way verification).

## §B — Registry submission packet (Homebrew tap + Scoop bucket)

Measured state: no `homebrew-vaerion` tap exists anywhere (API + HTML 404);
no Scoop bucket exists (`scoop-vaerion` / `scoop-bucket` 404; Main/Extras/
Versions raw 404). Both channels are **just public git repos** — but both
are NEW PUBLIC REPOS under the Founder's GitHub account, which is a P4
decision this campaign did not invent.

- [ ] Homebrew: authorize creation of `falconxa0-commits/homebrew-vaerion` containing `Formula/vaerion.rb` (authored, `packaging/homebrew/`). The formula builds from the released source tarball with checksums pinned at the release train — the same law every channel follows.
- [ ] Scoop: authorize creation of `falconxa0-commits/scoop-bucket` containing `bucket/vaerion.json` (authored, `packaging/windows/scoop/`; checkver/autoupdate on the Releases API).
- [ ] winget / Chocolatey / Flathub / Snap: the manifests are authored and validated (`packaging/`), but submission goes to EXTERNAL reviewers (microsoft/winget-pkgs PR, chocolatey-community, Flathub, snapcraft.io) under accounts only the Founder can create. The submission packets are the authored manifests themselves + `packaging/README.md`'s verification matrix.

## §C — Website & domain packet (vaerion.dev)

Measured state: **the domain is not even registered** (NXDOMAIN via the
.dev TLD authority + RDAP 404 — measured, not assumed). No registrar or
hosting credentials exist in the build environment.

- [ ] Register `vaerion.dev` (a registrar account is Founder-only; .dev requires HTTPS — GitHub Pages serves it).
- [ ] Choose hosting: the sandbox dashboard + `docs/` can publish to GitHub Pages from this repo with zero new infrastructure; or any static host. The landing page of record remains the public repo + Releases until the domain goes live (measured live at ASCENSION XXV Phase XXIX).
- [ ] After DNS: `security.txt` (R-7) provisions on the hosted domain per `docs/security/` — closing the last disclosure-channel gap.

## §D — Provider onboarding packet (live recordings, F-6 / R-4)

Measured state: no provider credentials exist in the build environment;
every shipping provider is pinned on BOTH wire legs by cassettes built from
the documented wire formats (success + failure: 429/401/529/mid-stream/404)
through the REAL adapters (`docs/ga/PROVIDER-COMPATIBILITY.md`).

- [ ] Provide one sanctioned recording session per adapter (OpenAI, Anthropic, Gemini, Ollama) with real credentials — the recorder of record (`record-cassettes.ts`) is ready; recordings become cassettes through the bless path with the diff reviewed.
- [ ] Or rule live recordings out of GA scope in writing — the synthetic-cassette disclosure stays honest either way.

## §E — Security disclosure packet (R-7)

Measured state: the private email reporting route is live and taught
(`SECURITY.md`); the automated public channel awaits the hosted
infrastructure (§C).

- [ ] Sign off the disclosure policy of record (or amend it) — `SECURITY.md` + `docs/security/THREAT-MODEL.md` + `MITIGATIONS.md` are the documents awaiting the Founder's eye.
- [ ] After the domain: enable security.txt + the private-vulnerability-reporting toggle on GitHub (Settings → Security → Private vulnerability reporting — one click, Founder-only).

## The signature line

The engineering side of GA is complete and measured
(`docs/ga/ASCENSION-XXVI-COMPLETION-REPORT.md`). Every item above is a
Founder act by constitutional design. Sign (or delegate in writing) per
packet, and the corresponding surfaces publish lawfully — never before.

**Founder decision: ☐ GO per packet §__ ☐ AMENDED ☐ DEFERRED**
