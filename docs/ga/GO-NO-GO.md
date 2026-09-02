# Vaerion GO/NO-GO Dossier — archived at the Phase 10 boundary

| | |
|---|---|
| **Document** | The GO/NO-GO dossier of record (GA exit criterion, §7) |
| **Engine of record** | 0.1.10-rc1 at the program-close tag `v0.1.10-rc1` |
| **Authority** | P4 (human authority): this dossier PROPOSES; the Founder DISPOSES. No automation may issue a GO for GA. |
| **Inputs** | docs/ga/BURNDOWN.md · docs/ga/RELEASE-TRAIN-REHEARSAL.md · docs/ga/ACCESSIBILITY-AUDIT.md · docs/ga/FINAL-VERIFIED-REALITY-REPORT.md · .vaerion-verification.json · the §11 synchronization ledger |

## 1. The measured position

| Surface | Measurement | Label |
|---|---|---|
| Verification gates | EIGHT gates GREEN (443 pass / 0 fail / 2752 expectations / 35 files; coverage 86.52/90.60 vs floors 86/90) | VERIFIED |
| Release blockers §8 1–8 | all eight CLOSED | VERIFIED |
| Release train | rehearsed END-TO-END, all nine steps PASSED (pack → trust chain → npm install → installed-CLI lockstep → clean uninstall) | VERIFIED |
| Performance | seven engine-critical operations under typed budget ceilings, permanently gated | VERIFIED |
| Accessibility | nine structural invariants permanently gated; browser-measured audit clean (0 console errors, 0 overflow at 390/1280); contrast instrumentation and screen-reader passes not performed | VERIFIED / NOT MEASURED HERE (labeled per claim) |
| Trust chain | Ed25519-signed manifest binding every consumer artifact; consumer dist-verify ALL CHECKS PASSED; tamper probes historically proven (exit 1) | VERIFIED |
| Synchronization | local main == canonical main == GitHub main (measured 0/0); release tags identical by tag-object SHA on both remotes | VERIFIED |
| Substrate | TypeScript-on-Bun remains PROVISIONAL (ADR-0018) pending Founder ratification | F-4 |

## 2. The recommendation

**GO — for PUBLIC BETA v0.1.10-rc1.** The engineering position is measured
and honest: every gate is green, the release train is rehearsed end-to-end,
the trust chain verifies, the human surface is audited, and every claim
carries its label. Public beta is the state this repository has verifiably
reached.

**NO-GO — for full GA, today.** GA requires closing the Founder gates and
the platform-locked verifications that this environment cannot measure:

- F-2 full legal name in packaging authorship;
- F-3 the offline key ceremony (durable fix for R-2 — release signing must
  rotate to a held-offline key before strangers are asked to trust it);
- F-4 the substrate ratification decision (ADR-0018);
- F-5 the publish steps (npm/PyPI/brew/winget registries, installer URL);
- F-6 one sanctioned real-provider recording session per adapter (R-4);
- the four host-gated channels (brew, winget, dmg, rpm) verified on their
  platforms;
- GitHub-side branch protection + a real Actions run on the provisioned
  remote (currently NEVER EXECUTED on GitHub infrastructure).

Each is named with its owner. None is hidden inside a "done".

## 3. The GO decision block (P4 — for the Founder)

```
DECISION:            ☐ GO for GA     ☐ GO for public beta only     ☐ NO-GO
Preconditions due:   F-2, F-3, F-4, F-5, F-6; host-gated channel verification
Signed (Founder):    ______________________     Date: __________
Dossier prepared by: Auren — Principal Release Commander (measured, D-S)
```

The repository's own law is the decision's evidence base: **Repository
Reality wins. Constitution wins. Evidence wins.**
