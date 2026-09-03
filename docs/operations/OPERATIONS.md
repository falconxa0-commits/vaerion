# Vaerion Operations — monitoring, logging, backups, incident response

| | |
|---|---|
| **Document** | The operational posture of a local-first engine: what is watched, what is logged, what is backed up, what happens when things break |
| **Companion docs** | `ENVIRONMENTS.md` · `DEPLOYMENT.md` · `docs/security/SIGNING-CEREMONY.md` (key incidents) · `docs/security/RISK-LEDGER.md` |

## 1. Monitoring

| Signal | Mechanism | Measured state |
|---|---|---|
| Change health | GitHub Actions `verify.yml` on every push — 8 gates, one authority (`tools/verify.ts`) | live; 20+ runs, step-level GREEN history; failures are surfaced by the run (the registry-flake incident, Task 3, was caught and root-caused from run logs in minutes) |
| Release health | `release-publish.yml` step summaries + the pack report in every release (gates green, production-key tripwire, reproducibility proof) | live; the report travels inside every release — the consumer can audit the pack run itself |
| Consumer trust chain | The three verification legs taught in every `VERIFY.md` (sha256 → engine `dist-verify` → independent openssl cross-check) | live; measured on every release close |
| Human surface | The status dashboard (the sandbox dev surface until hosting lands, F-5) — engine version, gate/audit-ledger integrity, refusal log | live in development |
| Uptime / APM | Not applicable — no hosted service exists to monitor; the product runs on user machines | honest non-feature by design |

## 2. Logging

| Log | Where | Retention law |
|---|---|---|
| The event spine | Every run's journal — append-only NDJSON, blake3-chained, on the user's machine (`.vaerion/`) | the user's data; `vae journal verify` proves integrity at any time; recovery via `vae journal recover` |
| Verification records | `.vaerion-verification.json` per CI run (uploaded artifact; the CI-truth law keeps it a hidden-file upload with the load-bearing flag) | the repository's own history is the evidence store |
| Release provenance | `dist-report.json` + `VERIFY.md` inside every artifact set — gates, fingerprint, reproducibility proof | immutable with the tag |
| Campaign decisions | `worklog.md` — every task, measured, appended (never overwritten) | repository history |
| Secrets | **Never logged** — the broker keeps provider keys in the OS keychain and out of journals, receipts, and bundles (ADR-0013); the signing key never enters a file the repo tracks | enforced + tested |

## 3. Backups

| Asset | Backup mechanism | Measured state |
|---|---|---|
| The repository (the product, the docs, the law) | **Three-remote mirror**: local working tree + the canonical bare mirror + GitHub; parity checked per campaign close (`git ls-remote` byte-comparisons) | 0/0 parity re-measured at every close; the canonical mirror was lost once (environment reset) and lawfully re-provisioned from the local tree (Task 1) — the mirror IS the backup test |
| Release artifacts | GitHub Releases (per tag) + CI artifact uploads (per run) | live since v0.1.12-rc1 |
| User workspaces | The user's machines — journals are local-first by design; bundles (`.vxn`) are self-verifying portable artifacts | documented; no server-side user data exists to back up |
| The signing key | **No backup by design** — write-only in GitHub secrets; recovery = rotation (`SIGNING-CEREMONY.md` §5) | deliberate; a recoverable key is a stealable key |

## 4. Incident response

| Incident class | Runbook |
|---|---|
| **CI failure** | Root-cause from run logs (step-level); classify code vs infrastructure (the Task-3 registry-flake precedent: download failure → re-run, recorded, never hidden); a RED commit blocks the train until resolved. |
| **Release defect (post-publish)** | Mark the release (prerelease + note), fix-forward on `main`, cut a new tag; consumers roll back by pinning the previous tag. Never rewrite the tag. |
| **Signing-key incident** | The `SIGNING-CEREMONY.md` §5 path: private disclosure FIRST (`SECURITY.md` route, R-7), rotate immediately, re-release under the new key, name the affected release range. |
| **Secret exposure in the repo** | The repo's own gates + `.gitignore` (`/keys/*.key`) + the env-only token law make this unlikely; if it happens: rotate the exposed secret, purge from remote refs requires history review — the immutable law means the response is rotation + disclosure, not force-push rewrites. |
| **Supply-chain alarm (dependency)** | The lockfile is frozen (`--frozen-lockfile`, supply-chain law); a compromised upstream release does not enter CI until the lock is deliberately moved. Response: pin past the bad version, re-run gates, record in the risk ledger. |
| **User-machine incident (journal corruption, partial install)** | `docs/TROUBLESHOOTING.md` + `vae doctor`; journals self-verify and chain-recover; bundles verify without executing content (ADR-0016). |

## 5. On-call reality (stated, not dressed)

There is **no on-call rotation, no paging, no SLA** — the project is a
local-first engine with a solo maintainer (the Founder). The response
contract that exists: the security-disclosure route (`SECURITY.md`, private
until R-7 provisions a public channel), the public issue tracker (post-GA
community surface), and the documented runbooks above. If the project grows a
hosted surface, this section becomes a real rotation — under an ADR, with the
risk ledger updated.

*Repository reality wins. Constitution wins. Evidence wins.*
