# The Final GA Audit — ASCENSION XXV close

| | |
|---|---|
| **Document** | The independent close audit of the GA Readiness Campaign: baseline, per-phase work, the defect ledger (including defects in the auditor's own work), and the measured end state |
| **Baseline** | `docs/ga/ASCENSION-XXV-BASELINE-AUDIT.md` (every directive claim re-measured before any implementation) |
| **End state** | `main` at the close commit, ALL GATES GREEN **530/0/42** locally, CI GREEN on GitHub for the close tree, three-remote parity 0/0, first production-signed release published and verified |

## 1. The campaign in one paragraph

The campaign opened from a measured-true baseline (Public Beta = GO stood on
its own evidence) and closed the GA gap list phase by phase: the legal
identity layer, the production signing key ceremony with its first
production-signed release, the live release-publish pipeline with a public
GitHub Release, the publication/community surfaces, the provider
failure-compatibility cassettes (which caught a real engine defect), the four
missing distribution channels, the platform matrix, and the security audit.
Everything below cites its worklog task.

## 2. Per-phase record

| Phase | Work | Where the evidence lives |
|---|---|---|
| XXV Reality Audit | Every directive claim re-measured; two reality changes found (repo now PUBLIC — branch protection unblocked; canonical mirror lost — lawfully re-provisioned, parity 0/0) | Task 1; ASCENSION-XXV-BASELINE-AUDIT.md |
| XXVI Legal Identity | LEGAL.md; the winget copyright conflict found + fixed; package metadata identity fields; real `[project.urls]`; no conflicting identity remains (swept) | Task 2 |
| XXVII Key Ceremony | Production Ed25519 key → GitHub secret (write-only); key of record rotated; local copy destroyed; SIGNING-CEREMONY.md; R-2 CLOSED; branch protection enabled + GET-verified; **v0.1.13-rc1 cut and pushed** | Task 3 |
| XXVIII Infrastructure | release-publish.yml (validate → checkout tag → frozen install → deterministic re-pack → bootstrap-refusal tripwire → idempotent publish); dispatch measured SUCCESS; the public Release live; the full anonymous consumer loop measured; docs/operations/ written | Task 4 |
| XXIX Publication | INSTALL.md Option F = the live Releases path; stale "private" claims fixed; Discussions enabled (6 categories measured); ANNOUNCEMENTS.md + discussion #1 posted; changelog automation pinned in the register suite | Task 5 |
| XXX Provider Cassettes | 5 failure-transcript cassettes (429/401/529/mid-stream-error/404) fingerprinted from real request bytes; 6 failure-leg tests through the real service; **a real engine defect found and fixed** (mid-stream error swallowed); PROVIDER-COMPATIBILITY.md | Task 6 |
| XXXI Distribution | Flatpak + Snap + Chocolatey + Scoop authored, syntax-validated, version-locked (register → 22 surfaces) | Task 7 |
| XXXII Platform Hardening | deb re-verified at 0.1.13-rc1 (build + metadata + extraction); PLATFORM-MATRIX.md with SUPPORTED/UNVERIFIED/UNSUPPORTED and cited evidence | Task 8 |
| XXXIII Security Audit | Supply chain / repository / release audits measured fresh; FINAL-SECURITY-AUDIT.md; two new low residuals named (Dependabot, SHA-pinned actions) | Task 9 |
| XXXIV Final Verification | Fresh gates 530/0/42; dashboard browser-verified at 1280 + 390 (zero errors, zero overflow, footer law, new surfaces live); the three cryptography legs re-run at close | Task 10 |

## 3. The defect ledger (nothing hidden — including my own)

| ID | Defect | Root cause | Status |
|---|---|---|---|
| GA-1 | First GitHub push of the campaign failed | the prior session's credential helper was lost with the environment reset | fixed in-session (env-only helper); recorded |
| GA-2 | `main` CI run FAILED at install | transient npm-registry download failure (`next@16.1.3` tarball) — NOT code; root-caused from run logs | re-run → SUCCESS; recorded as infrastructure reality |
| GA-3 | RPM `%changelog` 0.1.12 entry was REWRITTEN by the version bump script | the script string-replaced the whole spec including history | caught by reading the file back; repaired (history preserved + appended) BEFORE commit |
| GA-4 | The mid-stream provider error event was silently swallowed (invocation recorded as SUCCESS) | `collectFrames` never checked `frame.type === "error"` | **fixed at root** (E1601 loud failure); permanently pinned by the failure-leg cassettes |
| GA-5 | The new changelog-pin test failed twice on first runs | the test built the notes path/header without the tag's `v` prefix | fixed by reading the files of record; both errors recorded |
| GA-6 | One gate run was executed through a pipe-to-tail that MASKED the non-zero exit, letting a commit land while RED | the auditor's own command design violated the no-pipe-masking law | re-ran unmasked (RED confirmed), fixed, amended the LOCAL-ONLY commit (never pushed); recorded |
| GA-7 | The constitutional gate caught "XXX" in the auditor's fix comment | C3 placeholder-debt scan treats `XXX` as a marker | reworded; the harness polices its authors |
| GA-8 | The `probeChunks` capture initially returned the error status during recording | the adapters refuse non-200 by design | fixed (probe is always 200; the error status attaches to the cassette) |
| GA-9 | A consumer-verification run downloaded 5 of 8 assets and failed leg 1 | incomplete test loop, not a product defect | re-run with the full set; recorded |
| GA-10 | The live release was published without the prerelease flag | the workflow lacked the rc → prerelease mapping | workflow fixed + the live release marked retroactively (API 200) |

## 4. What this audit does NOT claim

- No registry publication, no hosted website (F-5, Founder).
- No Windows/macOS/other-distro execution (host-gated; every row in
  PLATFORM-MATRIX.md names its host).
- No live-provider cassette recordings (F-6, Founder).
- No air-gapped key generation (the ceremony key was in-session under the
  Founder's written directive; the rotation path covers a hardware re-ceremony).
- The F-2 legal name remains pseudonymous until the Founder decides.

*Repository reality wins. Constitution wins. Evidence wins.*
