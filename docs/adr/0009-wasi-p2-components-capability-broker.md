# ADR-0009: WASI-P2 components + capability broker substrate

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

Extensions are untrusted third-party code running on a developer's machine
with access to project data. The plugin substrate must provide real fault
isolation, cross-language authorship, and a supply chain that can be pinned
by digest. Alternatives — in-process worker pools, subprocess RPC, dynamic
plugins — either share a memory space with the engine or impose no
structured capability boundary.

Note on scope: this decision is accepted now as the target substrate, with
contingency R-2 attached (WASI Preview 2 standardization shifts could
destabilize the ABI). The extension host itself lands at milestone MS-5; MS-1
freezes only the broker contracts extensions will use.

## Decision

1. The extension substrate is WASI Preview 2 components executed by a
   production Wasm runtime. Components are loaded from pinned artifacts
   (`.wasm` files referenced by `vaerion.yaml` and pinned by digest in
   `vaerion.lock`).
2. Extensions gain powers exclusively through a host-function bridge onto the
   PermissionBroker and builtin tool registry. There is no ambient
   filesystem, network, or environment access from inside the sandbox; every
   host call is a broker evaluation with the extension as principal.
3. The component model gives the ABI: typed WIT worlds are the extension
   contract surface, published under `spec/wit/` when the extension kit
   lands.
4. Contingency R-2: a subprocess fallback host sharing the same broker
   semantics is kept warm behind a feature flag. If WASI-P2 shifts
   destabilize the ABI, the fallback flips while preserving UX and audit
   guarantees; extension authorship in TypeScript is compiled to components
   via the standard toolchain.

## Consequences

- Positive: fault isolation by construction; digests enable a reproducible,
  pinnable supply chain; any language that targets components can author
  extensions.
- Positive: capability mediation is uniform — extensions are just principals
  to the broker (ADR-0004).
- Negative: Wasm ABI churn is a real risk; pinning runtime minors mitigates
  but does not eliminate it.
- Negative: host-call boundaries add latency to every extension operation.
