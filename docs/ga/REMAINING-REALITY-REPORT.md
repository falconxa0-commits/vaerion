# The Final Remaining Reality Report (ASCENSION XXVI+ close)

| | |
|---|---|
| **Document** | Everything between "GA-ready engineering" and "GA", sorted by measured status |
| **Engine of record** | `0.1.13-rc1` — ALL GATES GREEN **544/0/43, 9 gates, exit 0** on the close tree `21234b6`; CI GREEN on GitHub; three-remote parity 0/0 |
| **Law** | Only measured truth. UNVERIFIED means *authored but impossible to verify in this environment*, with the reason. BLOCKED means *a human or external platform owns it*. Nothing omitted. |

## 1. COMPLETE — the five named engineering items (this campaign, all measured)

1. **Dependabot** — `.github/dependabot.yml` (bun / github-actions / pip;
   weekly; minor+patch grouped; majors excluded from bot rides). LIVE: the
   first sweep opened 6 PRs — one group PR with 51 updates (grouping
   proven), majors solo. Contract-pinned by ci-truth tests.
2. **SHA-pinned actions** — 6/6 `uses:` across both workflows full-SHA
   pinned + annotated; SHAs independently re-verified via the commits API;
   the floating-tag regex test makes the defect class a suite failure.
3. **The daemon `packages` route group** — pack/verify/import over the wire
   with PROVEN parity (the wire pack journals the IDENTICAL event-type
   sequence as the CLI); `package.imported` additive to the event registry;
   spec regenerated (17 paths); SDK client complete; verify-first import;
   workspace path law. Five socket tests.
4. **Coverage ratchets** — the 116-module baseline of record + the
   `coverage-ratchet` gate (the 9th gate): a silent per-module decrease
   fails CI by name; only a deliberate bless lowers a floor; the 1.0pp
   jitter allowance is measured, not guessed.
5. **The cross-version upgrade leg** — the REAL installer executed
   end-to-end: tagged v0.1.12-rc1 installed → a vN workspace journals → the
   same prefix upgraded to vN+1 → the shim serves vN+1, the vN tree is
   retained, and the vN journal verifies under vN+1. A permanent regression
   test, not a one-off.
6. **Shell completions ×6** — bash/zsh/fish/powershell verified; nushell +
   xonsh implemented from the ONE model with honest UNVERIFIED markers; a
   new test pins that the generators can never lag the model.

## 2. VERIFIED — measured during THIS campaign (where)

- Gates fresh at every phase boundary and at close (530→544 tests, 9 gates,
  exit 0 each time); CI SUCCESS on main at both push boundaries
  (`c7393fd`, `21234b6`); three-remote parity 0/0 at each.
- Entry-state claims re-measured before work (suite, release, protection,
  secrets, signing) — zero divergences from the XXV records.
- The registry/website reality (R-1, `REGISTRY-STATE-MEASUREMENT`):
  npm/PyPI/Homebrew/winget/Flathub/Snap/Chocolatey/Scoop all NOT PUBLISHED;
  vaerion.dev not even registered — the F-5 slate is clean.
- Dependabot end-to-end in production: PRs opened, grouped and solo,
  CI-measured.
- The vN→vN+1 workspace upgrade contract (journal of vN verifies under
  vN+1), executed for real on this host.

## 3. UNVERIFIED — authored, impossible to verify here (exact reasons)

| Surface | Why UNVERIFIED here |
|---|---|
| Windows execution (install.ps1, winget, choco, scoop, PATH/shim, SmartScreen) | no Windows host / pwsh in this environment |
| macOS execution (dmg/pkg build, codesign/notarize, Gatekeeper, brew) | no macOS host; Apple Developer ID required |
| Flatpak/Snap/RPM/AppImage builds | no flatpak-builder/snapcraft/rpmbuild/appimagetool here (manifests syntax-validated only) |
| Live distro testing (apt install on real Debian/Ubuntu; Fedora/Arch/…) | no distro hosts or container runtime |
| zsh/fish/powershell/nushell/xonsh completion EXECUTION | no such shells on this host (`bash -n` remains the measured exception) |
| Docker/Podman/devcontainer image builds | no container runtime |
| SBOM generation (CycloneDX/spdx tooling) | tooling absent; policy documented |
| Live provider recordings | no provider network (F-6) |
| The upgrade leg over RELEASED artifacts of a future train | the train must exist first (rehearsal step) |

## 4. REMAINING — engineering work still owed before GA

**None.** The five named items are closed with measured, pinned evidence
(`docs/ga/ASCENSION-XXVI-COMPLETION-REPORT.md` §1). The next release train
(`v0.1.14-rc1`) ships the new daemon surface and is a Founder-paced
publication act (packet §A.3), not an engineering gap.

## 5. BLOCKED — owned by the Founder or an external platform (packet-ready)

| Blocker | Owner | Exact state |
|---|---|---|
| F-2 full legal name in the identity layer | Founder | `Auren` pseudonym consistent everywhere; LEGAL.md §6 records the sweep |
| F-4 substrate ratification (ADR-0018) | Founder | PROVISIONAL with a recorded migration path |
| F-5 publication: npm/PyPI/Homebrew/winget/Chocolatey/Scoop/APT/RPM + `vaerion.dev` | Founder + registries | every channel authored + version-locked; GitHub Releases LIVE; **the packets are signature-ready: `docs/founder/FOUNDER-PACKETS.md`** |
| F-6 live provider recordings | Founder (+ provider accounts) | recorder + failure cassettes ready; packet §D |
| R-7 public security-reporting channel | Founder | private route live; security.txt awaits the domain (packet §C/§E) |
| Registry/store review timelines | external platforms | cannot be executed or measured from here |

## 6. The one-line reality

The engineering gap to GA is **zero**: the product is consumable,
verifiable, upgradeable, and dependency-watchable today — what remains is
exactly the Founder's signature set and the external platforms' timelines,
both packet-ready and honestly labeled, and nothing else.

*Repository reality wins. Constitution wins. Evidence wins.*
