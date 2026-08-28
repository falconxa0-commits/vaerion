# Vaerion — Architecture (L0–L4)

> Structure is policy; dependency direction is law; the spec folder is
> a courtroom with daylight (Stage 6).

## The layer law (D6.4)

```
L4  Porcelain        : vae-cli · sdks/*
L3  Public API       : vae-api (daemon + service layer)
L2  Domain services  : agent · workflow · context(+research) · intel · ext-host · package
L1  Primitives       : store(journal/spine/blobs) · capabilities(broker) · tools · gateway
L0  Foundation       : foundation(envelope/errors/ids/clock/hash) · config
```

Dependency matrix, mechanically enforced by `tools/layerlint.ts`
(merges block on red, Article XIV):

| From ↓ To → | L0 | L1 | L2 | L3 | L4 |
|---|---|---|---|---|---|
| L0 | ✅ | ✗ | ✗ | ✗ | ✗ |
| L1 | ✅ | ✅ | ✗ | ✗ | ✗ |
| L2 | ✅ | ✅ | ✅ | ✗ | ✗ |
| L3 | ✅ | types-only | ✅ | ✅ | ✗ |
| L4 | ✅ | ✗ | ✗ | ✅ | ✅ |

`vae-cli` consumes the L3 service layer, not L2 internals — the CLI
exercises exactly what external principals get; an API gap is
impossible by construction. `tools/` is the court (verification
tooling), outside the layer system, shipped to no one.

## The fourteen units (D6.2)

| Unit | Layer | Owns | Key law |
|---|---|---|---|
| `vae-foundation` | L0 | envelope, errors, exit codes, ULID, clock, canonical JSON, blake3, redaction, receipts, money | D3.7, D9.3, D12.1, D8.3 |
| `vae-config` | L0 | VaerYaml strict subset, schema validation, layered resolution, pinned snapshots | D19.1–D19.10 |
| `vae-store` | L1 | journal chains (run + audit), blob store, event spine, single writer | D12.1, D12.2, D9.1, D11.1 |
| `vae-capabilities` | L1 | PermissionBroker: pure decisions, fail-closed, deny-beats-allow, park gates, refusal log | D10.1–D10.7, D2.6 |
| `vae-tools` | L1 | tool registry, strict contracts, effect classes, typed failures, engine builtins | D16.1–D16.8 |
| `vae-gateway` | L1 | provider ports, explicit chains, breaker (5/30s→30s), recording postures, pricing | D13.1–D13.5 |
| `vae-intel` | L2 | indexer pipeline ports, query DSL contract | MS-4 (ports only now) |
| `vae-context` | L2 | One Context Path types, provenance, fencing, pack contract, research foundation | D14.1–D14.4 |
| `vae-ext-host` | L2 | extension manifests, compatibility ranges, lifecycle state machine | D15.1–D15.4, D15.2 |
| `vae-workflow` | L2 | declared plans, deterministic DAG scheduling, checkpoints, park semantics | D11.2, D11.6, D5.2 |
| `vae-agent` | L2 | budget meter, journaled-decision law, engine services (init/run/resume/doctor/journal/explain) | D11.3–D11.5, D1.3 |
| `vae-package` | L2 | .vxn manifest contract, fingerprinting, reproducibility declaration | D8.2, D21.2 |
| `vae-api` | L3 | loopback daemon, pairing token, envelope responses, NDJSON streams, OpenAPI emission | D17.1, D17.7, D17.9, D7.2 |
| `vae-cli` | L4 | the `vae` binary: Daily Seven, Five Guarantees, three renderings | D3.2, Part IV, D18.x |

## One core, two postures (D7.1, D7.2)

The engine composes once — `openEngineContext()` — and serves two
postures: the CLI runs it **embedded** in-process; the daemon serves it
**over the socket**. Both surfaces speak the same contracts; no side
channels exist (D7.5). Contract tests assert behavioral parity (Stage 7
recovery strategy).

## Determinism boundaries (Sacred Invariant III)

- Decisions are pure functions of declared inputs (D10.3).
- Wall-clock time is injected (`Clock`) and appears only in declared
  metadata (`ts`), never in decisions (D11.4).
- Serialization is canonical (sorted keys, compact) — identical state
  hashes identically (D12.1).
- Non-determinism is declared (tool `deterministic` flag, gateway
  recording postures) — never ambient.
- Verified by double-run equality: identical inputs produce
  byte-identical journals (tested, D20.3 posture).
