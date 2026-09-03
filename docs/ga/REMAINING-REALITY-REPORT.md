# The Final Remaining Reality Report (Phases XXI–XXIV close)

| | |
|---|---|
| **Document** | Everything between "Engineering Complete" and "Public Release Ready", sorted by measured status |
| **Engine of record** | `0.1.12-rc1` · EIGHT gates GREEN 523/0/41 on the close tree |
| **Law** | Only measured truth. UNVERIFIED means *authored but impossible to verify in this environment*, with the reason. BLOCKED means *a human or external platform owns it*. Nothing omitted. |

## 1. COMPLETE — implemented and verified in this repository

- The engine: event spine, journal (hash-chain + recovery), broker + gates, gateway single gate (4 adapters + mockbrain), agents, workflows, receipts, provenance, packages (.vxn ADR-0016), daemon, CLI surface (20 ratified commands), SDK, tools.
- Verification: 523 tests / 41 files / 3007+ expectations, coverage floors held, 8 permanent gates through the single authority `tools/verify.ts`.
- The version register: complete and mechanically enforced (18 surfaces + parity + negative sweep) — a stale surface now fails CI, not a Founder audit.
- The DX surface: `--version`/`-V` (NDJSON), `help [COMMAND]`, `completions` for bash/zsh/fish/powershell, renderer-owned error paths (NDJSON on usage errors), `--quiet`, `VAE_DEBUG` — all pinned.
- The documentation universe: root trust set (README/LICENSE/CONTRIBUTING/SECURITY/SUPPORT/CODE_OF_CONDUCT/CHANGELOG), GitHub PR + issue templates, docs (INSTALL, QUICKSTART, TROUBLESHOOTING, FAQ, CLI, SDK, LIMITATIONS, RELEASE-NOTES-v0.1.12-rc1, ADR index ×20, security ×4, ga ×13, constitution v1.0–v1.7), examples index.
- The trust chain: deterministic dist-pack (reproducibility proven), Ed25519-signed canonical manifest, sha256+blake3 coverage of every consumer artifact, the signing key shipped BESIDE the artifacts, consumer `dist-verify` requiring no repository.
- The web dashboard: measured status surface with the install journey, honest channel labels, reports index; sticky footer, safe-area inset, a11y invariants gated.

## 2. VERIFIED — measured during THIS campaign (with where)

- GitHub Actions on real infrastructure: all-gates job SUCCESS at step level (58 s) for `7a1e44f`; verify + signed-release jobs SUCCESS for the `485016f` tag run. (§3 of the audit report)
- The CI-produced artifact set verified three ways: sha256 7/7 → engine `dist-verify` (consumer path) → independent openssl Ed25519 cross-check. (§3 of the audit report)
- Three-remote parity 0/0 with the tag object byte-identical; the sync itself lawful (ff-only, new ref only). (§3 of the audit report)
- The lockstep defect class measured and closed (GAP-1) and the DX defect class measured and closed (DX-1..6), both root-caused and pinned. (§2 of the audit report)
- Bash completion script: `bash -n` on this host. Dashboard: serving 200 with only the benign pre-existing metadataBase warning in dev.log.

## 3. UNVERIFIED — authored here, impossible to verify in this environment (with the exact reason)

| Surface | Why UNVERIFIED here |
|---|---|
| Windows: MSI/EXE/winget/Chocolatey/Scoop/install.ps1 execution, PATH/shim behavior on Windows, SmartScreen | no Windows host in this environment |
| macOS: DMG/PKG build, codesign/notarize, Gatekeeper, brew formula install | no macOS host; Apple Developer ID required |
| Linux: rpmbuild execution, AppImage runtime (linuxdeploy), deb install on real Debian/Ubuntu/Fedora/Arch/openSUSE/Alpine, Flatpak/Snap (manifests not yet authored — see REMAINING), WSL, SELinux contexts | no distro packaging hosts; only this Linux sandbox |
| zsh / fish / PowerShell completion EXECUTION | no zsh/fish/pwsh binary on this host (`bash -n` is the measured exception) |
| Docker/Podman/devcontainer image build + security scan | no container runtime in this environment |
| GitLab CI / Jenkins / Azure / Buildkite / CircleCI / TeamCity pipelines | only the GitHub Actions port is executable + measured; the others are authored ports of the same gate contract |
| `twine check` (wheel metadata) | twine not installed; no PyPI network path |
| Cross-version upgrade leg (vN → vN+1 on one host) | single release lineage per host session (recorded since the Empty Machine Test) |
| SBOM generation (CycloneDX/spdx tooling) | tooling absent; policy documented instead |
| Real-provider cassettes (openai/anthropic/ollama live recordings) | no provider network access in this environment (F-6) |

## 4. REMAINING — engineering work still owed before GA (small, named)

1. Flatpak + Snap + Chocolatey + Scoop manifests (the four channels with no authored artifact yet — every other channel has one).
2. `nushell` / `xonsh` completion generators (the directive names them; the four major shells ship today).
3. The daemon `packages` route group (wire parity + spec/openapi regen) — MS-6 leftover.
4. Per-module coverage ratchets on top of the total-based floors (mechanical).
5. Cross-version upgrade leg for the next release train (v0.1.12-rc1 → next).
6. GitHub-side Secrets provisioning: `RELEASE_SIGNING_KEY` (the F-3 ceremony's mechanical half — the workflow already consumes it fail-closed).

## 5. BLOCKED — owned by the Founder or an external platform

| Blocker | Owner | Exact state |
|---|---|---|
| F-2 full legal name in packaging authorship | Founder | `Auren` pseudonym in place; legal name required before strangers are asked to trust signatures |
| F-3 the offline key ceremony (+ GitHub secret provisioning) | Founder | bootstrap key disclosed in every CI pack report (measured); rotation path taught in RISK-LEDGER R-2 |
| F-4 substrate ratification (TypeScript-on-Bun, ADR-0018) | Founder | PROVISIONAL with a recorded migration path |
| F-5 publication: npm/PyPI/Homebrew/winget/Chocolatey/Scoop/APT/RPM + download URL + hosted site | Founder + registries | every manifest authored + version-locked; publication actions need registry accounts and Founder approval |
| F-6 real-provider recording sessions | Founder (+ provider accounts) | environment has no provider network; cassettes framework ready |
| Branch protection on `main` | Founder (GitHub plan) | API 403: "Upgrade to GitHub Pro or make this repository public to enable this feature." |
| Registry/store review timelines (winget PR, Homebrew PR, PyPI/npm trust) | external platforms | cannot be executed or measured from here |

## 6. The one-line reality

Everything an engineer can build and verify in this environment has been built and verified — measured, not narrated — and what remains is precisely: four authored-manifest gaps, a handful of named engineering legs, and the Founder/external gates that no amount of engineering can substitute for.
