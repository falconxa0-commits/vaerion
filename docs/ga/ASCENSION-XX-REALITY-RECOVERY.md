# ASCENSION XX — Reality Recovery, Defect Ledger, and Execution Plan

> Status: CAMPAIGN RECORD OF RECORD — committed BEFORE implementation (constitution v1.7, D-V).
> Standard: every claim is D-S labeled — **Measured** (evidence of record), **Last-known** (recorded
> history, not re-measured this session), **UNVERIFIED** (could not be measured; never dressed as
> verified). Honesty above appearance (LAW 6).

## 1. The receipt of the directive — measured, including its limits

The Founder's ASCENSION XX directive was received **truncated at LAW 3** ("ARCHITECTURE MUST
REMAIN SACRED. The architecture:" — the transmission ends there). The remainder of the directive
text is **UNAVAILABLE**, and per the No Fabrication law it is NOT reconstructed or invented.
What was received and is binding:

- LAW 1 — Reality Before Implementation (re-affirms register law D-U).
- LAW 2 — Vaerion Identity (AI-native developer operating system; CLI-first; NOT a marketplace
  of disconnected features, NOT cloud-only).
- LAW 3 — Architecture Must Remain Sacred (re-affirms the ONE PIPELINE and D-C/D-D).
- The mission statement, received in full: transform the verified engine into a developer
  platform that **installs everywhere, works instantly, feels premium, and can survive
  independent audit**.

The execution program below is therefore derived from (a) the received directive content and
(b) the register law of record (constitution v1.7) — the campaign **executes existing law**.
If a law gap is discovered mid-campaign, the constitution is amended FIRST (§9.3: v1.8),
before implementation. The received-but-unavailable remainder of the directive is recorded here
rather than paraphrased.

## 2. Reality Recovery — measured this session (2026-09-03)

### 2.1 Located reality

| Axis | Measured | Verdict vs inherited claims |
|---|---|---|
| Working tree | `main` @ `b6c5fac`, clean | MATCH (program-close claim) |
| Constitution of record | v1.7 (highest ratified file in `docs/constitution/`) | MATCH |
| Eight verification gates | GREEN live — 486 pass / 0 fail / 2942 expectations / 38 files; layerlint 106 files OK; constitutional-check 7 invariants OK; perf-budget OK; a11y-structural OK; repo-lint OK; exit 0 | MATCH (478→486 progression recorded) |
| D-T phase ledger | Ω + rows 0–18 complete (roadmap generated from the GREEN record) | MATCH |
| Release tags | Six: v0.1.7-rc1, v0.1.7-rc2, v0.1.8-rc1, v0.1.9-rc1, v0.1.10-rc1, v0.1.11-rc1 | MATCH |
| Canonical store | **ABSENT from disk at session boundary** (third occurrence; ephemeral host). Restored THIS SESSION via the Phase 17 deterministic law: provisioned → main + six tags pushed as NEW refs → divergence 0/0 → adversarial probe: non-ff REFUSED, main deletion REFUSED, tag overwrite REFUSED, tag deletion REFUSED, post-probe UNCHANGED, exit 0. Six tags byte-identical local↔canonical (`4c20529…0a95fc5`). | LOSS RESTORED UNDER THE LAW |
| GitHub remote | Live `ls-remote` **UNVERIFIED this session**: `VAE_GITHUB_TOKEN` (the env-only discipline, `tools/remote-protect.ts`) is absent — the 0600 credential file is session-bound and did not survive the boundary; no env var, no helper, no file. Last-known (recorded history, program close): main == `b6c5fac`, protection descriptor measured, two consecutive green runs. | UNVERIFIED — honestly carried, never dressed |
| Web surface | Dev server on :3000, `GET /` → 200; dashboard renders from `site-data/vaerion-status.json` regenerated 2026-09-03T15:51Z from the GREEN record | MATCH |
| Release artifacts | `dist-pack` re-run live: reproducibility PROVEN (two builds byte-identical, 1,373,492 bytes), Ed25519 self-verified (bootstrap key, the disclosed session-boundary pattern), full artifact set emitted | MATCH |

### 2.2 Verdict on inherited claims

The inherited program-close claims (ASC-MD Phases 15–18) were **measured accurate** on every
axis reachable without network credentials. No phantom work was found. The two session-boundary
losses (canonical store, credentials) are the *known* ephemeral-host class, not new defects:
- The canonical loss recurs by design of ephemeral hosts; the Phase 17 root-cause fix is PROVEN
  by this restoration (one deterministic command + one probe, minutes, zero ad-hoc shell).
- The credential absence is the accepted D5 pattern (secrets never enter the repository);
  GitHub live-state stays UNVERIFIED until the Founder re-provisions `VAE_GITHUB_TOKEN`.

## 3. Defect ledger (D-V root-cause form — campaign-scoped)

| ID | Defect | Root cause | Status |
|---|---|---|---|
| XX-D1 | GitHub live-state unverifiable at session boundary | Env-only token discipline + session-bound 0600 file (the sanctioned pattern; secrets never in the repo) | ACCEPTED (carried forward from MASTER-DIRECTIVE D5; disclosed, not fixable in-repo) |
| XX-D2 | Canonical store absent at session boundary (3rd occurrence) | Ephemeral host wipes `/home/z` outside the checkout | CLOSED AT ROOT (Phase 17 law); this session's restore is the proof, recorded as operational event |
| XX-D3 | The true install-ability of every ecosystem surface on a fresh machine | **UNKNOWN — never measured end-to-end in one campaign.** Authoring + targeted tests exist (Phase 1, MS-6); the D-Y Empty Machine Test has never been executed as a connected whole | MEASURED IN PHASE 19 (this campaign's reason to exist) |

## 4. Execution plan (Phases 19–22 — ratified as the ASCENSION XX program of record)

### Phase 19 — The Empty Machine Law, executed for real (D-Y)
- **What**: a fresh-machine simulation — clean `$HOME`, no ambient state — runs the connected
  install chain end-to-end: `packaging/install.sh` (source + npm + offline tarball methods,
  `--uninstall` round-trip) → `vae init` first-run → the npm package built from `packaging/npm`
  → the Python wheel built from `packaging/python` (twine check if available) →
  `dist-verify` as a consumer against the packed artifacts.
- **Where**: `packaging/*`, `tools/dist-pack.ts`, `tools/dist-verify.ts`,
  `packages/vaerion/src/cli/` (first-run), `docs/INSTALL.md`.
- **Verification**: every surface's measured result recorded; XX-D3's ledger filled from
  measurements only. A surface that cannot be verified on this host is labeled UNVERIFIED
  (host-gated), never COMPLETE.

### Phase 20 — Ecosystem defect closure
- **What**: root-cause fix of every defect Phase 19 measured, each pinned by a test; authored-
  UNVERIFIED platform surfaces (brew/winget/dmg/rpm) get structural validation strengthened so
  the maximum verifiable-on-this-host subset is verified.
- **Where**: as measured by Phase 19 (expected: `packaging/*`, `tools/*`, CLI surfaces).
- **Verification**: full eight-gate suite green including the new pins.

### Phase 21 — The audit-premium surface
- **What**: the human surfaces survive an audit and feel premium: the web dashboard audited
  (responsive, sticky-footer law, a11y, honest data), docs coherence (INSTALL/QUICKSTART/FAQ/
  TROUBLESHOOTING teach truth derived from the record, no stale literals — the Phase 16 class).
- **Where**: `src/app/page.tsx`, `site-data/*`, `docs/*`, `brand/*`.
- **Verification**: a11y-structural gate + browser-verified rendering + doc-truth pins.

### Phase 22 — Program close
- **What**: eight gates green on the final tree; canonical synchronization + adversarial probes;
  §11 synchronization-ledger rows; version decision (bump only if release-surface code changed);
  worklog append; the D-W Remaining Reality Report.
- **Where**: `.git`, constitution §11, `worklog.md`, `docs/ga/`.
- **Verification**: the record chain (verify → status → roadmap → site-data) regenerated from
  the GREEN close; GitHub synchronization executed live if credentials reappear, else recorded
  UNVERIFIED with the exact state left in the tree.

## 5. The declaration standard (D-X)

Campaign close may declare only what §4's verification methods measured. The declaration of
record at close will be one of: progressing toward readiness / ecosystem-complete pending
Founder gates — chosen by measurement, not aspiration.
