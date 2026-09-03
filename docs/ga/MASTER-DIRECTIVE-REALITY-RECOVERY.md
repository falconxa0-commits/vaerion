# MASTER DIRECTIVE — REALITY RECOVERY & EXECUTION PLAN

| | |
|---|---|
| **Document** | The D-V campaign records of record (constitution v1.7 A7, Phase 15) |
| **Campaign** | THE MASTER CONSTITUTIONAL DIRECTIVE — Phases 15–18 |
| **Authority** | Founder directive: "PROMPT 1 — THE LAW OF VAERION", Parts I–IV |
| **Honesty** | Every claim D-S labeled: VERIFIED (measured), UNVERIFIED (authored, not measurable here), NEVER EXECUTED |

---

## PART I — THE REALITY REPORT (D-V: measure before modifying)

Measured 2026-09-03 at campaign start. Zero inherited claims trusted; every
number below is a fresh measurement on the repository of record
(`/home/z/my-project`, branch `main`).

### 1. Located reality

| Surface | Measured state | Label |
|---|---|---|
| Local repository | `main` @ `723b625`, working tree clean (0 entries) | VERIFIED |
| Tags (local) | 6 release tags: `v0.1.7-rc1`, `v0.1.7-rc2`, `v0.1.8-rc1`, `v0.1.9-rc1`, `v0.1.10-rc1`, `v0.1.11-rc1` | VERIFIED |
| GitHub remote | `falconxa0-commits/vaerion` — `main` == `723b625` (identical); all 6 tag objects identical by `ls-remote`; `archive/parallel-generation` untouched as found | VERIFIED |
| Canonical remote | **STORE ABSENT FROM DISK** — `/home/z/vaerion-canonical.git` does not exist (second session-boundary loss); local tracking ref `canonical/main` == `723b625`, divergence 0/0 (last-known state) | VERIFIED (loss) |
| GitHub credentials | Token file was ABSENT at session boundary; restored to `/home/z/.vaerion-github-token` (mode 0600, OUTSIDE the repository); identity VERIFIED via `GET /user` → `falconxa0-commits` (id 294804743), scopes incl. `repo` + `workflow`; credential helper reads the 0600 file — the token never touches a command line or the tree | VERIFIED |
| Constitution | v1.6 RATIFIED at campaign start; v1.0…v1.6 all retained unmodified | VERIFIED |
| Phase ledger | D-T rows Ω, 0–14 all ✅ complete — the inherited session summary (claiming HEAD `89070c8`, tag `v0.1.8-rc1`, GitHub NEVER EXECUTED, Phases 2–7 PHANTOM) was STALE on every measured axis and is discarded as evidence | VERIFIED (correction) |
| Release train | `v0.1.11-rc1` (tag object `0a95fc5` → release commit `fd0941c`); `dist/` absent from the working tree (gitignored artifacts, session-boundary loss; regenerable via `tools/dist-pack.ts --ref v0.1.11-rc1`); `.vaerion-verification.json` ok:true | VERIFIED |

### 2. Measured verification state (the eight-gate baseline)

`bun tools/verify.ts` executed live at campaign start: **ALL EIGHT GATES GREEN**
— typecheck ×2, tests **478 pass / 0 fail / 2,853 expectations / 37 files**,
layerlint **104 files / 500 runtime edges (140 type-only exempt)**,
constitutional-check **7 invariants, catalog 81 codes**, perf-budget VERIFIED,
a11y-structural zero findings, repo-lint clean. Label: VERIFIED.

### 3. Real defects identified (the honest defect ledger)

| # | Defect | Root cause (Law 4 / D-V) | Class |
|---|---|---|---|
| D1 | Canonical store absent from disk at every session boundary (2nd occurrence) | The D-Q pre-receive hook and provisioning procedure were ad-hoc shell — **never versioned**; re-provisioning is manual, unverified, unrepeatable | Provisioning |
| D2 | CLI teaches stale law: `tour` step 9 and the welcome `learn` steps point at `VAERION_CONSTITUTION_v1.3.md` (two generations behind); `MAIN_HELP` and `dev.constitution` carry hand-copied version literals | The constitution-of-record path is hand-copied in four CLI sites while `tools/status.ts` already derives it — the derivation was never converged into the engine (D-B violation surface) | Stale literals |
| D3 | `dev.next_milestone` recommends the COMPLETED ASC-XIX program as next work | Editorial literal written mid-campaign, never reconciled at close | Stale literals |
| D4 | The GENERATED roadmap's "Recommended next work" item 1 recommends the COMPLETED ASC-XIX campaign (the exact twice-completed-work class Phase 11 killed, reborn) | `status.ts nextWork[0]` is a hand-authored campaign literal, not derived from the D-T ledger state | Stale literals |
| D5 | GitHub credential plumbing (token file + helper) lost at session boundary | Credential provisioning was manual and outside the repository's own tooling (accepted: secrets never enter the repo; the 0600-file pattern is the sanctioned one) | Environment (accepted, disclosed) |

### 4. Risks

- The canonical store's ABSENCE means D-Q's protection-law authority of record
  is unenforced until re-provisioned (Phase 17 closes this with probes).
- Host-gated surfaces remain honestly UNVERIFIED: brew/winget/dmg/rpm channels,
  wheel platform matrix, DMG/PKG/MSI install journeys (D-Y: labels stand).
- GA remains rehearsed and PENDING FOUNDER GO (P4) — untouched by this campaign.

---

## PART II — THE EXECUTION PLAN (D-V: plan before code)

Ratified as the A7 phase program (constitution v1.7 §11). One campaign, four
phases, law before implementation at every step.

### Phase 15 — the materialization (law first, §9.3)

- **What**: constitution v1.7 (A7) — decisions D-U…D-Y added to the register;
  v1.6 retained unmodified; pin tests moved and extended.
- **Architecture location**: `docs/constitution/VAERION_CONSTITUTION_v1.7.md`;
  `packages/vaerion/tests/integration/repo-intelligence.test.ts` (the law pin).
- **Verification**: pin tests assert v1.7, D-U…D-Y, the A7 record, Phases 15–18,
  and v1.6's retained-unmodified register; the full eight-gate suite green.

### Phase 16 — the live-reference law (kill the stale-literal class at root)

- **What**: ONE derivation of the constitution of record in the engine —
  `packages/vaerion/src/repo/constitution.ts` (highest ratified version present,
  fail-closed). The CLI welcome surface (`MAIN_HELP`), `dev` (`constitution`
  field + `next_milestone` text), and the `tour` teaching steps converge on it;
  `tools/status.ts` replaces its own derivation with the engine module (D-B:
  one authority). The generated roadmap's next-work item 1 becomes DERIVED from
  the D-T ledger state (no campaign in flight ⇒ the generated statement), so the
  report can never again recommend completed work.
- **Why**: defects D2, D3, D4 — one root cause (hand-copied law/campaign
  literals), one fix (derivation), the entire class removed.
- **Architecture location**: `packages/vaerion/src/repo/constitution.ts` (L2,
  pure, deterministic); consumers in `src/cli/vae.ts`, `src/cli/commands.ts`,
  `tools/status.ts` (the sanctioned engine→tools direction).
- **Verification**: contract tests pin the derivation (fail-closed throw, highest
  version, the consumers' paths are the derived ones); the first-run pins move
  with the surface; ROADMAP_PROGRESS.md + site-data regenerated from the GREEN
  record; eight gates green.

### Phase 17 — the provisioning law (close the session-boundary loss class)

- **What**: the D-Q canonical pre-receive hook versioned as law text in the
  engine — `packages/vaerion/src/repo/canonical.ts` (fast-forward-only `main`,
  refusal of `main` deletion, immutability of `v*` tags); ONE sanctioned
  provisioner and prover — `tools/canonical-provision.ts` (bare init, hook
  install, adversarial push probes: non-ff REFUSED, tag overwrite REFUSED, main
  deletion REFUSED, post-probe state unchanged; `--probe-only` face; D-S-labeled
  verdict; fail-closed exits). Executed for real: the canonical store
  re-provisioned at `/home/z/vaerion-canonical.git`, probed, synchronized
  (main + the six release tags pushed as NEW refs — no overwrites), divergence 0/0.
- **Why**: defect D1 — provisioning was unversioned ad-hoc shell; the fix makes
  re-provisioning deterministic, law-pinned, and self-proving (the entire class).
- **Architecture location**: hook text in L2 (`src/repo/canonical.ts`, pure);
  the applier in tools (the same layer as `remote-protect.ts`, the D-Q GitHub
  applier — TWO faces of ONE law, no duplicated logic).
- **Verification**: contract tests pin the hook text and probe semantics against
  scratch bare stores (non-ff push exits 1, tag overwrite refused, deletion
  refused); the real provisioning's probe verdict recorded in the §11
  synchronization ledger; eight gates green.

### Phase 18 — the program close

- **What**: D-T ledger rows 15–18 (operational); §11 synchronization-ledger rows
  (canonical + GitHub, measured); worklog entries for every phase; the
  verification record refreshed from the final green run; GitHub push (token
  identity already verified; branch protection state re-measured); remote state
  re-measured (`ls-remote` HEAD == `main` == local).
- **Verification**: divergence 0/0 both remotes; six tags identical all sides;
  the Remaining Reality Report (D-W) delivered to the Founder with honest labels.

### Boundary laws honored by this plan

- **D-R**: every green claim flows through `tools/verify.ts` — the one authority.
- **D-S**: every claim in the close report carries its label.
- **D-U**: this document IS the locate → measure → compare → identify record.
- **D-W**: the campaign closes with the five-section Remaining Reality Report.
- **D-X**: no readiness declaration beyond the measured statement of record.
