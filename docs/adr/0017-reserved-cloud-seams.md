# ADR-0017: Reserved cloud-seam interfaces, intentionally unimplemented v0.1

| | |
|---|---|
| Status | Draft |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

The constitution fixes local-first (P1): the default deployment is one
binary plus one project directory, and cloud is a designed plug, never a
requirement. Zero telemetry (P10) forbids phone-home. Experience with
local-first tools shows the failure mode is not adding cloud — it is adding
it accidentally, through hardcoded provider calls, ambient endpoints, and
silent egress that later make a hosted offering a rewrite.

v0.1 has no cloud scope. The question is only whether to reserve the seams
where cloud would one day attach, so that if the Founder ever ratifies it,
it plugs into designed ports instead of melting the architecture.

## Decision

1. A small set of cloud-seam interfaces is RESERVED by name and signature in
   the contract space, and intentionally left unimplemented in v0.1:
   a remote-state sync port (journal/bundle replication), a hosted-gateway
   relay port (provider access via a remote relay), and a remote-collaboration
   notification port. None has an implementation, a default binding, or a
   network path in v0.1.
2. Reserved seams are declarations only — ports in the contract space with
   no wiring. No code path may reference them at runtime; layer lint and
   verification enforce that unimplemented ports stay unwired.
3. Everything cloud-shaped remains forbidden by standing law until an ADR
   ratifies actual scope: no telemetry (P10), no unmediated egress (D-K),
   no account or hosted dependency in the default deployment.
4. Status is Draft: this ADR reserves the seams and the discipline; a future
   ADR must ratify any implementation, at which point this record is
   superseded or amended per the amendment procedure.

## Consequences

- Positive: if cloud ever arrives, it lands as a plug behind declared ports
  with broker mediation and journaling intact, not as a fork of the engine.
- Positive: naming the seams now prevents both accidental coupling and
  vague "someday" architecture talk.
- Negative: reserved-but-unimplemented interfaces can be mistaken for
  promises; documentation must label them as seams, not roadmap.
- Negative: seam signatures may need revision before they are ever
  implemented; that is acceptable — they carry no compatibility burden while
  unimplemented and unratified.
