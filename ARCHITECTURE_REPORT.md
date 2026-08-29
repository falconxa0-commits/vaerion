# ARCHITECTURE_REPORT — Vaerion (as of MS-3)

| | |
|---|---|
| **Date** | 2026-08-29 |
| **Scope** | Architecture state after MS-3 (Model Gateway) — layers, boundaries, data flows, and the one sanctioned seam |
| **Verification** | ALL 6 GATES GREEN (`VERIFICATION_REPORT.md`); layerlint: 67 files / 208 runtime edges / 0 violations |

---

## 1. Layer model (enforced by `tools/layerlint.ts`)

| Layer | Contents | May depend on |
|---|---|---|
| L0 | `kernel/` (errors, ids, clock, canonical, redact, hash), `config/` | nothing above |
| L1 | `spine/`, `journal/`, `store/`, `receipts/`, `broker/` (contracts + engine + refusal log), `gateway/` | L0 |
| L2 | `runtime/run.ts`, `research/` | L0, L1 |
| L4 | `cli/` | L0–L2 |
| SDK | `sdks/typescript` (in-process projection of the engine) | engine public API |

**MS-3 change**: `gateway/` enters L1. It consumes broker contracts and kernel
ports; it never imports runtime or CLI. The `secretGrantFor` helper lives in
`broker/engine.ts` (not config) so L0 stays free of L1 runtime imports — the
one layer violation introduced mid-milestone was caught by layerlint and
removed at root. Type-only imports remain exempt by the documented rule.

## 2. The Model Gateway — where it sits in the constitution

```
                    ┌──────────────────────────────────────────────┐
                    │  vaerion.yaml — ceilings: gateway.providers, │
                    │  budgets, secret NAMES + grants (ADR-0013)   │
                    └──────────────────────┬───────────────────────┘
                                           │ graphFromConfig
   CLI `vae run model` ─┐                  ▼
   SDK gatewayInvoke ───┼─→ RunHarness.decide ─→ BrokerEngine (shape →
                        │   (model.invoke /      ceiling → policy, fail-
                        │    secret.read)        closed; journaled decision;
                        │                        deny → Refusal Log)
                        │                          │ allow
                        ▼                          ▼
              ┌─────────────────────── GatewayService.invoke ──────────┐
              │ budget pre-check (E1703) → breaker admit (E1705) →     │
              │ R-MG5 outbound redaction → retries (E1706/E1601 only,  │
              │ full-jitter, connection establishment ONLY) → stream   │
              │ consumption (never retried) → metering journal →       │
              │ post-budget loud stop (E1703, spend stays journaled)   │
              └──────────────┬─────────────────────────┬───────────────┘
                             │                         │
                 ProviderAdapter (open)         host.emit (spine + journal)
                 anthropic│openai│ollama│mockbrain        gateway.invoke.recorded
                             │                                │ gateway.invoke.failed
                             ▼
              GatewayTransport — THE single sanctioned egress (ADR-0019)
              fetchTransport (production) · cassetteTransport (replay law)
              · scripted transports (tests) — same port, same fingerprints
```

Constitutional properties, all gate-enforced:

- **One gate (D-J)**: every model I/O crosses `GatewayService.invoke`; the broker decides first; denials are journaled + refusal-logged; nothing bypasses the journal (R-RT2).
- **One seam (C1/ADR-0019)**: exactly one engine file carries URLs/`fetch` — allowlisted by the constitutional scanner; adapters name host keys, never endpoints.
- **One canonical wire form (R-MG1)**: provider shapes never leak past the adapters; downstream sees `StreamFrame`s only.
- **Zero telemetry (P10/D-K)**: providers receive exactly the declared payload after deterministic redaction; a secret shape never leaves the machine (`[REDACTED len=N]`), and the journal stores the redacted text + blake3 hash, never the secret.
- **Determinism (P2)**: timing and jitter run through the injected Clock/Rng; MockBrain proves the ideal — identical seed ⇒ byte-identical journals.

## 3. Data flows (MS-3 additions)

1. **Invocation**: request → broker decision (journaled) → [secret decision (journaled)] → breaker → redacted outbound → adapter → transport → frames → usage/cost/text-hash → `gateway.invoke.recorded` (journaled) → receipt on close. Terminal failures after authorization → `gateway.invoke.failed` (never silent).
2. **Metering**: `meteringFromRecords` folds journal records — order-free, integer-only, replay-identical; surfaced identically by CLI `explain` and SDK `metering()`.
3. **Hermetic replay**: cassettes are committed transcripts whose fingerprints are computed through the real pipeline (`scripts/record-cassettes.ts` records via the actual adapters); replay matches by blake3 fingerprint, fails closed on a miss.
4. **Prompt pause**: a `prompt` policy throws `GatewayGatePrompt` with the open durable gate; `vae resume --answer` resolves it and records the elevation — the same human-authority loop as MS-2, now guarding model spend.

## 4. State stores (unchanged law, new payloads)

| Store | Writer | MS-3 role |
|---|---|---|
| Run journal (NDJSON + blake3 chain) | single-writer lock | `gateway.invoke.recorded`/`failed` events; metering folds from here alone |
| Audit ledger | ChainedAuditWriter | decisions + elevations (unchanged) |
| Refusal Log | RefusalLogWriter | `model.invoke`/`secret.read` denials |
| Blob CAS | BlobStore | unchanged (not used by the gateway) |
| Config `vaerion.yaml` | human | `gateway.providers` ceilings, `gateway.budgets`, `secrets` NAMES + grants |

Deliberately NOT a store: breaker health (per-process live state; the failures themselves are journaled — an MS-5 ADR will decide multi-process sharing).

## 5. Trade-offs and honest gaps

- **Collect-then-consume streaming**: the service currently materializes frames before returning (`InvocationResult.frames`); incremental consumer streaming over the same normalized contract is deferred (the Spine bus already supports ordered fan-out — MS-4 agent loops will drive this).
- **Retry scope**: connection establishment only, by law; mid-stream failures are terminal for the invocation (partial output must never be re-sent or double-metered).
- **Egress matrix**: v0.1 ships three providers + MockBrain; adding a provider is one adapter + one endpoint entry + a reviewed price-table row.
- **daemon direction**: ADR-0019 covers the outbound provider direction; the MS-5 loopback daemon adds an inbound listener and must amend the ADR.
