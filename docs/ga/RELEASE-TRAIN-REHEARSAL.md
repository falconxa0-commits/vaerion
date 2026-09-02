# Vaerion Release-Train Rehearsal — v0.1.9-rc1

| | |
|---|---|
| **Departure ref** | `v0.1.9-rc1` (commit `8c7620339f7e`) |
| **Engine version of record** | `0.1.9-rc1` |
| **Rehearsed at** | 2026-09-02T21:05:14.032Z (wall-clock of the rehearsal, not of the artifacts) |
| **Verdict** | **PASSED — the release train is rehearsed end-to-end** |
| **Method** | ONE deterministic runner (`tools/rehearsal.ts`); every step is a measurement with its evidence; honesty labels per D-S |

## The measured steps

| Step | Result | Duration | Evidence |
|---|---|---|---|
| `verification-record` | ✅ PASS | 0ms | verification record GREEN (8 gates through the single verification authority) |
| `release-pack` | ✅ PASS | 28706ms | dist/ artifact set packed at v0.1.9-rc1 (  SHA256SUMS, MANIFEST.json, MANIFEST.json.sig, VERIFY.md, dist-report.json) |
| `trust-chain` | ✅ PASS | 45ms | dist-verify: ALL CHECKS PASSED — signature and every artifact digest verify. |
| `npm-pack` | ✅ PASS | 535ms | /home/z/my-project/dist/npm/vaerion-0.1.9-rc1.tgz |
| `npm-install` | ✅ PASS | 1004ms | installed into the scratch prefix; bin present |
| `installed-version` | ✅ PASS | 78ms | installed vae reported 0.1.9-rc1; engine version of record 0.1.9-rc1 |
| `installed-init` | ✅ PASS | 93ms | workspace scaffolded by the installed CLI in its cwd (vaerion.yaml present) |
| `installed-center` | ✅ PASS | 88ms | installed vae center --json exit 0 over the fresh scaffold (honest zeros) |
| `npm-uninstall` | ✅ PASS | 342ms | uninstalled; bin removed — nothing left behind |

## What this proves

- The signed artifact set is reproducible from the departure ref and the
  consumer trust chain verifies (`dist-verify`: Ed25519 manifest signature,
  every consumer file digest-bound).
- The npm channel install works from the packed tarball: the INSTALLED
  `vae` reports the engine version of record (lockstep through the
  artifact, not the repo), scaffolds a workspace with `vae init`, and
  reads it with `vae center --json` (exit 0, honest zeros).
- Uninstall leaves nothing behind.

## Honest limits (D-S)

- Registry publication (npm/PyPI/brew/winget) and the vaerion.dev installer
  URL are release-train **publish** steps — Founder-gated (risk ledger F-5);
  this rehearsal proves the LOCAL train end-to-end.
- Channels whose host tooling is absent here (brew, winget, dmg, rpm) are
  authored but UNVERIFIED — see packaging/README.md's verification matrix.
- The bootstrap signing key is generated at pack time (session-bound
  pattern, disclosed in dist/VERIFY.md) until the Founder key ceremony (F-3).
