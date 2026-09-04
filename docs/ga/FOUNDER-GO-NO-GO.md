# Founder Go/No-Go Decision Packet — the ASCENSION XXV close

| | |
|---|---|
| **Document** | The P4 decision packet: what is finished, what remains, why, and whether Vaerion is objectively GA-ready |
| **Authority** | P4: this packet PROPOSES; the Founder DISPOSES. No automation may issue a GO for GA. |
| **Inputs** | `docs/ga/FINAL-GA-AUDIT.md` · `REMAINING-REALITY-REPORT.md` · `RELEASE-CERTIFICATION.md` · `FINAL-SECURITY-AUDIT.md` · `INFRASTRUCTURE-REPORT.md` · `DISTRIBUTION-REPORT.md` · `PLATFORM-MATRIX.md` · the worklog (Tasks 1–10) · `.vaerion-verification.json` |

## 1. GA readiness — measured, not estimated (15 axes, re-scored at this close)

| Axis | Score | Evidence (measured) |
|---|---|---|
| Architecture | 9/10 | layerlint GREEN (107 files, 504 edges); single pipeline; thin clients; the gateway hardened (mid-stream swallow fixed at root); the one deliberate provisional: ADR-0018 substrate (F-4) |
| Constitution | 9/10 | gates green through every phase; every campaign recorded with evidence; the amendment path exercised lawfully; the harness polices its authors (GA-5/6/7 in the defect ledger) |
| Verification | 10/10 | **530/0/42**, exit 0, fresh at every boundary; the new provider-compat suite pins both wire legs per provider; changelog automation pinned |
| Security | 9/10 | **R-2 CLOSED** — production key live, ceremony law recorded; branch protection live; supply chain pinned, repo clean, releases verified three ways; residuals low and named (Dependabot, SHA-pinning, admin bypass) |
| Documentation | 9/10 | the docs universe + operations law + identity layer + platform/provider/distribution records; every documented command/flag verified live; hosted docs site = F-5 |
| Packaging | 10/10 | **all 22 version-bearing surfaces authored and CI-locked** — every channel the directives ever named now exists with an honest marker |
| Installers | 7/10 | GitHub Releases = a certified install surface; deb re-verified; source/npm/wheel/installer journeys measured; native channel execution remains host-gated (honestly UNVERIFIED) |
| Developer Experience | 9/10 | unchanged from the measured close: registry help, E-codes, exit codes, completions ×4, renderer-owned errors, NO_COLOR/TTY invariants |
| Accessibility | 8/10 | nine structural invariants gated; dashboard browser-verified at two widths (zero errors/overflow); screen-reader passes still NOT performed (labeled) |
| Performance | 9/10 | seven engine-critical operations under typed budget ceilings, permanently gated, CI re-measured |
| Ecosystem | 9/10 | provider compatibility now pinned on BOTH legs (success + failure) for every shipping adapter; discussions live; six channels authored beyond the verified core |
| Publication | 8/10 | **the public Release is LIVE** with the certified artifact set; the announcement flow proven (discussion #1); rc honesty on the discovery surface; registries + hosted site = F-5 |
| Release Engineering | 10/10 | the release train is END-TO-END MEASURED: tag → CI → deterministic re-pack → publish refusal guard → public Release → three-way consumer verification → announcement; rollback law recorded |
| Community Readiness | 8/10 | Discussions (6 categories) live with the routing law; issue/PR templates; the announcement flow; CoC + contribution license terms |
| Support Readiness | 8/10 | SUPPORT.md + TROUBLESHOOTING + FAQ + `vae doctor` + the Q&A surface; no hosted desk (stated) |

**Composite: 8.8 / 10** (was 8.1 at the Public Beta close) — the measured state
of a repository whose engineering gap to GA is now five small items plus
Founder/external gates.

## 2. What changed in this campaign (Founder-facing summary)

1. **Release trust became permanent** — the bootstrap-key era is over: a
   production key signs releases from CI, the key of record is rotated, and
   the ceremony law (rotation, recovery) exists before it is needed.
2. **The product is publicly consumable** — v0.1.13-rc1 is live on GitHub
   Releases; a stranger with no account can download, verify three ways
   (including with openssl, independently), and run it; the announcement flow
   is proven.
3. **The publication pipeline is guarded** — the publish job refuses to ship
   a release that was not production-signed; rc releases are honestly
   flagged; the notes of record are the Release body.
4. **Every distribution channel now exists** — Flatpak, Snap, Chocolatey,
   Scoop joined the register (22 surfaces, CI-locked lockstep).
5. **A real engine defect was caught and fixed** — a mid-stream provider
   error was silently recorded as success; now it is a loud E1601 failure,
   pinned forever by the failure-leg cassettes.
6. **The legal identity layer exists** — LEGAL.md, one real conflict fixed,
   the F-2 pseudonym disclosure with its future sweep documented.
7. **Branch protection is on** — the plan-blocked item converted when the
   repository went public (measured, not assumed).
8. **Everything is recorded** — ten worklog tasks, a ten-entry defect ledger
   (including the auditor's own), and the measured audit set in `docs/ga/`.

## 3. What remains (complete list — nothing omitted)

- **Engineering (small, named)**: REMAINING-REALITY-REPORT §4 — five items
  (Dependabot + SHA-pinning, the cross-version upgrade leg, coverage
  ratchets, the daemon packages routes, nushell/xonsh completions).
- **Founder-gated**: F-2 (legal name), F-4 (substrate ratification), F-5
  (registries + hosted site), F-6 (live provider recordings), R-7 (public
  security channel).
- **External**: registry/store reviews; host executions (Windows/macOS/
  distros/flatpak-builder/snapcraft — each named in PLATFORM-MATRIX.md).

## 4. The recommendation

**GO for GA is now an engineering-clean decision.** The gap between this
repository and GA is no longer engineering: it is the Founder's identity and
publication decisions (F-2, F-4, F-5) and the external reviews that follow
them. If the Founder accepts the labeled residuals (pseudonymous identity,
unpublished registries, host-unverified native channels), the repository as
it stands is defensible as GA with the five small engineering items closed;
the honest alternative is one more release train after F-2/F-4 land, which
would also exercise the cross-version upgrade leg.

**Public Beta (the current state) remains GO** — now with production-signed
artifacts.

## 5. The decision block (P4)

```
DECISION:            ☐ GO for GA      ☐ GO for public beta only      ☐ NO-GO
Residuals accepted:  ☐ F-2 pseudonym  ☐ F-4 substrate  ☐ F-5 unpublished
                     registries/site  ☐ host-unverified native channels
Preconditions due:   F-2, F-4, F-5, F-6, R-7 (+ the five §3 engineering items
                     before the GA train)
Signed (Founder):    ______________________     Date: __________
Packet prepared by:  Auren — Principal Release Commander (measured, ASCENSION XXV)
```

*Repository reality wins. Constitution wins. Evidence wins.*
