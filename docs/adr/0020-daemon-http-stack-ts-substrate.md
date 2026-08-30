# ADR-0020: Daemon HTTP stack on the TypeScript substrate + the sanctioned wire-client site

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none (mechanism of ADR-0011 §1–3 for the TS substrate; law preserved) |
| Superseded by | none |

## Context

MS-5 lands the local API daemon (ADR-0010). ADR-0011 pinned tokio + axum +
tower as the HTTP stack — written when the substrate decision was open. The
engine substrate is TypeScript on Bun (ADR-0018, still Proposed but the
shipping reference substrate); tokio/axum/tower cannot be exercised on it.
The daemon therefore needs an HTTP mechanism on the actual substrate without
re-litigating the LAW ADR-0011 already fixed: loopback binds, pairing-token
authn, redaction before publication, SSE with journal-cursor replay, and no
business logic in routes.

Machine parity (R-S1, blueprint §7.5) requires SDKs to attach to a running
daemon over HTTP/SSE. C1 (zero undeclared network) currently sanctions exactly
one EGRESS site (gateway/transport.ts, ADR-0019). A wire client is a second
kind of network surface: an explicitly declared, loopback-limited CLIENT site
— not telemetry, and not a second gateway.

## Decision

1. **Mechanism (TS substrate):** the daemon uses Bun's built-in HTTP server
   (`Bun.serve`) with streaming `ReadableStream` bodies for SSE. Handlers map
   requests onto the same engine service contracts the CLI composes
   (RunHarness, AgentRuntime, WorkflowEngine, GatewayService,
   ToolInvocationService) — no business logic in routes. ADR-0011's law
   carries over unchanged; only the library names are substrate-specific.
2. **Listener surface is egress-free:** nothing under `packages/vaerion/src/api/`
   may call `fetch`/http-client primitives — the daemon listens, it never
   phones out. This is enforced as a new constitutional check (C7) so the
   listener surface can never drift into an egress.
3. **Sanctioned wire-client site:** `sdks/typescript/src/daemon-transport.ts`
   is the single allow-listed CLIENT egress site (C1), symmetric to
   ADR-0019's gateway egress. It is loopback-enforced in code: a base URL
   whose host is not `127.0.0.1`, `localhost`, or `[::1]` is refused (E2006)
   before any byte is sent. Remote attachment stays impossible until a
   ratified transport-security ADR exists.
4. **Pairing token:** generated at daemon start from the platform CSPRNG
   (`crypto.getRandomValues`, 32 bytes, base64url), printed ONCE to the
   terminal; `VAE_TRUST=<token>` pre-provisions headless starts (R-S2).
   Comparison is timing-safe. Token material never enters journals, logs, or
   the openapi description.
5. **`vae serve` command:** the daemon is started by `vae serve` (additive
   eighth command beside the Daily Seven; the Daily Seven itself is unchanged
   and remains the core loop). `vae serve --help` teaches the bind, token,
   and shutdown contract.
6. **OpenAPI is generated, not authored:** `spec/openapi.json` is generated
   deterministically from the SAME route table that dispatches requests
   (ADR-0010 decision 4: "an API gap is impossible by construction").
   Constitutional check C4 verifies the committed file matches the generator
   byte-for-byte; only implemented routes are described — an unimplemented
   route is never advertised.

## Consequences

- Positive: MS-5 proceeds on the shipping substrate without a new runtime
  dependency; the HTTP law (loopback, token, redaction-before-publication,
  cursor-replay SSE) is testable end-to-end over real sockets.
- Positive: C7 makes the listener's egress-freedom a verified invariant, and
  the wire client's reach is structurally confined to loopback.
- Negative: `Bun.serve` binds the daemon surface to the substrate; a future
  re-platform re-exercises ADR-0011's original stack (the route table and
  openapi generator are substrate-neutral and port with it).
- Negative: the pairing token is print-once; headless operators MUST use
  `VAE_TRUST` (documented in `vae serve --help`).
