# Vaerion Packaging & Distribution (ASCENSION XVIII — Phase 1)

One engine, one `vae` entrypoint, one exit-code contract — delivered
through every major channel. Nothing here introduces a second CLI surface:
every launcher resolves the engine's own `main()` (`src/cli/vae.ts`) and
hands argv over unchanged.

## Layout

| Path | Channel | Notes |
|---|---|---|
| `install.sh` | Universal installer | OS/arch detection, PATH markers, `--update`, `--uninstall`, offline `--tarball` mode |
| `npm/` | npm (`vae` bin) | `make-package.sh` assembles the engine + `npm pack`; launcher refuses the wrong runtime (exit 2) |
| `python/` | PyPI (`vae` console script) | Python is the delivery channel, not the substrate; exec's Bun with the packaged engine |
| `homebrew/vaerion.rb` | Homebrew formula | url/sha256 filled from SHA256SUMS at release time |
| `windows/` | winget manifests + `install.ps1` | portable layout, user-scope PATH, clean uninstall |
| `windows/chocolatey/` | Chocolatey nuspec + install/uninstall scripts | installs the same release zip as winget; version maps to the choco revision form (0.1.13-rc1 → 0.1.13.1) |
| `windows/scoop/` | Scoop bucket manifest (JSON) | same release zip; `checkver`/`autoupdate` read the GitHub Releases API |
| `macos/` | `.dmg` + `.pkg` recipes, `SIGNING-PREP.md` | Developer ID / notarization runbook gated on the key ceremony |
| `linux/` | `make-deb.sh`, `vaerion.spec`, `make-appimage.sh` | deb verified via `dpkg-deb`; rpm/AppImage need their host tools |
| `linux/flatpak/` | Flatpak manifest (`dev.vaerion.Vaerion`) | strict-ish finish-args (home + network only); Bun substrate as extra-data, checksum pinned at the release train |
| `linux/snap/` | snapcraft manifest | core24, strict confinement, home + network plugs; bundled Bun part |

## Verification matrix (measured 2026-08-31, this repository)

| Target | Verified evidence |
|---|---|
| npm package | tarball built; `npm install -g --prefix <tmp>`; `vae version` → 0.1.13-rc1; `dev --json` pure; E1600 → exit 2; 95 engine files in package |
| PyPI wheel | wheel built (95 engine files + entry_points); venv install; `vae version` OK; missing-Bun → E1600 exit 2 |
| Universal installer | source-method install from the signed release tarball; `vae version`; exit-code contract; `current` symlink; clean uninstall (nothing left behind) |
| deb | built via `dpkg-deb`; metadata + extraction checks pass (vae executable, engine present) |
| Homebrew / winget / dmg / pkg / rpm / AppImage / Flatpak / Snap / Chocolatey / Scoop | authored + reviewed only — **UNVERIFIED** until their host tooling executes them (markers inside each file); the four Phase XXXI channels are additionally syntax-validated locally (YAML/XML/JSON parsed, structure asserted) |

## Release-time placeholders

Strings marked `release-time` (formula url/sha256, winget InstallerUrl /
InstallerSha256, `vaerion.dev` URLs) are filled from the signed artifact
set when the release train publishes (Founder-gated: F-1 remote, F-5
publish). The tarball each script consumes is produced by
`tools/dist-pack.ts` — fail-closed on the six gates, byte-reproducibility
proven, Ed25519-signed manifest v2.
