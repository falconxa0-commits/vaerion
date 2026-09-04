# Distribution Report — the GA certification summary

| | |
|---|---|
| **Document** | The measured distribution state at GA candidacy. Full detail: `docs/ga/PLATFORM-MATRIX.md` (per-platform, cited evidence) and `packaging/README.md`. |
| **Version of record** | `0.1.13-rc1` — the version register locks **22 surfaces** |

## The channel picture

| Channel | Artifact | Status |
|---|---|---|
| **GitHub Releases** (the live download surface) | signed tarball + bundle + manifest/sig + checksums + VERIFY.md + pack report | **LIVE and certified** — anonymous consumer loop measured end-to-end |
| Source (bun) | the repository | **SUPPORTED** — the repository's own verification path |
| npm (`vae` bin) | `packaging/npm/package.json` | build + local install **verified**; registry publish = F-5 |
| PyPI (wheel) | `packaging/python/` | build + venv install **verified**; publish = F-5 |
| Universal installer | `packaging/install.sh` | install/update/uninstall **verified**; the `vaerion.dev` URL = F-5 |
| Debian | `packaging/linux/make-deb.sh` | build + metadata + extraction **verified** (re-measured at 0.1.13-rc1) |
| Homebrew | `packaging/homebrew/vaerion.rb` | authored + version-locked; **UNVERIFIED — BREW** |
| RPM / AppImage | `vaerion.spec` / `make-appimage.sh` | authored + version-locked; **UNVERIFIED** (host tools) |
| **Flatpak** | `packaging/linux/flatpak/dev.vaerion.Vaerion.yml` | authored + YAML-validated + register-locked; **UNVERIFIED — FLATPAK** |
| **Snap** | `packaging/linux/snap/snapcraft.yaml` | authored + YAML-validated + register-locked; **UNVERIFIED — SNAP** |
| winget | `packaging/windows/winget/` (3-file set) | authored + register-locked; **UNVERIFIED — WINGET**; submission = F-5 |
| **Chocolatey** | `packaging/windows/chocolatey/` | authored + XML-validated + register-locked; **UNVERIFIED — CHOCOLATEY** |
| **Scoop** | `packaging/windows/scoop/vaerion.json` | authored + JSON-validated + register-locked; **UNVERIFIED — SCOOP** |
| macOS (dmg/pkg) | `packaging/macos/` | authored + register-locked; **UNVERIFIED — MACOS**; signing prep recorded |

## The lockstep law

All 22 version-bearing surfaces (every channel above + the engine/SDK/tools
packages + the generated OpenAPI + the packaging README) are pinned by the
version-register test — a stale or drifted surface **fails CI**. The four
Phase XXXI channels joined the register this campaign.

## The honest bottom line

A stranger can download, verify, and run Vaerion today from the public
releases page. Every other channel is authored, version-locked, and honestly
labeled until its host executes it or its registry submission (F-5) lands —
support is never faked.

*Repository reality wins. Constitution wins. Evidence wins.*
