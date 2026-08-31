# Remaining-Risk Ledger — v0.1.7-rc1

The honest ledger of security exposures that remain after the mitigations
in `MITIGATIONS.md`. Severity: **critical** (ships nothing) / **high** /
**medium** / **low**. Owner is the accountable party: **Founder** (decision
or resource outside engineering) or **Engineering**. No critical finding is
open at this release; all items below are known, bounded, and tracked.

| ID | Severity | Area | Finding | Owner | Exit criterion | Status |
|---|---|---|---|---|---|---|
| R-1 | high | Exec sandbox | The per-platform exec sandbox matrix (ADR-0015) ships the v0.1 profile; OS-level sandbox profiles (seatbelt / job objects) for arbitrary third-party extensions are not yet enforced on every platform | Engineering | Platform matrix implemented and adversarially tested per OS in CI | Open — tracked for post-rc hardening |
| R-2 | high | Supply chain | Release signature verification currently trusts the bootstrap Ed25519 public key shipped in the repository; no offline key ceremony has taken place | Founder | Key ceremony performed; release public key rotated to a held-offline key; revocation procedure published | Open — Founder-gated |
| R-3 | medium | Gateway | Per-process circuit breaker: a long-lived daemon restarting in-process does not share breaker state across restarts | Engineering | Breaker state persisted via the journaled metering metrics | Open |
| R-4 | medium | Evals | No real provider cassette recorded (no network credentials in the build environment); hermetic evals run against cassettes and the deterministic mockbrain only | Founder (credential provision) | One sanctioned recording session per shipping adapter, committed as cassettes | Open — Founder-gated |
| R-5 | medium | Daemon | SSE replay cursors are unauthenticated read windows over run events for token holders; a leaked token grants read access to all run journals until rotated | Engineering | Token rotation command + journal-scoped tokens (per-run capability) | Open |
| R-6 | low | Packaging | `vaerion.lock` seals pins at build time; re-verification against a *newer* extension artifact requires a rebuild rather than an in-place upgrade path | Engineering | Documented upgrade flow (`vae package build` re-seal) shipped in the troubleshooting guide | Open |
| R-7 | low | Disclosure | No public security-reporting channel (security.txt / private vulnerability reporting) is provisioned until the canonical remote exists | Founder | Reporting channel provisioned with the public release infrastructure | Open — Founder-gated with remote provisioning |

## Disclosure posture

Until R-7 closes, security reports go directly to the project owner
(Auren) through private contact. Please do not open public issues for
security findings. Reports should include reproduction steps and, where
possible, journal or receipt output demonstrating the finding.
