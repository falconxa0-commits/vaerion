# ADR-0010: Loopback daemon + pairing-token authn

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

SDKs and editor integrations need a programmatic surface beyond the CLI, and
the constitution requires Machine Parity: the API must expose the same
contracts the CLI exercises. The daemon must be safe by default on a
developer machine: it holds broker-mediated powers, so an open socket on
localhost is a standing target for other local processes. Cloud is not a
requirement (P1); the daemon is a local convenience surface, not a hosted
service.

Note on scope: accepted now as the binding design; the daemon itself lands
at milestone MS-5. Earlier milestones use the same contracts in-process.

## Decision

1. The API daemon binds loopback only by default: `127.0.0.1:7897` over TCP,
   a unix domain socket under the user runtime directory, or a Windows named
   pipe — per platform preference in that order.
2. Authentication is a first-run pairing token: generated at daemon start,
   printed once to the terminal (with clipboard copy), required from clients
   as `Authorization: Bearer <token>` on every call except unauthenticated
   metadata endpoints (`/health`, `/version`, `/openapi.json`).
3. Remote (non-loopback) binds are refused unless the operator passes an
   explicit override plus certificate configuration, and the engine prints a
   standing risk banner. There is no silent remote exposure.
4. The route surface is generated from the same service contracts the CLI
   uses, and the machine-readable description is published as
   `spec/openapi.json`; an "API gap" is impossible by construction.
5. Human gates surface over the API identically to the CLI: pending gates
   are pollable and answerable through the runs endpoints, backed by the
   same durable gate records.

## Consequences

- Positive: SDKs and editors get first-class access with parity tests against
  the same contracts; loopback + pairing token is adequate local threat
  hygiene without TLS machinery.
- Positive: the pairing token makes "something else on this machine is
  talking to my engine" detectable and deniable.
- Negative: token bootstrap adds one manual step to first connection; headless
  setups must capture the printed token.
- Negative: remote access is deliberately painful; legitimate remote use
  waits for a future ADR with real transport security.
