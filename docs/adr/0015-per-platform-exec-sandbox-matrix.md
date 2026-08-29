# ADR-0015: Per-platform exec sandbox matrix + explicit degraded mode

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

Command execution is the highest-consequence capability the broker mediates.
Confinement mechanisms differ sharply per platform: Linux offers namespaces
and seccomp (with Landlock for filesystem restrictions), macOS offers
sandbox-exec profiles with their own deprecation churn, and Windows offers
Job Objects and AppContainer semantics that cover part of the threat model.
A single cross-platform sandbox that keeps the same guarantees everywhere
does not exist; pretending it does would produce silent, unverified
isolation claims.

## Decision

1. Exec confinement is defined as a per-platform matrix, documented and
   verified per OS: mechanisms used, guarantees provided, and their limits.
   Each matrix cell states what is enforced and what is not.
2. Where a platform cannot provide a verified confinement guarantee, the
   engine enters an explicit degraded mode: it refuses the operation by
   default, or runs it with a loud, persistent degraded banner plus a docs
   pointer — never silently. Degraded mode is itself a journaled event, so
   runs that executed weaker confinement are identifiable forever.
3. Every exec decision (allow, deny, prompt-to-human) is broker-mediated and
   journaled per ADR-0004; the sandbox is a defense-in-depth layer beneath
   the broker, never a replacement for it.
4. Allowed command ceilings come from `vaerion.yaml` (`exec.allowCommands`);
   they are cumulative ceilings that grants only narrow. Glob grants are
   statically checked against usage sites at load time.
5. A sandbox regression on a platform is a release blocker for that
   platform's artifacts; the verification suite exercises the matrix cell,
   not a stub.

## Consequences

- Positive: users get truthful statements of what is confined on their OS;
  Windows users are not lied to by a Unix-derived claim.
- Positive: degraded mode preserves usability while keeping the honesty
  doctrine (P7); audits can distinguish confined from degraded executions.
- Negative: three platform behaviors must be maintained and tested; coverage
  is uneven by platform, and that unevenness is public.
- Negative: degraded mode is a standing temptation to accept weaker
  guarantees; the banner and journal record are the controls that keep it
  loud.
