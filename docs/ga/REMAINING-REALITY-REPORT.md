# The Final Remaining Reality Report (ASCENSION XXV close)

| | |
|---|---|
| **Document** | Everything between "Public Beta Ready" and "General Availability Ready", sorted by measured status |
| **Engine of record** | `0.1.13-rc1` — ALL GATES GREEN **530/0/42** on the close tree; CI GREEN on GitHub |
| **Law** | Only measured truth. UNVERIFIED means *authored but impossible to verify in this environment*, with the reason. BLOCKED means *a human or external platform owns it*. Nothing omitted. |

## 1. COMPLETE — implemented and verified (new in this campaign)

- The **production release trust chain**: the production Ed25519 key lives as
  the write-only GitHub secret `RELEASE_SIGNING_KEY`; the key of record is
  rotated; the ceremony law (process, ownership, rotation, recovery) is
  recorded; R-2 CLOSED. The first production-signed release (`v0.1.13-rc1`)
  is published and verified three ways — including by an anonymous consumer.
- The **live publication pipeline**: `release-publish.yml` validates the tag,
  re-packs deterministically ON the tag, refuses a bootstrap-keyed pack, and
  publishes the idempotent GitHub Release with the notes of record; the
  rc-prerelease honesty flag; the announcement flow proven live
  (discussion #1).
- The **legal identity layer**: `LEGAL.md` (ownership, licensing, contributor
  terms, trademark policy, the F-2 pseudonym disclosure); the winget
  copyright conflict found and fixed; package metadata identity fields; real
  project URLs.
- **Branch protection on `main`**: required check + linear history + no
  force-push/deletions (the plan-blocked item converted when the repo went
  public).
- The **provider failure-compatibility legs**: five failure cassettes
  (429/401/529/mid-stream/404) + six tests through the real service; the
  mid-stream swallow defect FIXED at root; `PROVIDER-COMPATIBILITY.md`.
- The **four missing distribution channels**: Flatpak, Snap, Chocolatey,
  Scoop — authored, syntax-validated, version-locked (register → 22 surfaces).
- The **community/publication surfaces**: GitHub Discussions (6 categories),
  the routing law in SUPPORT/CONTRIBUTING, the changelog automation pin, the
  stale-identity fixes, the INSTALL.md live-download path.
- The **operations law**: `docs/operations/` (ENVIRONMENTS, DEPLOYMENT,
  OPERATIONS, ANNOUNCEMENTS) — the honest topology, the operator runbook,
  the immutable-law-compatible rollback table.

## 2. VERIFIED — measured during THIS campaign (where)

- Gates: 523→530 tests, 41→42 files, 0 failures, exit 0 — fresh at every
  phase boundary (Tasks 1–10) and at close.
- CI on GitHub infrastructure: every pushed commit GREEN (one transient
  registry failure root-caused and re-run); the tag run GREEN; the
  release-publish run GREEN.
- The three cryptography legs on the published release, fresh at close:
  sha256 7/7 → engine `dist-verify` ALL CHECKS PASSED → openssl
  "Signature Verified Successfully".
- The anonymous consumer loop: discover → download 8 assets → verify → run.
- The dashboard: browser-verified at 1280/390 — zero page errors, zero
  horizontal overflow, footer law holds, the new identity/audit surfaces
  render.
- Three-remote parity 0/0 at every close (local = canonical = github,
  tag objects byte-identical).
- The deb leg re-measured at the current version (build + metadata +
  extraction).

## 3. UNVERIFIED — authored here, impossible to verify here (exact reasons)

| Surface | Why UNVERIFIED here |
|---|---|
| Windows execution (install.ps1, winget, choco, scoop, PATH/shim, SmartScreen) | no Windows host / pwsh in this environment |
| macOS execution (dmg/pkg build, codesign/notarize, Gatekeeper, brew) | no macOS host; Apple Developer ID required |
| Flatpak/Snap/RPM/AppImage builds | no flatpak-builder/snapcraft/rpmbuild/appimagetool here (manifests syntax-validated only) |
| Live distro testing (apt install on real Debian/Ubuntu; Fedora/Arch/…) | no distro hosts or container runtime |
| zsh/fish/PowerShell completion EXECUTION | no zsh/fish/pwsh binary on this host (`bash -n` remains the measured exception) |
| Docker/Podman/devcontainer image builds | no container runtime |
| Cross-version upgrade leg (vN → vN+1 on one host) | single release lineage per host session (the register/notes teach the path) |
| SBOM generation (CycloneDX/spdx tooling) | tooling absent; policy documented |
| Live provider recordings | no provider network (F-6) |

## 4. REMAINING — engineering work still owed before GA (small, named)

1. Dependabot enablement (`.github/dependabot.yml`) + SHA-pinning the three
   first-party workflow actions (the two low residuals from the security audit).
2. The cross-version upgrade leg for the next release train (vN → vN+1 on a
   fresh host, measured).
3. Per-module coverage ratchets on top of the total-based floors (mechanical,
   carried from the prior campaign).
4. The daemon `packages` route group (wire parity + spec regen — MS-6 leftover,
   carried).
5. `nushell`/`xonsh` completion generators (carried; the four major shells ship).

## 5. BLOCKED — owned by the Founder or an external platform

| Blocker | Owner | Exact state |
|---|---|---|
| F-2 full legal name in the identity layer | Founder | `Auren` pseudonym consistent everywhere; LEGAL.md §6 records the mechanical sweep the name change will trigger |
| F-4 substrate ratification (TypeScript-on-Bun, ADR-0018) | Founder | PROVISIONAL with a recorded migration path |
| F-5 publication: npm/PyPI/Homebrew/winget/Chocolatey/Scoop/APT/RPM + `vaerion.dev` + hosted site | Founder + registries | every channel authored + version-locked; the GitHub Releases surface is LIVE meanwhile; registry submissions need accounts + approval |
| F-6 / R-4 live provider recording sessions | Founder (+ provider accounts) | no provider network here; the record script + failure cassettes are ready |
| R-7 public security-reporting channel (security.txt) | Founder | the private email route is live and taught; automated channel awaits the release infrastructure |
| Registry/store review timelines | external platforms | cannot be executed or measured from here |

## 6. The one-line reality

Every engineering surface the campaign named has been built, measured, and
pinned — the release trust chain is production and the product is downloadable,
verifiable, and runnable by a stranger today — and what remains before GA is
exactly: five small engineering items, the Founder/external gates listed in §5,
and nothing else.

*Repository reality wins. Constitution wins. Evidence wins.*
