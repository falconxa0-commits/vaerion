# Release Notes — Vaerion `v0.1.12-rc1`

| | |
|---|---|
| **Release commit** | `485016f` (2026-09-03, authored `Auren <auren@vaerion.dev>`) |
| **Tag of record** | annotated `v0.1.12-rc1` → tag object `888758a` → `485016f` |
| **Campaign of record** | ASCENSION XX — the ecosystem completion (Phases 19–22; `worklog.md` entries ASC-XX-PHASE-19/20/21/PROGRAM-CLOSE) |
| **Verdict** | public-beta artifact set, measured end-to-end; full GA pending the Founder gates (F-2..F-6) |

## What shipped

- **The verified engine is now a measured developer ecosystem.** The
  Empty Machine Test executed eleven connected legs on a fresh machine —
  discover, source install, no-bun teaching leg, verify+doctor, init,
  use-as-taught, use-with-sources, recover, upgrade, remove, npm method,
  Python wheel consumer, consumer dist-verify — each with per-leg
  evidence (`docs/ga/ASCENSION-XX-EMPTY-MACHINE-TEST.md`).
- **Version lockstep `0.1.12-rc1`** across the measured release surfaces:
  17 surfaces aligned at the release commit (3× package.json +
  ENGINE_VERSION + CLI VERSION + packaging npm/python/macos ×2/linux
  ×2/homebrew/winget ×3 + pyproject + packaging README);
  `spec/openapi.json` regenerated via the sanctioned generator; goldens
  re-blessed via the only sanctioned path (`VAE_BLESS=1`) — the sole
  movement was the engine_version cascade (`worklog.md`,
  ASC-XX-PROGRAM-CLOSE).
- **Ecosystem defect closures XX-D4..D9**, each closed at root and pinned
  by tests (`worklog.md` ASC-XX-PHASE-20; ledger in
  `docs/ga/ASCENSION-XX-REALITY-RECOVERY.md` §6): the signing public key
  now ships BESIDE the artifacts (never overwriting the tracked key of
  record); fresh-`$HOME` PATH persistence (rc files created when absent);
  the demo first-run journey works as taught (one template registry
  authority); the npm method falls back to a writable user prefix on
  EACCES; same-version reinstall no longer nests `src/src`; the installer
  success line no longer eats its command.
- **Browser-verified dashboard** (ASC-XX-PHASE-21): zero console errors,
  semantic a11y tree, footer safe-area defect (XX-D10) fixed and measured
  at 390px and 1440px; screenshots captured and inspected.
- Post-tag fix-forward (after the tag, on main): three version-bearing
  surfaces found outside the register (`packaging/python/vaerion/__init__.py`,
  `packaging/linux/vaerion.spec`, `packaging/windows/install.ps1`, plus
  one teaching line in `make-deb.sh`) were aligned and the drift class is
  now mechanically enforced by
  `packages/vaerion/tests/integration/version-register.test.ts`
  (`worklog.md` Task 2-a, commit `3f3722b`).

## Verification status

- **All gates green.** Measured 499 pass / 0 fail / 2976 expectations /
  39 files on the close tree of record (`worklog.md`,
  ASC-XX-PROGRAM-CLOSE); 504 pass / 0 fail on the current tree after the
  version-register fix-forward (`worklog.md` Task 2-a).
- **The release train, measured end-to-end**: release commit → annotated
  tag → `dist-pack --ref v0.1.12-rc1` (fail-closed full gates;
  reproducibility PROVEN at 1,385,858 bytes, two builds byte-identical;
  Ed25519 self-verified) → empty-machine spot check of the tagged tarball
  reporting `engine_version: 0.1.12-rc1` with the demo journey exit 0
  (`worklog.md`, ASC-XX-PROGRAM-CLOSE).
- **CI runs measured GREEN on GitHub infrastructure** (worklog.md Task 3):
  run 33805316308 (main) — job "verification (all gates)" SUCCESS, 58s
  wall; run 33805318732 (tag `485016f`) — both jobs success (all gates +
  signed release artifacts).
- **Trust chain independently verified from the CI artifacts** (worklog.md
  Task 3): `sha256sum --check` 7/7 OK; the engine's consumer
  `dist-verify` ALL CHECKS PASSED (exit 0) via the shipped-key path with
  no repository and no session state; then CROSS-VERIFIED by an
  independent implementation — openssl Ed25519 "Signature Verified
  Successfully" (exit 0). The first openssl attempt failed and was
  root-caused by measurement (the `.sig` is base64 of the raw 64-byte
  signature) — recorded as tester error, not an engine defect.
- **Synchronization parity 0/0 measured**: `github/main` == local main;
  the `v0.1.12-rc1` tag object byte-identical local↔canonical↔GitHub by
  rev-parse; all 7 tags present on both remotes; adversarial probes
  (non-ff push, main deletion, tag overwrite, tag deletion) all REFUSED
  with post-probe state unchanged (`worklog.md`, ASC-XX-PROGRAM-CLOSE and
  Task 3).

## Honest notes

- **Bootstrap signing key disclosure.** `secrets.RELEASE_SIGNING_KEY` is
  not set on GitHub; the CI release job's pack report honestly discloses
  "bootstrap key GENERATED this run — session-bound, disclosed". The
  offline key ceremony (F-3) remains pending; verify against the key
  shipped beside the artifacts until then (`worklog.md` Task 3;
  `docs/security/RISK-LEDGER.md` R-2).
- **Host-gated channels UNVERIFIED**: Homebrew, winget, .dmg/.pkg, rpm,
  and AppImage are authored and reviewed but not executed on their
  platforms (`packaging/README.md` verification matrix; markers inside
  each file).
- **Cross-version upgrade UNVERIFIED** (single release lineage per host
  session) and **twine check UNVERIFIED** (host lacks twine)
  (`docs/ga/ASCENSION-XX-REALITY-RECOVERY.md` §6).
- **Branch protection BLOCKED by GitHub plan** (API 403; public repo or
  Pro plan decision — Founder-gated) (`worklog.md` Task 3).
- **GA remains pending the Founder gates**: F-2 legal name, F-3 key
  ceremony, F-4 substrate ratification (ADR-0018 PROVISIONAL), F-5
  publication, F-6 real-provider cassettes (`docs/ga/GO-NO-GO.md` §2).

## Consumer verification (as taught — about one minute)

With the artifact set (`SHA256SUMS`, `MANIFEST.json`, `MANIFEST.json.sig`,
`release-signing.pub` shipped beside the manifest):

```sh
sha256sum --check SHA256SUMS
bun run tools/dist-verify.ts --manifest MANIFEST.json \
  --sig MANIFEST.json.sig --pub release-signing.pub
```

`dist-verify` resolves the key explicitly, or falls back to the key beside
the manifest, and fail-closes otherwise. ALL CHECKS PASSED (exit 0) is the
verified outcome; a tampered artifact fails with exit 1 (tamper probes are
part of the packer's own law — `docs/ga/RELEASE-VERIFICATION.md`).
