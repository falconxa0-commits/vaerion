# Research Capability Contract (foundation)

Research in Vaerion is a **declared capability**, governed by the same
law as everything else: attribution (D9.3, Article II), provenance
(D14.3), fail-closed privilege (D10.1), refusal over guess (Article XI).

## Law mapping

| Principle | Law | Mechanism |
|---|---|---|
| Research is a declared capability | D15.1 posture, D2.7 | `ResearchCapabilityDeclaration` in the principal's capability space |
| Research actions are attributable | D9.3 | `research.requested` events carry actor + cause |
| Inputs and outputs are recorded | D12.1, D14.3 | `SourceRecord` + `EvidenceRecord` with blake3 digests |
| External information is untrusted | D14.3 | `fenceUntrusted()` wraps every untrusted span |
| Provenance tracking | D14.3, D8.2 | `ProvenanceRecord` with content fingerprint |
| Never silently influence decisions | Article XI, D14.4 | Evidence enters context only through One Context Path packs; exclusions are explicit |
| No uncontrolled network access | D10.1, Sacred Invariant VI | `ConnectorRegistry` ships EMPTY; connectors are broker-mediated (`research.fetch` + host scope from `permissions.net.allowHosts`) |

## Refusals (fail-closed by construction)

- `E2007 RESEARCH_CONNECTOR_ABSENT` — no connector registered; the
  engine performs no network I/O itself, so an unregistered research
  request simply has no path to execute.
- `E2008 RESEARCH_CAPABILITY_UNDECLARED` — the principal never declared
  `research.fetch`.

Both refusals are recorded in the Refusal Log (D2.6) with actor+cause.

## Data contracts

- `ResearchPrincipal` — kind, id, declared capability space.
- `ResearchCapabilityDeclaration` — principal, requested scopes, evidence permission.
- `SourceRecord` — connector, locator, retrieval time, trust, provenance.
- `EvidenceRecord` — source link, FENCED content, claim, recorder, time.
- `ProvenanceMetadata` — blake3 fingerprint of canonical content.
- `ResearchConnector` — the port future browsing/search connectors implement (MS-4+), always behind a broker grant.

## What does NOT exist in MS-0

No network client code ships anywhere in the engine (the gateway has
no adapters either, D13.5). A research connector that fetches from the
web is future work requiring: a registered connector, a broker-granted
`research.fetch` capability scoped to allow-listed hosts, recorded
requests/responses under journal discipline, and redaction at the
publication boundary (D9.4, D12.3). The interfaces are ready; the
capability is human-granted or absent.
