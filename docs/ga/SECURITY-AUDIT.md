# Security Audit — the GA certification summary

| | |
|---|---|
| **Document** | The certification-time security posture summary. The full measured audit is `docs/ga/FINAL-SECURITY-AUDIT.md` (supply chain, repository, release — every check with its evidence). |
| **Version of record** | `0.1.13-rc1` |

## The posture in one table

| Domain | State | Key evidence |
|---|---|---|
| Release trust | **PRODUCTION** — Ed25519 key ceremony executed (R-2 CLOSED); key of record rotated; bootstrap path = fail-closed fallback with a publish-refusal tripwire | `SIGNING-CEREMONY.md`; the live release's clean pack report |
| Supply chain | **PINNED** — frozen lockfile with full sha512 integrity, zero non-registry sources, minimal published dependency surface (3 packages), substrate pinned (Bun 1.3.14) | FINAL-SECURITY-AUDIT §1 |
| Repository secrets | **CLEAN** — tree + recent-history sweeps found only allow-listed redaction test vectors; zero credential entries; the private key never enters version control | FINAL-SECURITY-AUDIT §2 |
| Access control | **HARDENED** — branch protection live (required check, linear history, no force-push/deletions); least-privilege workflows (read-only CI; single justified write workflow); one write-only secret | FINAL-SECURITY-AUDIT §2 |
| Release integrity | **VERIFIED 3 WAYS** — sha256, engine verifier, independent openssl — both tokened and anonymous | `RELEASE-CERTIFICATION.md` §3 |
| Residuals | **NAMED, LOW, OWNED** — Dependabot absent; first-party actions tag-pinned (not SHA); admin bypass on branch protection (solo-maintainer law); the risk ledger rows R-1/R-3/R-5/R-6 engineering-open, R-4/R-7 Founder-gated | FINAL-SECURITY-AUDIT §4 |

## Disclosure posture

Security findings go through the **private** route in `SECURITY.md`
(`auren@vaerion.dev`), never public issues. The key-compromise runbook
(private disclosure first, rotate, re-release, name the affected range) is
`docs/security/SIGNING-CEREMONY.md` §5.

*Repository reality wins. Constitution wins. Evidence wins.*
