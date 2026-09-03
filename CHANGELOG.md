# Changelog

All notable changes to the Vaerion engine. Entries derive from the measured
records of record — the annotated git tags (`v0.1.7-rc1` … `v0.1.13-rc1`), the
reports in `docs/ga/`, and `worklog.md` — not from memory; dates are the
measured tag dates. Keep a Changelog format; within v0.1 surfaces evolve
additively — nothing removed or renamed (`BETA-ONBOARDING.md`).

## [Unreleased]

- Fixed (fix-forward, no released tag touched): three release surfaces sat
  outside the register at `0.1.9-rc1` (`packaging/python/vaerion/__init__.py`,
  `packaging/linux/vaerion.spec`, `packaging/windows/install.ps1`) plus one
  teaching line in `make-deb.sh`; all aligned to `0.1.12-rc1`, pinned by
  `packages/vaerion/tests/integration/version-register.test.ts` (18-surface
  register + negative sweep). Gates green 504/0/40 (worklog Task 2-a, commit
  `3f3722b`).
- Added: root trust documents — `SECURITY.md`, `SUPPORT.md`,
  `CODE_OF_CONDUCT.md`, this changelog, `.github/PULL_REQUEST_TEMPLATE.md`,
  `.github/ISSUE_TEMPLATE/` (bug / feature / config), `examples/README.md` —
  closing the measured Group A publication gap
  (`docs/ga/PHASE-XXIII-PUBLICATION-GAP-AUDIT.md`). (Task 4-b)
- Records of record (audits, not product changes): Phase XXII DX audit
  (17/24 EXIST; five feasible gaps named, OPEN); Phase XXIII publication gap
  audit (27 EXISTS / 1 PARTIAL / 21 MISSING of 49); GitHub sync measured
  (fast-forward `b6c5fac..7a1e44f`, tag pushed once, byte-identical; Actions
  runs SUCCESS incl. signed-release; CI artifacts independently verified).

## [0.1.13-rc1] — 2026-09-03 — the ASCENSION XXV production-trust release (the first release signed by the production key)

- Security: **the production signing key ceremony (F-3/R-2 closed)** — the
  release trust anchor moved from the session-bound bootstrap key to the
  production Ed25519 key provisioned as the GitHub Actions secret
  `RELEASE_SIGNING_KEY` (sealed-box encrypted at rest); the key of record
  `keys/release-signing.pub` rotated to the production public half
  (fingerprint pinned in `VERIFY.md` of every artifact set); the local
  private-key copy destroyed after provisioning; process, ownership, rotation
  policy, and recovery procedure recorded in `docs/security/SIGNING-CEREMONY.md`.
  Historical releases keep verifying against their own manifest-bound keys.
  Residual (labeled): the key was generated under the Founder's written
  directive in-session, not air-gapped — a hardware-custodied re-ceremony
  remains available via the recorded rotation path.
- Security: **branch protection enabled on `main`** (Phase XXXIII) — the
  repository went public, which met the exact escape condition of the
  previously plan-blocked item; required status check + no force pushes +
  no deletions, enforced for administrators.
- Added: the legal identity layer — `LEGAL.md` (identity table, ownership
  statement, licensing documentation, inbound=outbound contributor terms,
  unregistered-trademark policy, the F-2 pseudonym disclosure) (Phase XXVI).
- Fixed: a real identity conflict found by the Phase XXVI sweep — the winget
  locale manifest claimed `Copyright (c) Vaerion contributors` against the
  LICENSE of record `Copyright 2026 Auren`; aligned. Package metadata gained
  the repository/bugs/homepage identity fields; `pyproject.toml` gained real
  `[project.urls]`.
- Documentation: the ASCENSION XXV baseline audit
  (`docs/ga/ASCENSION-XXV-BASELINE-AUDIT.md`) — every directive claim
  re-measured; two reality changes found and handled (public repository;
  the canonical bare mirror lost to an environment reset, lawfully
  re-provisioned, parity 0/0 re-measured).

## [0.1.12-rc1] — 2026-09-03 — the ASCENSION XX release (tag `888758a` → `485016f`): the verified engine became a measured developer ecosystem

- Added: installation surfaces exercised on an empty machine — universal
  installer (offline tarball), npm (user-prefix fallback), Python wheel,
  signed release tarball; pack-time audit packet (`dist/VERIFY.md` +
  `dist-report.json`, the signing key shipped beside the artifacts,
  manifest-bound — XX-D4 closed at root).
- Fixed (pinned by `packages/vaerion/tests/integration/ecosystem-journeys.test.ts`): XX-D5
  installer rc-file handling; XX-D6 the template registry as the one scaffold
  authority, demo `sources/` scaffolded, `vae run demo` default derived from
  the config of record; XX-D7 npm user-prefix fallback; XX-D8 reinstall no
  longer nests `src/src`; XX-D9 the npm success line runs the binary.
- Measured: the Empty Machine Test (D-Y) with per-leg evidence
  (`docs/ga/ASCENSION-XX-EMPTY-MACHINE-TEST.md`) — discover, offline install,
  verify + doctor, init, use-as-taught, recover (torn tail repaired; corrupted
  chain refused E1001; invalid record refused E1900), same-version upgrade,
  remove with user data preserved, npm and wheel consumers; release train
  end-to-end (reproducibility proven — byte-identical rebuild, 1,385,858
  bytes; Ed25519 self-verified; spot check reported `engine_version:
  0.1.12-rc1`); lockstep across 17 surfaces; EIGHT gates green (499/0/2976/39).

## [0.1.11-rc1] — 2026-09-02 — the ASCENSION XIX program close (constitution v1.6 A6)

- Added: remote protection law on the GitHub remote of record —
  `tools/remote-protect.ts` applies and probes branch protection (force-push
  refused by configuration; main deletion refused and live-probed; linear
  history; admins included); generated record:
  `docs/security/REMOTE-PROTECTION.md`.
- Added: CI truth — red gates name their failures (line-anchored markers,
  per-gate logs); the verification record uploads from Actions (hidden-file
  fix — root cause of six red runs on green trees); `ROADMAP_PROGRESS.md`
  generated from the measured record; counters derived, not hand-copied;
  staged required-check elevation measured — required checks proved
  incompatible with direct-push sync (PR-flow is a Founder decision, P4).
- Fixed: `journal.append` budget re-based 400 → 900 ms against the measured
  runner median (perf report gains `host`); eval-golden no longer re-blesses
  under ambient `VAE_BLESS`; 60 s timeboxes on real-harness tests.
- Measured: first fully-green remote CI runs (two consecutive); least-
  privilege workflow jobs; lockstep across 18 surfaces; EIGHT gates green
  (478/0/2853/37).

## [0.1.10-rc1] — 2026-09-02 — the GA campaign program close

- Measured: version lockstep extended to 18 surfaces (npm, python, macOS ×2,
  linux ×2, homebrew, winget ×3, pyproject, deb/AppImage scripts);
  `spec/openapi.json` regenerated via the sanctioned generator; SIX+2 gates
  green (443/0/2755/35; layerlint 104/500; constitutional 81 codes);
  milestone position of record — GA CAMPAIGN complete, PENDING FOUNDER GO.

## [0.1.9-rc1] — 2026-09-02 — the Founder four-phase program close

- Measured: local main == canonical main == GitHub main (`4b9aa9c`); release
  tagged at the lockstep commit, packed, Ed25519-signed, consumer-verified;
  lockstep across every measured surface; goldens re-blessed via the only
  sanctioned path (`VAE_BLESS=1`) — sole movement the `engine_version`
  hash-chain cascade; no contract shape change.

## [0.1.8-rc1] — 2026-09-02

- Fixed: release-tooling version drift — `tools/dist-pack.ts` hardcoded
  `VERSION` (`0.1.7-rc2`) and a stale sumTargets literal, so the first
  `0.1.8-rc1` pack produced a stale tarball name; the constant now derives
  from `ENGINE_VERSION` — lockstep by construction. The pack surfaced it.

## [0.1.7-rc2] — 2026-08-31 — Phase Ω (product refinement; no behavioral contract changes)

- Added: `vae provenance` — artifact evidence with digests recomputed from the
  bytes (`.vxn`, `vaerion.lock`, journal exports, release manifests); exit 5
  findings. Brand system (`tools/brand-render.ts`, `brand/BRAND-BOOK.md`) —
  byte-reproducible seal, wordmark, lockups, editions, icons, OG image.
- Added: terminal design language (`src/cli/ui.ts`) — TTY-gated rich
  rendering; plain and `--json` output contracts byte-stable and pinned;
  `VAE_UI` / `NO_COLOR` honored. Changed: `dev` substrate wording corrected to
  ADR-0018 Provisional; docs refresh (README, FAQ, QUICKSTART, security and
  beta docs, spec changelog).
- Measured: six gates green (290 tests / 1969 expectations; coverage floors
  86.00 lines / 90.84 branches).

## [0.1.7-rc1] — 2026-08-31 — public beta activation (Phase 1)

- Added: `docs/ga/FINAL-VERIFIED-REALITY-REPORT.md` — the zero-trust Phase 1
  audit and the PUBLIC BETA READY verdict, with named Founder-gated blockers
  (none code). This is the earliest tagged release in this repository.
- Added: release tooling `tools/dist-pack.ts` + `tools/dist-verify.ts` (signed
  distribution, sha256 + blake3 manifests).
- Fixed: the zero-trust audit falsified the inherited claims and repaired them
  at root — LICENSE (Apache-2.0 finalized), commit identity (moved to
  `Auren <auren@vaerion.dev>`), version lockstep (manifests said `0.1.0-ms1`
  while the spec series had reached `0.1.6`; enforced at 10 surfaces), and the
  inherited GA-dossier claim (none of those files existed; the real ones were
  built this phase). Measured: all six gates green at commit time (278 tests /
  1858 expectations — re-measured and confirmed true by the audit of record).
