# Vaerion Deployment — the release train, rollback, and migration law

| | |
|---|---|
| **Document** | How a commit becomes a published, signed, verified release — and how a bad release is handled |
| **Pipeline of record** | `verify.yml` (every push) + `release-publish.yml` (per-tag publication) |
| **First production-signed release** | `v0.1.13-rc1` (measured end-to-end; see `worklog.md` Task 3) |

## 1. The deployment pipeline (what actually runs)

```
commit on main
   └─> verify.yml (GitHub Actions, ~60 s, measured)
         ├─ 8 gates through tools/verify.ts (typecheck ×2, tests + coverage floors,
         │   layerlint, constitutional-check, perf-budget, a11y-structural, repo-lint)
         └─ on a v* tag: dist-pack.ts — re-runs ALL gates internally, packs the
             deterministic artifact set, signs it with RELEASE_SIGNING_KEY
             (fail-closed to a disclosed bootstrap key if the secret is absent)

tag of record cut
   └─> release-publish.yml (workflow_dispatch, per tag)
         ├─ validate the tag input (vMAJOR.MINOR.PATCH-rcN; refuse otherwise)
         ├─ checkout the TAG (the repository is the evidence)
         ├─ frozen-lockfile install (supply-chain law)
         ├─ provision RELEASE_SIGNING_KEY (same fail-closed contract)
         ├─ dist-pack.ts (deterministic re-pack ON the tag — reproducibility
         │   holds on the publishing path itself, not just the CI artifact)
         ├─ the tripwire, inverted: REFUSE to publish if the pack report
         │   discloses a bootstrap key
         └─ gh release create-or-update: assets (tarball, .vxn bundle,
             MANIFEST.json + .sig, SHA256SUMS, VERIFY.md, dist-report.json,
             release-signing.pub) + the release notes of record
```

**Why re-pack instead of downloading CI artifacts:** the tarball is byte-
reproducible (built twice and byte-compared in every pack report — measured).
Re-packing on the tag proves the published bytes equal the verified bytes;
artifact storage is never in the trust chain.

## 2. Release-cut procedure (the operator runbook)

1. Bump the version register (the register test's 18 surfaces + the
   `VERSION`/`ENGINE_VERSION` literals); regenerate `spec/openapi.json` via
   the sanctioned generator; APPEND the RPM changelog entry (history never
   rewinds — a bump that rewrites it is a defect; caught once, Task 3).
2. Review any golden-fixture diff (`VAE_BLESS=1` only after reading it;
   `engine_version` moves inside the sealed chain content by design).
3. Gates green locally (`bun run tools/verify.ts`).
4. Commit; `git push` to `github` and `canonical` (ff-only; new refs only).
5. Cut the annotated tag; push it (a NEW ref — never moved, never rewritten).
6. Watch `verify.yml` on the tag; then `gh workflow run release-publish.yml
   -f tag=<tag>`.
7. Verify the published release the consumer way (three legs: `sha256sum
   --check` → engine `dist-verify` → an independent openssl cross-check).
8. Record the run in `worklog.md`.

## 3. Rollback strategy (immutable-law compatible)

There is no "roll back a release" in the rewrite sense — tags are immutable
and history is never rewritten (constitutional law, measured across every
campaign). Rollback means one of:

| Situation | Action |
|---|---|
| A published release is **bad** (defect found post-publish) | Mark it: `gh release edit <tag> --prerelease` + a title/body note naming the defect; the next tag carries the fix-forward (the GAP-1/DX precedent). Consumers pin versions — installing the previous tag is the user-side rollback. |
| A release was published **without production-signing** (tripwire missed) | The publish pipeline now refuses this at the gate; if one ever slipped through: `gh release delete <tag>` is NOT used (it would move history) — the release is edited to state the bootstrap-key disclosure, and a fresh tag re-publishes the signed set. |
| The **registry channel** ships a bad package (post-F-5) | Each registry's own yank/withdraw process; the source of truth (GitHub Releases) stays intact and teaches verification, so consumers can always check what they run. |
| The publish pipeline itself is broken | It is idempotent per tag: fix the workflow on `main`, re-dispatch for the same tag. |

**Recovery-time objective:** re-dispatching a release is a two-command
operation (`gh workflow run` + watch); the artifact set rebuilds in ~5 minutes
of CI (measured: verify ~60 s, pack ~90 s, publish ~30 s).

## 4. Migration process (upgrade law)

- Versions are content-additive within v0.1 (nothing removed or renamed —
  `BETA-ONBOARDING.md` law); the upgrade path is taught in each release's
  notes ("Upgrade path" section, e.g. `docs/RELEASE-NOTES-v0.1.13-rc1.md`).
- The version register (18 surfaces + negative sweep) is the mechanical
  guarantee that every artifact naming surface agrees with the engine —
  a stale surface fails CI, not a Founder audit.
- The cross-version upgrade leg (vN → vN+1 on one host) is a named
  remaining item in `docs/ga/REMAINING-REALITY-REPORT.md` (single-release
  lineage per host session is the honest current state).
- `.vaerion/` workspaces are forward-compatible by design: journals are
  append-only with versioned envelopes; `vae journal verify` and `resume`
  work across the register's rc epoch (pinned by the golden + journal tests).

## 5. What is deliberately NOT in the pipeline

- No auto-deploy of the dashboard to external hosting (F-5, Founder-gated).
- No registry publication step (F-5) — the manifest surfaces are authored,
  version-locked, and awaiting the Founder's publication decision.
- No signing of macOS/Windows native installers (Apple Developer ID /
  Authenticode certificates are Founder acquisitions; prep documented in
  `packaging/macos/SIGNING-PREP.md` and the channel manifests).

*Repository reality wins. Constitution wins. Evidence wins.*
