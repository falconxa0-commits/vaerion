# ADR-0014: Stable diagnostics catalog E#### remediation-linked

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

Diagnostics are a user surface and a machine surface at once: humans need
"what failed, why, and what do I do now"; doctor, SDKs, and AI-fix prompts
need stable, matchable codes. Free-form error strings are unmatchable and
drift; burying causes behind generic messages violates the honesty doctrine
(P7). The E#### culture must be governed like a protocol, not accumulated as
ad-hoc strings.

## Decision

1. All diagnostics carry stable codes `E####` from one catalog,
   `spec/errors.yaml`, grouped into ranges by subsystem (for v1: 1xxx
   journal/persistence, 11xx event spine, 12xx configuration, 13xx
   permission broker, 14xx research, 15xx runtime/restore, 16xx
   surface/usage, 19xx internal invariants).
2. Every catalog entry has exactly three prose fields: `name` (stable
   identifier), `summary` (what failed and why, likely cause), and `fix`
   (an actionable next step). An error without a `fix` line is incomplete.
3. The catalog is additive-only within v1: codes are never reused or
   remapped; retiring a code deprecates it in place. Renumbering is a
   breaking change and requires a catalog major.
4. The runtime error type is a mirror of the catalog; verification asserts
   spec and mirror stay in sync. Documentation, doctor matching, and
   SDK-facing error payloads are generated from the same catalog.
5. Internal invariant violations (19xx) are always engine bugs: they carry
   the trace id and instruct filing a bug; they are never presented as
   user-caused.

## Consequences

- Positive: doctor can map codes to remediations mechanically; AI-assisted
  fixes get a reliable, bounded vocabulary; exit codes and error payloads
  stay honest.
- Positive: the `Fix:` contract gives every error exactly one next action,
  which keeps surfaces uncluttered.
- Negative: every new failure mode costs a catalog entry and a mirror update
  plus verification — friction that is accepted deliberately.
- Negative: code stability forever means some codes will describe situations
  that later refactorings render rare; they remain for compatibility.
