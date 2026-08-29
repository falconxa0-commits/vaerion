# ADR-0019: Single sanctioned gateway transport egress

| | |
|---|---|
| **Status** | Accepted (MS-3, under the Founder's Model Gateway directive) |
| **Date** | 2026-08-29 |
| **Supersedes** | The MS-0-era reading of C1 ("the engine contains no network egress at all") |
| **Related** | D-J (gateway is the single gate), D-K (zero telemetry), ADR-0011 (HTTP stack), ADR-0012 (cassettes), ADR-0013 (secrets) |

## Context

MS-0 law was written when the engine had no model I/O: the constitutional check
banned every `fetch`/URL literal in the engine. MS-3 (Model Gateway) makes model
invocation a first-class engine capability, and every model invocation is by
definition network I/O toward a provider. A blanket ban and a working gateway
are incompatible; an unmanaged allowance would violate P10 (local-first, zero
telemetry) and D-J (single gate).

## Decision

The engine contains **exactly ONE sanctioned egress site**:
`packages/vaerion/src/gateway/transport.ts`. It alone:

1. carries the host-key → endpoint map (`anthropic`, `openai`, `ollama` —
   loopback);
2. calls `fetch`;
3. resolves `TransportRequest`s into network responses.

Reaching it is lawful only behind the broker flow (`model.invoke` /
`secret.read` decisions, journaled decide→journal→act). Providers receive
exactly the declared invocation payload — outbound payloads pass the redaction
middleware first (R-MG5), so a secret-shaped value never leaves the machine,
and nothing is ever emitted to any party beyond the requested invocation (D-K
zero telemetry holds: no telemetry, no phone-home, no diagnostics egress).

Enforcement: `tools/constitutional-check.ts` C1 allowlists exactly this path;
every other engine/SDK file with `fetch(`, `node:http(s)`, `node:net`, `axios`,
or URL literals is a violation. Adapters name host KEYS, never URLs; tests
never touch the seam (cassette/scripted transports only, ADR-0012).

## Consequences

- The C1 check gains a one-file allowlist; the scanner's strength elsewhere is
  unchanged (violations dropped from 4 false-positives to 0 while keeping the
  ban absolute outside the seam).
- New providers require (a) an adapter that names a host key, (b) an endpoint
  entry in the transport seam — one reviewed place, never scattered URLs.
- MS-5's loopback daemon (ADR-0010) will add its own listener; it must amend
  this ADR rather than reuse the provider egress site.
- The daemon/HTTP stack (ADR-0011) note "not exercised in MS-1" is superseded
  for the provider direction; the inbound daemon direction remains MS-5.
