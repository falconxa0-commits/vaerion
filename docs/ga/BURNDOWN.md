# Vaerion GA Burndown — Phase 10 (the GA gate)

| | |
|---|---|
| **Purpose** | The GA exit criterion "burndown complete" (§7): every release blocker, MS-6 item, and Founder gate reconciled to MEASURED status with honesty labels (D-S). No claim without a label. |
| **Constitution** | v1.4 A4 (the GA campaign); status of record reconciled at the Phase 10 boundary (A5) |
| **Engine of record** | 0.1.10-rc1 |
| **Method** | Every row is a measurement or a named gate; evidence points at the artifact of record |

## 1. Release blockers (§8 — absolute)

| # | Blocker | Status | Label | Evidence of record |
|---|---|---|---|---|
| 1 | All verification gates green | ✅ CLOSED | VERIFIED | EIGHT gates green on the campaign tree (443/0/2752/35; layerlint 104 files/500 edges; perf-budget; a11y-structural; constitutional C1–C7/81 codes; eslint clean) — `.vaerion-verification.json` |
| 2 | Journal verification green on golden + chaos fixtures | ✅ CLOSED | VERIFIED | Chaos suite + golden governance green inside the gates (443 tests, 35 files) |
| 3 | No secret material in the repository or history | ✅ CLOSED | VERIFIED | C5 secret scan green on every gate run; the Founder PAT lives OUTSIDE the repository (0600, git credential-store) and never entered the tree |
| 4 | Zero telemetry verified | ✅ CLOSED | VERIFIED | C6 zero-telemetry guard + C7 listener-egress-freedom green on every run (D-K) |
| 5 | Architecture boundaries verified by layer lint | ✅ CLOSED | VERIFIED | layerlint OK — 104 files, 500 runtime edges (perf/ L2 registered at Phase 7) |
| 6 | Constitutional verification green | ✅ CLOSED | VERIFIED | constitutional-check OK — 7 invariant checks, 81 catalog codes |
| 7 | Reports generated and truthful | ✅ CLOSED | VERIFIED | BUILD/VERIFICATION/ARCHITECTURE/ROADMAP_PROGRESS reports + tools/status.ts + site-data regenerated from live gates; the release digest is fail-closed (honest BLOCKED pre-tag) |
| 8 | Honesty labels on release claims (D-S) | ✅ CLOSED | VERIFIED | This burndown, the accessibility audit, the rehearsal report, and the GO/NO-GO dossier carry per-claim labels |

## 2. MS-6 exit criteria (§7)

| Item | Status | Label | Evidence |
|---|---|---|---|
| Reproducible bundles | ✅ complete | VERIFIED | ADR-0016: .vxn deterministic format; byte-identical rebuilds proven by test; vaerion.lock seal |
| Distribution packaging | ✅ complete | VERIFIED (4 channels) / UNVERIFIED (4 channels, host-gated) | npm, PyPI, universal installer, deb verified end-to-end (Phase 1 + Phase 9 rehearsal); brew/winget/dmg/rpm authored with UNVERIFIED markers — their host tooling does not exist in this environment (packaging/README.md verification matrix) |
| CI pipeline | ✅ complete | VERIFIED (workflow) / NEVER EXECUTED (GitHub Actions run) | .github/workflows/verify.yml re-runs the full gate suite through tools/verify.ts on every push; the workflow's EXECUTION on GitHub infrastructure is Founder-gated |
| Docs sweep | ✅ complete | VERIFIED | README/QUICKSTART/INSTALL/FAQ/TROUBLESHOOTING + verification-law and accessibility posture recorded |
| Performance double-check | ✅ complete | VERIFIED | Phase 7: the performance budget law — one deterministic harness, seven engine-critical operations, typed ceiling contracts, gate 6 `perf-budget` (worklog ASC-XVIII-PHASE-7) |
| Accessibility sweep | ✅ complete | VERIFIED | Phase 8: nine structural invariants as gate 7 `a11y-structural`, CLI color accessibility behavior-pinned, browser-measured audit (docs/ga/ACCESSIBILITY-AUDIT.md; 3 defects fixed at root) (worklog ASC-XVIII-PHASE-8-ACC) |
| Native single-binary installers | ⏳ host-gated | UNVERIFIED | The authored channels await their host platforms (brew/pwsh+winget/hdiutil/rpm absent here); engineering work is complete to the extent this environment can measure — the honest remainder is recorded, not hidden |

## 3. GA exit criteria (§7)

| Criterion | Status | Label | Evidence |
|---|---|---|---|
| Burndown complete | ✅ | VERIFIED | THIS document |
| GO/NO-GO archived | ✅ | VERIFIED | docs/ga/GO-NO-GO.md (the dossier of record) |
| Release train rehearsed | ✅ | VERIFIED | Phase 9: the REAL train PASSED end-to-end at v0.1.9-rc1 (nine steps; consumer trust chain; installed-CLI lockstep; clean uninstall) — docs/ga/RELEASE-TRAIN-REHEARSAL.md (worklog ASC-XVIII-PHASE-9) |

## 4. Founder gates (the human authority — P4; automation proposes, the Founder disposes)

| Gate | Status | Label | Note |
|---|---|---|---|
| F-1 GitHub remote + credentials | ✅ resolved | VERIFIED | Remote provisioned (falconxa0-commits/vaerion); PAT provided and secured outside the repo; synchronization VERIFIED (main 0/0, four tag SHAs identical — §11 synchronization ledger). Recommendation standing: rotate the chat-exposed PAT; enable GitHub-side branch protection |
| F-2 Full legal name (packaging authorship) | ⏳ open | OPEN | Packaging authorship uses the Auren identity; the legal name is the Founder's to supply |
| F-3 Offline key ceremony | ⏳ open | OPEN | The durable fix for R-2/R-3: release signing rotates to a held-offline Founder key; until then every pack discloses its session-bound bootstrap key (fp recorded in dist/VERIFY.md) |
| F-4 ADR-0018 ratification | ⏳ open | OPEN | The TypeScript-on-Bun substrate remains explicitly PROVISIONAL with a recorded migration path; the Founder ratifies or schedules the migration |
| F-5 Publish / announce / recruit | ⏳ open | OPEN | Registry publication (npm/PyPI/brew tap/winget) and the vaerion.dev installer URL are release-train publish steps |
| F-6 Real-provider cassettes | ⏳ open | OPEN | One sanctioned recording session per shipping adapter (needs provider credentials; R-4) |

## 5. Open engineering risks (docs/security/RISK-LEDGER.md)

| Risk | Severity | Owner | Status |
|---|---|---|---|
| R-1 exec-sandbox platform matrix (ADR-0015 full profiles) | high | Engineering | Open — post-rc hardening track |
| R-2 release signing bootstrap key | high | Founder | Open — closed by F-3 |
| R-3 circuit-breaker state across daemon restarts | medium | Engineering | Open |
| R-4 no real-provider cassette | medium | Founder | Open — closed by F-6 |
| R-5 SSE token rotation / journal-scoped tokens | medium | Engineering | Open |
| R-6 lock re-seal upgrade flow | low | Engineering | Open (documented workaround shipped) |
| R-7 public security-reporting channel | low | Founder | Open — partially unblocked (canonical + GitHub remotes now exist) |

## 6. The verdict of the burndown

**Every engineering close-out item of MS-6 and the GA preparation is complete
to the extent this environment can measure it.** The remainder to GA is
human authority, not engineering: the Founder gates F-2…F-6, the platform
verification of four authored channels, and the GO decision itself —
archived in docs/ga/GO-NO-GO.md.
