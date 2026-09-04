# Platform Support Matrix — SUPPORTED / UNVERIFIED / UNSUPPORTED, with evidence

| | |
|---|---|
| **Document** | The platform compatibility record of record — nothing here is assumed, faked, or aspirational |
| **Law** | SUPPORTED = executed and verified in this repository's own records (citing where). UNVERIFIED = authored and version-locked, but never executed by a real host (the host is named). UNSUPPORTED = deliberately out of scope. Never fake support. |
| **Version of record** | `0.1.13-rc1` — the matrix was re-measured at this version (ASCENSION XXV Phase XXXII) |

## 1. Linux (the host this repository verifies on)

| Channel | Install | Run | Remove | Status + evidence |
|---|---|---|---|---|
| From source (bun) | ✅ | ✅ | ✅ | **SUPPORTED** — the repository's own verification path; Empty Machine Test legs + every CI run |
| npm package | ✅ | ✅ | ✅ | **SUPPORTED** — tarball built, `npm install -g --prefix` install + `vae version` + E1600 exit-2 + uninstall measured (ecosystem-journeys pins) |
| Universal installer (`install.sh`) | ✅ | ✅ | ✅ | **SUPPORTED** — install/update/uninstall end-to-end from the signed release tarball (Empty Machine Test); offline `--tarball` mode |
| Debian `.deb` | ✅ (build + extraction) | metadata | — | **SUPPORTED (build/extraction)** — freshly re-measured at 0.1.13-rc1 this phase: `dpkg-deb --info` (Version `0.1.13~rc1`, Maintainer `Auren <auren@vaerion.dev>`) + `-x` extraction (vae executable + engine present); actual `apt install` on a live Debian/Ubuntu needs a distro host |
| GitHub Releases tarball (signed) | ✅ | ✅ | — | **SUPPORTED** — anonymous download → three-leg verification → `vae 0.1.13-rc1` runs (measured end-to-end, ASCENSION XXV) |
| RPM (`.spec`) | authored | — | — | **UNVERIFIED — RPM** (no rpmbuild in this environment; version-locked in the register) |
| AppImage | authored | — | — | **UNVERIFIED — APPIMAGE** (AppDir assembly verified; final step needs `appimagetool`) |
| Flatpak | authored | — | — | **UNVERIFIED — FLATPAK** (manifest syntax-validated; needs `flatpak-builder`) |
| Snap | authored | — | — | **UNVERIFIED — SNAP** (manifest syntax-validated; needs `snapcraft`) |

**Distro spread (Ubuntu / Debian / Fedora / Arch / openSUSE / Rocky / Alpine / Amazon Linux):** UNVERIFIED as *execution environments* — no distro hosts or container runtime here. The deb leg's build/extraction evidence is distro-family-relevant (Debian/Ubuntu); rpm-class distros map to the UNVERIFIED RPM row. No distro is claimed as tested.

## 2. Windows

| Surface | Status + evidence |
|---|---|
| `install.ps1` (portable layout, user PATH, `--Update`/`--Uninstall`) | **UNVERIFIED — WINDOWS** — authored on Linux, pwsh unavailable here (syntax-reviewed); the uninstall law mirrors the measured deb/install.sh removal semantics |
| winget manifests (three-file set) | **UNVERIFIED — WINGET** — authored + version-locked; submission is F-5 (Founder) + Microsoft review |
| Chocolatey package | **UNVERIFIED — CHOCOLATEY** — authored + XML/syntax-validated; community-repo moderation is external |
| Scoop manifest | **UNVERIFIED — SCOOP** — authored + JSON-validated; the bucket itself is a publication step (F-5) |
| MSI/EXE native installers | **UNSUPPORTED (deliberately)** — the portable zip + script layout is the Windows story of record; native installers would add a second trust surface with no measured need (recorded as a design decision, not a gap) |
| SmartScreen / Defender posture | **UNVERIFIED** — needs real Windows execution; code-signing prep is gated on an Authenticode certificate (Founder acquisition) |

## 3. macOS

| Surface | Status + evidence |
|---|---|
| `.dmg` recipe (`make-dmg.sh`) | **UNVERIFIED — MACOS** — authored; needs `hdiutil` on a real macOS host |
| `.pkg` recipe (`make-pkg.sh`) | **UNVERIFIED — MACOS** — authored; needs `pkgbuild` |
| Codesign / notarization | **UNVERIFIED** — prep runbook exists (`packaging/macos/SIGNING-PREP.md`); requires an Apple Developer ID (Founder acquisition) |
| Gatekeeper / Finder / LaunchServices behavior | **UNVERIFIED** — host-gated, honestly labeled |
| Homebrew formula | **UNVERIFIED — BREW** — authored + reviewed; `url`/`sha256` fill from SHA256SUMS at the release train |

## 4. Cross-cutting platform facts (measured)

| Fact | Evidence |
|---|---|
| The engine is substrate-pinned: TypeScript on Bun (ADR-0018, PROVISIONAL — F-4) | the gates run on pinned Bun 1.3.14 locally and in CI |
| Node.js is NOT the substrate | the npm launcher refuses the wrong runtime (E1600, exit 2 — pinned); Python is a delivery channel, not a substrate (console script execs Bun) |
| The engine is hermetic at rest | no telemetry (constitutional C1/C6), no undeclared network primitives, secrets via the OS keychain (ADR-0013) |
| Filesystem behavior: workspaces live under the user's tree | `.vaerion/` layout taught in `docs/CLI.md`; symlink/permissions edge cases exercised in the installer journeys |
| Unicode/no-color/no-TTY terminals | the renderer honors NO_COLOR/TERM=dumb/CI/isTTY/VAE_UI — pinned by tests; ASCII fallback for decorative frames |

## 5. The one-line reality

Linux-ecosystem support is measured (and the current version's deb leg re-measured this phase); Windows/macOS/other-distro execution remains honestly UNVERIFIED behind named hosts and Founder-gated tooling — every claim in this matrix cites its evidence, and every UNVERIFIED row names exactly what would prove it.

*Repository reality wins. Constitution wins. Evidence wins.*
