# Vaerion — Known Limitations

Every item below is derived from a measured record of this repository —
none is invented, and none is dressed as resolved. Source paths are cited
per item. Labels follow the campaign standard: **Measured** (evidence of
record), **Last-known** (recorded history, not re-measured), **UNVERIFIED**
(could not be measured; never claimed as verified).

---

## 1. Engineering limitations (open or unratcheted items)

From `ROADMAP_PROGRESS.md` — "Technical risks (top)" (generated from the
measured status of record; item numbering below matches that list):

1. **Substrate is provisional.** The TypeScript-on-Bun reference
   implementation is explicitly PROVISIONAL (ADR-0018) with a recorded
   migration path; Founder ratification is pending (see §3, F-4).
2. **Release signing uses the bootstrap Ed25519 key.** Rotation to a
   held-offline key is Founder-gated (`docs/security/RISK-LEDGER.md` R-2;
   see §3, F-3). Until then the bootstrap key is session-bound and
   disclosed wherever it is used.
3. **Exec-sandbox hardening is open.** The full per-platform sandbox
   profile matrix (ADR-0015) and per-run token scoping remain open
   engineering items (`docs/security/RISK-LEDGER.md` R-1/R-5).
4. **Journal durability/throughput trade.** Per-record fsync trades
   durability for throughput; a batching decision is needed before
   agent-scale testing (`ROADMAP_PROGRESS.md`).
5. **Provider price table is build-time data** (2026-08); provider drift
   is a data update with a reviewed contract change
   (`ROADMAP_PROGRESS.md`).
6. **zstd determinism is toolchain-scoped.** Byte-determinism holds for
   the pinned level (19) on the current toolchain; a toolchain bump could
   change bytes — the format version in the magic is the escape hatch,
   never a silent rebuild (`ROADMAP_PROGRESS.md`).
7. **Breaker state is per-process by design.** Failures are journaled;
   breaker state is not. Multi-process sharing is a daemon concern
   needing an ADR (`ROADMAP_PROGRESS.md`).
8. **Coverage floors are total-based.** Per-module ratchets are a
   mechanical follow-up; totals only move up (`ROADMAP_PROGRESS.md`).
9. **MS-6 leftovers** (`ROADMAP_PROGRESS.md` — "Recommended next work"):
   native single-binary installers (host-gated; see §2) are not done. The
   daemon packages route group (pack/verify/import) **is done** — ASCENSION
   XXVI+ closed it with wire-parity tests and `spec/openapi.json`
   regeneration; `package.imported` joined the event registry additively.

## 2. Platform verification gaps (UNVERIFIED until their hosts run them)

The packaging files themselves carry honest UNVERIFIED markers; the
verification matrix of record is `packaging/README.md` (measured
2026-08-31).

- **Homebrew / winget / .dmg / .pkg / rpm / AppImage channels: authored +
  reviewed only — UNVERIFIED** until their host tooling executes them
  (`packaging/README.md`; carried in
  `docs/ga/ASCENSION-XX-REALITY-RECOVERY.md` §6 D-W carry-forwards).
  Windows (`packaging/windows/`) and macOS (`packaging/macos/`,
  incl. `SIGNING-PREP.md`) are authored; Developer ID signing and
  notarization are additionally gated on the key ceremony (F-3).
- **Cross-version upgrade: UNVERIFIED** — a single release lineage per
  host session was measured; same-version upgrade was measured clean
  (`docs/ga/ASCENSION-XX-REALITY-RECOVERY.md` §6; the Empty Machine Test
  leg of record is `docs/ga/ASCENSION-XX-EMPTY-MACHINE-TEST.md`).
- **twine check: UNVERIFIED** — the host lacks twine; the Python wheel
  itself was built and its install verified offline
  (`docs/ga/ASCENSION-XX-REALITY-RECOVERY.md` §6).
- **Container and multi-CI templates (Dockerfile, .gitlab-ci.yml,
  Jenkinsfile, .devcontainer): authored against the verified gate
  contract — UNVERIFIED until a container host / GitLab / Jenkins agent
  builds and runs them.** The entrypoint path and the frozen-lockfile
  contract are verified against the tree; execution is not (honest
  markers inside `Dockerfile`).
- **GitHub branch protection: BLOCKED by plan** — API 403 "Upgrade to
  GitHub Pro or make this repository public" (measured; worklog.md Task 3
  entry). A Founder decision (public repo or Pro plan) is required;
  nothing the engine can do.

## 3. Founder-gated items (P4 — no automation may close these)

From `docs/ga/GO-NO-GO.md` §2 and `docs/ga/FINAL-VERIFIED-REALITY-REPORT.md`
§4 (with severity and exit criteria):

- **F-2 — Full legal name.** Packaging authorship carries the consistent
  `Auren` identity; the legal-name insertion is a one-line Founder
  follow-up.
- **F-3 — The offline key ceremony.** Release signing must rotate from
  the bootstrap Ed25519 key to a held-offline key before strangers are
  asked to trust it (`docs/security/RISK-LEDGER.md` R-2). Until F-3, CI
  release artifacts honestly disclose the bootstrap key generation (the
  CI pack report says "bootstrap key GENERATED this run — session-bound,
  disclosed"; measured, worklog.md Task 3 entry).
- **F-4 — Substrate ratification.** ADR-0018 (TypeScript-on-Bun) remains
  PROVISIONAL pending the Founder decision; migration path recorded.
- **F-5 — Publication.** npm/PyPI/homebrew-core/winget submissions,
  installer URL, announce, and beta recruitment are release-train steps
  the Founder executes (`docs/ga/PHASE-XXIII-PUBLICATION-GAP-AUDIT.md`
  lists registry publication and hosted deploy as BLOCKED in-sandbox).
- **F-6 — Real-provider cassettes.** One sanctioned recording session per
  adapter with provider credentials (`docs/security/RISK-LEDGER.md` R-4)
  — required for end-to-end golden coverage of the ModelPlanner success
  path (`ROADMAP_PROGRESS.md` risk 6).

GA remains rehearsed and PENDING FOUNDER GO (P4)
(`docs/ga/GO-NO-GO.md` §3 decision block;
`ROADMAP_PROGRESS.md` milestone board: GA 95%, pending).

## 4. Environment limitations (this workspace, not the product)

- **No provider network.** This environment has no access to model
  providers; hermetic coverage uses MockBrain/cassettes, and real-provider
  recording (F-6) cannot happen here (`ROADMAP_PROGRESS.md` risk 6;
  `docs/ga/ASCENSION-XX-EMPTY-MACHINE-TEST.md`).
- **Ephemeral host session boundaries.** `/home/z` is wiped outside the
  checkout: the canonical bare store and env-only credentials do not
  survive boundaries. Both losses are handled by law, not luck — the
  canonical store restores deterministically (provision → synchronize →
  adversarial probe, measured three times) and GitHub state is recorded
  UNVERIFIED when `VAE_GITHUB_TOKEN` is absent, never dressed
  (`docs/ga/ASCENSION-XX-REALITY-RECOVERY.md` §2.1, §3 XX-D1/XX-D2, §6).
- **Recorded blemish, retained by law.** History is immutable under the
  protected-main law: commit `03996c6` carries a UUID for a message
  (session artifact from between phases), recorded rather than rewritten
  (`docs/ga/FINAL-VERIFIED-REALITY-REPORT.md` Ω.5).

---

*If a limitation above has been closed by later work, the closing record
lives in `worklog.md` and the phase ledgers — this file defers to the
records, and any stale line here is a defect to be fixed, not a claim to
be defended.*
