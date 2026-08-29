# ADR-0004: Centralized PermissionBroker mediates all principals

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

Every privileged operation — filesystem, network, exec, model invocation,
secret read, tool call, research — can be initiated by any of six principal
kinds: human, agent, tool, extension, research, system. Checks scattered at
call sites drift, favor the trusted path, and cannot produce a uniform audit
trail. Autonomous agents raise the stakes further: untrusted content must
never be able to mint authority, and a human must be the only approval
authority for irreversible or ambiguous power.

## Decision

1. One PermissionBroker mediates every privileged operation, identically for
   every principal, including the human's own tools.
2. Capabilities are DECLARED before they can be requested (declarations come
   from `vaerion.yaml` or extension manifests; grants are ceilings that only
   ever narrow). A declaration is never a guarantee of yes.
3. The broker fails closed (ratified decision D-A): when a request cannot be
   evaluated, the decision is deny (`E1301`); absence of permission is
   permission's absence.
4. Law of sequence: decide -> journal -> act. A privileged action fires only
   after its decision record exists in the journal (`E1304` otherwise);
   action parameters are redacted before journaling.
5. Every decision, allow or deny, lands in the hash-chained audit ledger;
   denials are first-class observable facts (Refusal Log, D-L).
6. Ambiguous or irreversible power resolves through durable human gates that
   survive process death; resolution is journaled and idempotent.
7. Contracts (capability, decision, gate) are frozen and published in `spec/`
   before the broker engine is implemented, so the engine lands against
   stable law.

## Consequences

- Positive: uniform auditability, a single place to enforce fail-closed
  semantics, and a containment point against prompt injection.
- Positive: the Refusal Log turns denials into evidence rather than errors to
  be suppressed.
- Negative: every privileged path pays broker latency and ceremony; hot loops
  must batch or cache evaluations without bypassing the broker.
- Negative: the broker is load-bearing single point of failure; its own bugs
  are constitutional defects, so it is verified first.
