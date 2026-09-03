# Installing Vaerion

Every channel delivers the same engine, the same `vae` entrypoint, the same
exit-code contract. The engine executes on the [Bun](https://bun.sh) runtime
(ADR-0018); any channel that does not find Bun **teaches instead of guessing**
(E1600, exit 2, with the exact install command for your OS).

## Channel map

| Channel | Command | Status |
|---|---|---|
| npm | `npm install -g vaerion` | package build + local install **verified**; registry publish is release-train (Founder-gated) |
| PyPI | `pip install vaerion` | wheel build + venv install **verified**; publish is release-train (Founder-gated) |
| Universal installer | `curl -fsSL https://vaerion.dev/install \| sh` | install/update/uninstall **verified** end-to-end; the `vaerion.dev` URL goes live with the release train |
| Debian | `packaging/linux/make-deb.sh` → `.deb` | build + extraction **verified** (`dpkg-deb`) |
| Homebrew | `packaging/homebrew/vaerion.rb` | authored; **UNVERIFIED — BREW** (no brew here) |
| RPM | `packaging/linux/vaerion.spec` | authored; **UNVERIFIED — RPM** (no rpmbuild here) |
| AppImage | `packaging/linux/make-appimage.sh` | AppDir assembly verified; final step **UNVERIFIED — APPIMAGE** (needs `appimagetool`) |
| Windows | `packaging/windows/` (winget manifests + `install.ps1`) | authored; **UNVERIFIED — WINDOWS** |
| macOS | `packaging/macos/` (`.dmg`, `.pkg`) | authored; **UNVERIFIED — MACOS**; signing prep in `SIGNING-PREP.md` |
| From source | below | **verified** (this is how the repository verifies itself) |

## Option A — universal installer (recommended)

```sh
curl -fsSL https://vaerion.dev/install | sh
```

Auto-detects OS and architecture, resolves the install method, sets up
PATH (idempotent marker lines), and supports `--update` and `--uninstall`
(removes everything it created — no daemons, no launch agents, no
telemetry). Offline installs: `--tarball <release tarball>`. Runtime
install on your behalf only with `--install-bun`; otherwise a missing Bun
is a taught error with the exact per-OS command.

Verified in this repository's own environment: install → `vae version` →
exit-code contract → clean uninstall leaves nothing behind.

## Option B — npm

```sh
npm install -g vaerion        # requires Bun 1.2+ on PATH
vae --help
```

If the system npm prefix is not writable (no sudo), the universal installer
(`install.sh --method npm`) falls back to a user prefix (`~/.npm-global`)
automatically, adds it to your shell PATH, and says so. To do it by hand:
`npm config set prefix ~/.npm-global` and add `~/.npm-global/bin` to PATH.

## Option C — PyPI

```sh
pip install vaerion           # Python is the delivery channel, not the substrate
vae --help                    # launcher execs the engine via Bun
```

## Option D — Debian / Linux packages

```sh
sh packaging/linux/make-deb.sh            # builds dist/linux/vaerion_<v>_all.deb
sudo dpkg -i dist/linux/vaerion_<v>_all.deb
vae --help
```

## Option E — from source (the audit path)

```sh
git clone <repository-url> vaerion && cd vaerion
bun install                      # workspace-internal resolution, no global state
bun run tools/verify.ts          # the six verification gates
bun run packages/vaerion/src/cli/vae.ts --version
alias vae="bun run packages/vaerion/src/cli/vae.ts"
```

`tools/verify.ts` must print `ALL GATES GREEN` and writes its measured
result to `.vaerion-verification.json`. If any gate fails, the engine is
not verified on your machine — see `docs/TROUBLESHOOTING.md`.

## Option F — GitHub Releases download (signed, offline, no account needed)

Every release publishes its full signed artifact set on the public releases
page (live since `v0.1.13-rc1`, measured end-to-end including an anonymous
download-and-verify pass during the ASCENSION XXV campaign):

> https://github.com/falconxa0-commits/vaerion/releases

Each release carries: `vaerion-<version>-source.tar.gz`, the `vaerion-demo.vxn`
bundle, `SHA256SUMS`, `MANIFEST.json` + `MANIFEST.json.sig`, the public key
(`release-signing.pub`), `VERIFY.md` (the consumer verification instructions),
and `dist-report.json` (the pack audit — including the production-key proof).

The anonymous three-leg verification, exactly as a fresh consumer runs it:

```sh
sha256sum --check SHA256SUMS                       # leg 1: artifact integrity

# leg 2: the engine's own verifier — needs only bun, no repository:
tar -xzf vaerion-<version>-source.tar.gz
bun run vaerion-<version>/tools/dist-verify.ts \
  --manifest MANIFEST.json --sig MANIFEST.json.sig --pub release-signing.pub

# leg 3: an independent implementation (openssl, raw decoded signature):
base64 -d MANIFEST.json.sig > sig.raw
openssl pkeyutl -verify -pubin -inkey release-signing.pub \
  -rawin -sigfile sig.raw -in MANIFEST.json
```

`packaging/install.sh --tarball <file>` turns the tarball into a full
user-local install; running the CLI from the unpacked tree works directly
(`bun run packages/vaerion/src/cli/vae.ts --version`). Step-by-step release
verification: `docs/ga/RELEASE-VERIFICATION.md`. The release trust chain
(who signs, rotation, recovery): `docs/security/SIGNING-CEREMONY.md`.

> Registry channels (npm/PyPI/Homebrew/winget/Chocolatey/Scoop/APT/RPM)
> remain authored + version-locked but are not published yet — that is the
> Founder-gated F-5 publication step. Until they land, GitHub Releases and
> the source paths above are the real download surface.

## What installation does NOT do

- No global daemons, no background services, no launch agents.
- No telemetry. The config guard accepts exactly one value
  (`telemetry.enabled: false`); constitutional check C1/C6 enforces no
  undeclared network primitives in the engine.
- No writes outside your workspace directory (`.vaerion/` and
  `vaerion.lock` live in the workspace root) and the install prefix you
  chose.

## Requirements summary

| Component | Requirement |
|---|---|
| Runtime | Bun 1.3+ (engine and CLI) |
| OS | Linux / macOS / Windows (WSL2 for the POSIX channels; native winget channel prepared) |
| Network | None required for local operation; the model gateway is the single sanctioned egress and only runs when you invoke it |
| Disk | Workspace-local `.vaerion/` store |
