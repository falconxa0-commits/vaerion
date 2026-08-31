# PHASE 0 — FOUNDATION AUDIT (ASCENSION XVIII)

**Date of record:** 2026-08-31 (gate evidence timestamped 21:18 UTC)
**Auditor:** Principal Vaerion Architect + Repository Auditor (zero-trust protocol)
**Head audited:** `f3cab62b8d5c48f3d2a93a58c3928bda445b9f3f` (main, working tree clean at audit start)
**Method:** nothing was assumed from the briefing, from the worklog, or from prior reports. Every number below was re-measured on this tree during this session. Where a claim could not be re-measured, it is marked as such — never represented as verified.

---

## 0. Verdict in one paragraph

The repository reality **matches the inherited state on every code-level claim**: v0.1.7-rc2, six gates green, 290/290 tests, coverage floors held, the Phase Ω brand/CLI/provenance work is present and reproducible. What does **not** survive is the **environment-bound trust chain**: the canonical bare store, the bootstrap signing key, and the `dist/` release artifact set are all absent from this session (they live outside the worktree by law and were lost at the session boundary — the third such occurrence on record). These are recovery operations, not features, and they are sequenced in §5. No new feature work is warranted before they close.

---

## 1. Repository structure (mapped)

### 1.1 Top level — 313 tracked files

| Area | Files | What it is (measured) |
|---|---|---|
| `packages/vaerion/` | 132 | The engine: 17 subsystems, 95 source files / 17,496 lines, 25 test suites, fixtures, cassettes |
| `src/` | 56 | Next.js status dashboard (app router) — the public web face fed by `site-data/vaerion-status.json` |
| `docs/` | 32 | Constitution, 21 ADRs (+README), security dossier ×3, ga/ reports, QUICKSTART/INSTALL/FAQ/TROUBLESHOOTING, master blueprint |
| `brand/` | 20 | BRAND-BOOK.md + BRAND-BOOK.pdf, 12 SVG masters (+4 edition variants), 6 PNG renders, terminal ASCII mark, og-image |
| `spec/` | 14 | Contracts: openapi.json, 9 JSON schemas, errors.yaml (67 codes), event registry (24+ types), WIT world, changelog |
| `tools/` | 9 | verify / layerlint / constitutional-check / dist-pack / dist-verify / gen-openapi / status / brand-render (+package.json) |
| `public/` | 9 | Web identity: favicon.svg, favicon-32, apple-touch-icon, icon-192/512, logo.svg, og-image.png/svg, robots.txt |
| `sdks/typescript/` | 5 | The wire SDK (daemon client — the single sanctioned loopback client site) |
| `examples/` | 7 | vaerion-demo workspace (executed end-to-end last phase) + websocket demo |
| `tests/` | 3 | Root-level runtime build scripts (database/python) |
| Root reports | 8 | README, CONTRIBUTING, BETA-ONBOARDING, BUILD/VERIFICATION/ARCHITECTURE_REPORT, ROADMAP_PROGRESS, worklog |
| Config & meta | ~15 | package.json (workspaces), bunfig (coverage floors), tsconfigs, eslint, CI workflow, Caddyfile, LICENSE (Apache-2.0), .gitignore, keys/release-signing.pub |

### 1.2 Engine layer map (measured via `vae dev --json` + layerlint)

- **L0** kernel (errors, ids, clock, canonical, redact, hash) · config
- **L1** spine · journal · store(blob-cas) · receipts · broker/contracts · gateway
- **L2** runtime(run) · research · agents · workflow · evals · extensions · package
- **L4** cli (+ api, sdk surface)
- Subsystem file counts: research 13 · gateway 13 · journal 10 · broker 10 · agents 9 · kernel 6 · cli 6 · spine 5 · package 5 · api 5 · workflow 3 · extensions 3 · evals 2 · store/runtime/receipts/config 1 each
- layerlint: **95 files, 453 runtime edges (132 type-only exempt) — boundaries hold**

### 1.3 Git topology (measured)

```
03996c6  (UUID message — historical blemish, recorded)
   ↓
9d6cbd2  release: PHASE Ω luxury edition … (v0.1.7-rc2)   ← tag v0.1.7-rc2 (annotated obj 9a0e2d0, tagger Auren)
   ↓
6ab6068  release(artifacts): trust-chain-complete v0.1.7-rc2 artifact set — manifest v2
   ↓
f3cab62  (UUID message; touches only .vaerion-verification.json)   ← HEAD/main
```

- Tag `v0.1.7-rc2` is an ancestor of HEAD (verified `merge-base --is-ancestor`). Tag `v0.1.7-rc1` → `82615ca` (recorded).
- Version lockstep **0.1.7-rc2 measured in all four package.json files and the CLI `VERSION` constant.**

---

## 2. Measured verification baseline (live, this session)

| Gate | Result | Measured |
|---|---|---|
| G1 typecheck-engine | GREEN | 3,584 ms |
| G2 typecheck-sdk | GREEN | 3,135 ms |
| G3 tests + coverage floors | GREEN | **290 pass / 0 fail / 1,969 expectations / 25 files** (2.6 s) |
| G4 layerlint | GREEN | 29 ms — 95 files, 453 edges |
| G5 constitutional-check | GREEN | 261 ms — 7 invariants (C1–C7), catalog 67 codes, 0 violations |
| G6 repo-lint | GREEN | 9,250 ms — eslint clean |

- **Coverage (re-measured):** All files **86.00% lines / 90.84% branches** — floors (0.86/0.74/0.86/0.90 in bunfig) held exactly.
- Gate run emitted `.vaerion-verification.json` `ok:true` at 2026-08-31T21:18:57Z.

### 2.1 Product-level live probes

| Probe | Result |
|---|---|
| Brand generator idempotence | `bun run tools/brand-render.ts` re-run → **zero byte drift** in brand/ + public/ (only the expected verification-json change in the tree). Byte-reproducibility claim independently re-proven. |
| CLI plain contract | `vae dev --plain` → structured, aligned output (command/engine_version/substrate/layers L0–L4) |
| CLI JSON purity | `vae dev --json` → single-line NDJSON, pure JSON, stable `command` field first |
| Exit-code contract | `vae package verify <missing>` → **exit 2 (usage)** with E1600 educated line; `vae --help` → **exit 0** |
| Web face | Live HTTP 200 on the dashboard; title, seal, ALL-GATES-GREEN badge, engine 0.1.7-rc2 badge, data-driven roadmap/gates/inventory/footer all rendered; **zero console errors**; full-page screenshot retained (/tmp/vaerion-dashboard.png) |
| Dashboard inventory vs reality | "95 files · 17,496 lines / 290 tests · 1969 expectations / 14 spec · 21 ADRs / 8 tools · 3 sdk" — **matches this audit's independent counts** |

---

## 3. Claimed state vs measured reality

| Inherited claim | Measured | Status |
|---|---|---|
| Version v0.1.7-rc2 | 4×package.json + CLI VERSION + tag + changelog | **CONFIRMED** |
| Phase Ω COMPLETE | Commit 9d6cbd2 (+2,899/−134, 63 files), brand/ 20 files, cli/ui.ts 1,063-line design system, `vae provenance` in MAIN_HELP | **CONFIRMED** |
| Six gates GREEN | Re-run this session — all green | **CONFIRMED (live)** |
| Tests 290/290 | 290 pass / 0 fail / 1,969 expectations | **CONFIRMED (live)** |
| Coverage floors maintained | 86.00 / 90.84 vs floors 0.86 / 0.90 | **CONFIRMED (live)** |
| CLI design system completed | 6 files / 3,520 lines; TTY-gated rich path; plain contract byte-stable (legacy assertions pass unmodified — recorded); JSON purity re-proven live | **CONFIRMED** |
| Provenance system completed | `vae provenance` documented in help; E2205 cross-checks wired (recorded); command present | **CONFIRMED** (artifact-level re-proof pending P4 — needs a real artifact) |
| Release artifacts completed | tarball/vxn/MANIFEST/SHA256SUMS/VERIFY.md **absent from this environment** (`dist/` gitignored, lost at session boundary) | **LOST — RECOVERY REQUIRED** |
| (implicit) canonical remote | `/home/z/vaerion-canonical.git` **does not exist** right now | **LOST — RECOVERY REQUIRED** |
| (implicit) signing key | `keys/release-signing.key` absent (untracked by law) | **LOST — BOOTSTRAP REGEN REQUIRED** |

---

## 4. Findings register

| # | Finding | Severity | Root cause / note |
|---|---|---|---|
| R-1 | Canonical bare store absent (3rd environment loss on record) | HIGH (release-infra) | Store lives outside the worktree; sandbox boundary wipes it. Protected-main hook + adversarial proofs recorded historically, not re-provable until re-provisioned. |
| R-2 | v0.1.7-rc2 artifact set absent from environment | HIGH (release-infra) | `dist/` gitignored by law; original **signed** set unrecoverable (key lost — R-3). Tarball/vxn rebuild deterministically; manifest signature will bind a NEW bootstrap key (fingerprint change must be disclosed). |
| R-3 | Bootstrap signing key absent | MEDIUM | Untracked by law; the durable fix remains the Founder key ceremony (F-3). Until then every pack regenerates a fresh bootstrap pair — honest, disclosed, but the fingerprint is not stable across sessions. |
| R-4 | `vae dev` `next_milestone` is stale | LOW (honesty-adjacent) | Still names PHASE Ω / "toward release v0.1.7-rc2" as future work although Ω shipped and rc2 is tagged. One string + one pinned expectation. |
| R-5 | UUID-message commits `03996c6`, `f3cab62` | COSMETIC (immutable) | History immutable under protected-main law; recorded, not rewritten. `f3cab62` touches only the auto-generated verification json. |
| R-6 | Dashboard data snapshot older than this audit's gate run | LOW | site-data shows the 12:45 UTC run; this audit ran 21:18 UTC. `tools/status.ts` regeneration closes it (plan P2). |
| R-7 | Constitutional gate is C1–C7 (7 invariants) | INFO | Documentation-freshness (formerly referenced as C8) is **not** an automated invariant today; docs freshness rests on the regeneration discipline. Recorded so nobody claims an automated C8 exists. |
| R-8 | Background processes do not survive the tool-call boundary in this sandbox | INFO (operational) | Affects long-running local services (dev server persisted only because it was already running); packaging/verify runs must be synchronous. |

**Withdrawn during audit:** a suspected empty `<li>` in the dashboard "Recommended next work" list — false alarm (a11y-snapshot truncation by the auditor's own log slicing; `nextWork[0]` is a full sentence in site-data). Recorded because hiding a withdrawn finding would be worse than the finding.

---

## 5. Execution plan (recovery & truth — NO new features)

Order and dependencies; every step ends with the relevant gate(s) re-run.

- **P0 — this commit.** Audit report + worklog entry + regenerated `.vaerion-verification.json` committed as `Auren <auren@vaerion.dev>`. *(done with this document)*
- **P1 — CLI truth (R-4).** Advance `dev.next_milestone` to the post-Ω truth (Ω complete, v0.1.7-rc2 tagged; MS-6 close-out + release train remain). Update the pinned test expectation. Gates: G1–G3.
- **P2 — data truth (R-6).** `tools/status.ts` regeneration of `site-data/vaerion-status.json` + dashboard from the audit gate run; browser re-check of the gates panel + version badge. Gate: G6.
- **P3 — remote truth (R-1).** Re-provision `/home/z/vaerion-canonical.git` with the same protected-main pre-receive law (fast-forward-only main; main deletion refused; `v*` immutable); push main + both release tags; assert divergence ZERO; re-run the adversarial probes (force-push rejected, tag overwrite rejected).
- **P4 — artifact truth (R-2, R-3).** Generate a fresh bootstrap Ed25519 pair (env-provisioned, disclosed); `dist-pack` at tag `v0.1.7-rc2`; consumer `dist-verify` → ALL CHECKS PASSED; tamper probes (checksum lie → exit 1; manifest tamper → signature failure); publish the NEW key fingerprint with an explicit note that the previous fingerprint `sha256:9c6661f8…` is historical.
- **P5 — final closure.** Full `tools/verify.ts` re-run → ALL GATES GREEN on the final tree; audit addendum appended if any step above moved a file.

**Founder-gated (unchanged from the ledgers; not executable by engineering):**
F-1 GitHub remote + credentials · F-2 full legal name · F-3 offline key ceremony (the durable fix for R-3) · F-4 ADR-0018 ratification · F-5 publish/announce/recruit · F-6 real-provider cassettes.

---

## 6. Recommendation

Proceed with **P1 → P5** exactly as sequenced. The codebase needs no feature work and no repair: it is measured, green, and reproducible. The only honest blockers between this tree and a repeatable "ready" statement are the environment-bound trust chain (R-1/R-2/R-3) and one stale string (R-4) — all closed by the plan above. Nothing in this audit weakens the recorded verdict **PUBLIC BETA READY — v0.1.7-rc2**; it confirms it on live evidence and restores the pieces the environment took away.

---

*Audit method note: this document was produced under the zero-trust protocol — measure first, claim nothing unmeasured, record withdrawn findings. The only inherited claims accepted without live re-proof are those explicitly marked as historical (canonical hook proofs, the original rc2 signature fingerprint, plain-contract byte stability at the Ω rewrite — the latter additionally pinned by the suite).*