# @vaerion/sdk — TypeScript SDK (preparation, MS-5 conformance-locked)

A thin, fully typed client for the Vaerion local daemon (loopback +
pairing token, D17.9). The SDK speaks ONLY the canonical envelope
(D17.7) and the versioned OpenAPI contract (`spec/openapi.json`).

## Status (honest, D22.4)

- IMPLEMENTED: typed envelope model, token-authenticated client,
  health / runs / journal-stream calls, NDJSON parsing.
- DEFERRED TO MS-5: generated-from-spec codegen, parity conformance
  suite against the daemon (D17.2, D20.8), the Python SDK.

## Usage (daemon running, token from `.vaerion/token`)

```ts
import { VaeClient } from "@vaerion/sdk";

const vae = new VaeClient({ baseUrl: "http://127.0.0.1:7897", token });

const health = await vae.health();          // Envelope
const runs = await vae.runs();              // Envelope with RunSummary[]
for await (const ev of vae.journal(runId)) { // NDJSON envelope stream
  // ev.type: "journal.entry.appended"
}
```

Parity law: whatever `vae` (the CLI) can do, this SDK can do at equal
fidelity — a parity gap is a C2 violation (D17.5). The parity suite
arrives with the MS-5 milestone and locks these calls to golden
fixtures.
