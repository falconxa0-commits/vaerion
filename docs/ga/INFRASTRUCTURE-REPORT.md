# Infrastructure Report — the GA certification summary

| | |
|---|---|
| **Document** | The measured infrastructure state at GA candidacy. Full detail: `docs/operations/` (ENVIRONMENTS, DEPLOYMENT, OPERATIONS, ANNOUNCEMENTS). |
| **Version of record** | `0.1.13-rc1` |

## What exists (all measured)

| Surface | State | Evidence |
|---|---|---|
| CI substrate (staging) | live — every push verified on GitHub infrastructure (8 gates, ~60 s) | 20+ runs; step-level GREEN history; one transient registry failure root-caused and re-run |
| Release pipeline (production) | live — `release-publish.yml` dispatches per tag: validate → checkout tag → frozen install → deterministic re-pack → bootstrap refusal → idempotent publish | run 33818575076 SUCCESS; the Release live |
| Distribution surface | live — public GitHub Releases with the signed artifact set + notes + prerelease honesty | `RELEASE-CERTIFICATION.md` |
| The three-remote mirror | live — local = canonical = github, parity 0/0 at every close; the canonical mirror was lost once (environment reset) and lawfully re-provisioned | Task 1 |
| The status dashboard | live in development (sandbox dev server; browser-verified at two widths) | Task 10 |
| Monitoring | CI truth (every change), release pack reports, the three verification legs, journal integrity | OPERATIONS §1 |
| Backups | the three-remote mirror (code), GitHub Releases (artifacts), the repository history (records); the signing key deliberately un-backed-up (recovery = rotation) | OPERATIONS §3 |
| Incident response | runbooks for CI failure, release defect, key incident, secret exposure, supply-chain alarm, user-machine recovery | OPERATIONS §4 |

## What does not exist (honestly)

- **No hosted production website** (`vaerion.dev` — F-5, Founder-gated).
- **No registry publication** (npm/PyPI/Homebrew/… — F-5; every manifest is
  authored and version-locked meanwhile).
- **No staging server** — deliberately: for a local-first engine the rehearsal
  surface is CI's frozen install + the Empty Machine Test journeys, not a
  long-lived server (the reasoning is recorded in ENVIRONMENTS §3).
- **No on-call/paging/SLA** — solo-maintainer reality, stated in OPERATIONS §5.

*Repository reality wins. Constitution wins. Evidence wins.*
