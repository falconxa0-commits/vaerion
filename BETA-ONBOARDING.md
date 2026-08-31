# Vaerion Beta Onboarding — v0.1.7-rc2

Welcome. You are evaluating a **public beta** of Vaerion: a local-first,
AI-native development engine built around one versioned event spine,
append-only blake3-chained journals, a fail-closed permission broker,
deterministic replay, receipts folded from journals, and reproducible
`.vxn` bundles.

This document is the beta program contract: what you get, what we ask,
and how feedback becomes engineering action.

## What "beta" means here

- The engine is **verified before every release**: six gates (typechecks,
  tests with enforced coverage floors, architecture boundaries,
  constitutional invariants, repository lint) must be green, and the
  measured record ships with the release (`.vaerion-verification.json`).
- It is still a **beta**: surfaces may grow (additively — nothing is
  removed or renamed within v0.1), performance is unoptimized, and some
  platform hardening is tracked openly in
  `docs/security/RISK-LEDGER.md`.

## Privacy posture (read this first)

- **Zero telemetry.** The engine contains no analytics, no phone-home,
  and no undeclared network primitives — enforced mechanically by
  constitutional checks on every build.
- The **only** network egress is the model gateway, and only when you
  explicitly invoke a model operation. Secrets never travel in journals,
  receipts, or bundles; they resolve from your OS keychain (or
  environment indirection) at call time.
- Your journals, receipts, and bundles live under your workspace's
  `.vaerion/` directory. Exporting them (`vae journal export`) is your
  explicit act, always.

## Onboarding path (S1–S4)

Work through in order; each stage has a completion check.

| Stage | You do | Done when |
|---|---|---|
| **S1 Install & verify** | `docs/INSTALL.md`; run `tools/verify.ts` | `ALL GATES GREEN` on your machine |
| **S2 First verified run** | `docs/QUICKSTART.md` steps 1–3 | A journal verified + a receipt you inspected |
| **S3 Reproducibility proof** | Quickstart step 4 | Two byte-identical bundles + a green `package verify` |
| **S4 Daemon + SDK** | Quickstart step 6 | An SDK call served by the loopback daemon |

Stuck at any stage? `docs/TROUBLESHOOTING.md` + `examples/vaerion-demo/`
cover the usual paths.

## What we ask from beta testers

1. **Run the verification suite** after installing — it is the same gate
   the maintainers run, and it proves your environment.
2. **Exercise the demo path** end to end before your own workflows.
3. **Report honestly** (see severity ladder below). A report that says
   "it failed" without the E-code and output costs everyone time; a
   report with command + output + journal snippet is actionable.
4. **Treat journals as evidence**: when something surprises you, attach
   `vae journal show <RUN>` and `vae doctor` output. The journal is the
   shared source of truth between you and the maintainers.

## Feedback severity ladder

| Severity | Definition | Examples |
|---|---|---|
| **S1 Blocker** | Cannot install, verify, or complete the demo path; data loss; security issue | Gate fails on a supported platform; journal corruption; secret material in output |
| **S2 Major** | A documented flow produces wrong or dishonest output | Receipt does not verify; bundle digests differ on identical inputs; exit code contradicts the output |
| **S3 Minor** | Usable but rough: docs gap, confusing message, repair hint unclear | An E-code without an obvious fix; a stale doc reference |
| **S4 Suggestion** | Everything works; you want more | Surface requests, ergonomics |

Security issues **never** go through public channels — see the
disclosure posture in `docs/security/RISK-LEDGER.md`.

## What happens to your feedback

Every accepted report becomes an engineering record: the defect is fixed
at root cause (never papered over), the verification suite grows a test
that fails without the fix, and the release notes credit the finding.
Nothing about your machine, workspace, or content is collected by us —
you choose what to share, and the journal export format is the intended
sharing medium.

## Beta exit criteria (what changes after beta)

The beta ends when the open items in `docs/security/RISK-LEDGER.md`
reach their exit criteria, the release train completes its Founder-gated
steps, and the GA dossier (this repository, `docs/ga/`) records a green
GO. Until then: repository wins, evidence wins, and your testing is the
part of the evidence base we cannot generate ourselves.
