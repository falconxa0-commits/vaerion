# Release Notes — v0.1.13-rc1 (the ASCENSION XXV production-trust release)

| | |
|---|---|
| **Date** | 2026-09-03 (tag date, measured) |
| **Engine of record** | `0.1.13-rc1` — ALL GATES GREEN 523/0/41 at close |
| **Theme** | GA readiness: production release trust, legal identity, branch protection — quality and trust, not features |
| **Verification status** | every claim below measured in `worklog.md` (Tasks 2–3); platform-execution gaps remain honestly labeled in `docs/ga/REMAINING-REALITY-REPORT.md` |

## The headline: release trust became permanent (F-3 / R-2 closed)

The first release signed by the **production key**. The session-bound bootstrap
era is over:

- The production Ed25519 key lives in exactly one place: the GitHub Actions
  secret `RELEASE_SIGNING_KEY` (sealed-box encrypted, write-only).
- The key of record `keys/release-signing.pub` is the production public half;
  its fingerprint is pinned inside every artifact set's `VERIFY.md`.
- The fail-closed bootstrap path remains only as a fallback — its disclosure
  line in a pack report is the tripwire that a release was **not** production-signed.
- Process, ownership, rotation policy, recovery procedure:
  `docs/security/SIGNING-CEREMONY.md`.
- Honest residual: the key was generated under the Founder's written directive
  in-session, not air-gapped; a hardware-custodied re-ceremony remains
  available via the recorded rotation path.

## Also in this release

- **Branch protection on `main`** — the repository is public, which satisfied
  the exact escape condition of the previously plan-blocked item. Required
  status check (`verification (all gates)`) gates PR merges; linear history
  enforced; force pushes and deletions disabled; administrators retain the
  recorded direct-push law (solo-maintainer posture, stated in the audit).
- **The legal identity layer** — `LEGAL.md`: identity table, ownership
  statement, licensing documentation (including the ruling that `.vxn`
  artifacts are *your* data), inbound=outbound contributor terms, trademark
  policy, and the F-2 pseudonym disclosure with the mechanical sweep its
  resolution will trigger.
- **A real identity conflict found and fixed** — the winget locale manifest
  claimed `Copyright (c) Vaerion contributors` against the LICENSE of record
  (`Copyright 2026 Auren`); aligned. Package metadata gained
  repository/bugs/homepage identity fields; `pyproject.toml` gained real
  `[project.urls]` (the repository is public).
- **The canonical mirror restored** — the ASCENSION XXV baseline audit found
  the bare canonical remote lost to an environment reset; it was lawfully
  re-provisioned (new refs only) and three-remote parity 0/0 re-measured.
- **The golden fixtures blessed** — the version train moved `engine_version`
  inside the sealed journal/receipt content; the blake3 chain hashes changed
  as a consequence, reviewed diff-exact (one non-hash line), regenerated via
  `VAE_BLESS=1` only.

## Upgrade path

`v0.1.12-rc1 → v0.1.13-rc1` is content-additive: no command, flag, exit code,
or E-code changed. Installers teach the same paths; the version register
(18 surfaces + negative sweep) pins lockstep. Verify the release with the
three legs taught in `VERIFY.md` (sha256 → engine `dist-verify` → openssl
cross-check); artifacts carry the production key beside them.

## What this release does NOT claim

- No registry publication (npm/PyPI/Homebrew/… remain F-5, Founder + platforms).
- No Windows/macOS/distro-host execution (no such host in this environment;
  the channels remain authored + version-locked, labeled UNVERIFIED—host).
- No real-provider cassette recordings (F-6: no provider network here).
- The signing key is production, not hardware-custodied (residual, labeled
  above and in `SIGNING-CEREMONY.md` §2).

*Repository reality wins. Constitution wins. Evidence wins.*
