# Vaerion Threat Model — v0.1.7-rc1 (Phase 1)

Scope: the shipped v0.1 surface — the `vae` CLI, the loopback API daemon,
the TypeScript SDK, the extension host, the model gateway, and the
reproducible packaging subsystem. Trust boundaries, adversaries, and the
security properties the architecture is required to hold are stated here;
implemented mitigations live in `MITIGATIONS.md`, and open exposures with
owners live in `RISK-LEDGER.md`.

## Trust boundaries

```
┌────────────────────────────────────────────────────────────────┐
│ Operator ( trusts )                                            │
│   │ pairing token (32 bytes, base64url, printed once)          │
│   ▼                                                            │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Loopback daemon (127.0.0.0/8, ::1 only — E2001 otherwise)│   │
│ │   engine core: spine, journal, broker, store, receipts   │   │
│ └───────┬───────────────────────┬──────────────────────────┘   │
│         │ extension spawn       │ model gateway egress         │
│         ▼ (subprocess)        ▼ (single sanctioned site)       │
│ ┌──────────────────┐   ┌──────────────────────────────────┐    │
│ │ Extension host   │   │ Gateway transport (ADR-0019)     │    │
│ │ sha256-pinned    │   │ provider allow-list, metering,   │    │
│ │ artifact, IPC    │   │ keychain-first secrets           │    │
│ └──────────────────┘   └──────────────────────────────────┘    │
│         package verify / import: PURE CHECK — never executes   │
└────────────────────────────────────────────────────────────────┘
   Network beyond the host: only the gateway transport egress site.
```

1. **Operator ⇄ daemon** — a bearer pairing token over loopback HTTP/SSE.
2. **Engine ⇄ extensions** — a subprocess boundary; the extension artifact
   is a pinned executable that must match its sha256 digest before launch.
3. **Engine ⇄ model providers** — one sanctioned transport egress site
   (ADR-0019); every other module is C7-scanned to contain no HTTP client
   primitives.
4. **Engine ⇄ workspace files** — vaerion.yaml manifests and package
   inputs; bundle content is data, never code (E2200–E2206 laws).

## Adversaries

| # | Adversary | Capability | Primary target |
|---|---|---|---|
| A1 | Local co-resident process (other user or compromised app) | Can reach TCP loopback and read world-readable files | The daemon API; workspace journals |
| A2 | Malicious extension publisher | Ships an extension artifact + manifest | Arbitrary code execution beyond granted capabilities |
| A3 | Malicious workspace author | A vaerion.yaml (or a swapped `.vxn` bundle) a victim is asked to build/verify | Package import executing content; digest-swap fraud; path escape |
| A4 | Network attacker / compromised provider | Controls traffic to or from the model gateway | Secret exfiltration; prompt/response tampering; telemetry leak |
| A5 | Artifact tamperer | Modifies release artifacts in transit or at rest | Shipping backdoored engine or bundles |

## Security properties required (and where enforced)

- **P-LOOPBACK**: the daemon never binds a non-loopback address (E2001,
  thrown before `listen`).
- **P-PAIRING**: every state-changing route requires the pairing token
  (timing-safe compare); shutdown additionally requires the token echoed in
  the body (E2004).
- **P-NO-EGRESS**: the engine contains exactly one transport egress site
  (gateway `transport.ts`); the daemon surface contains none; the SDK's
  single wire-client site is loopback-only (E2006). Enforced mechanically
  by constitutional check C7 on every verification run.
- **P-PIN-THEN-RUN**: an extension artifact whose sha256 does not match its
  pin is never executed (E2100 before any spawn); protocol violations kill
  the child (E2102); hangs are reaped by timeout (E2103).
- **P-SECRETS-NOWHERE**: secrets resolve keychain-first (ADR-0013), are
  supplied to children via environment indirection, never written to
  journals, receipts, or bundles; C5 scans the repository for secret
  material.
- **P-PACKAGE-PURE**: `vae package verify` and import are pure checks —
  digests recomputed, pins compared, content never executed; a digest swap
  must defeat config AND the generated lock seal simultaneously (E2201,
  E2202, E2205).
- **P-REPRODUCIBLE**: identical inputs produce byte-identical bundles
  (blake3 identity, pinned compression), so any tampering with release
  artifacts is detectable by rebuild-and-compare.
