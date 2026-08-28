# vae-capabilities (L1)

Owns privilege. The broker is the single doorway through which every
privileged action passes — the core itself is not exempt (D10.6, D7.5).

| Concern | Law | Where |
|---|---|---|
| Fail-closed: unknown = deny | D10.1 | `src/decide.ts` |
| Deny beats allow | D10.2 | `src/decide.ts` |
| Deterministic pure-function decisions | D10.3 | `src/decide.ts` |
| Durable human gates default to park | D10.4 | `src/gates.ts` |
| Broker proposes diffs; never writes policy | D10.5 | `src/policy.ts` |
| Audit failure = denial | D10.7 | `src/broker.ts` |
| Refusal Log (every refusal recorded) | D2.6, FR-4, Article XI | `src/refusal-log.ts` |

Status: IMPLEMENTED (decision function, policy evaluation, audit sink
wiring, durable parked-gate queue, refusal log). Durable park across
process restarts is proven at the service level in MS-2 acceptance.
