# Vaerion TypeScript SDK — `@vaerion/sdk`

> **Provenance note.** Written for `@vaerion/sdk` `0.1.12-rc1` from the
> actual source of record: `sdks/typescript/src/index.ts`,
> `src/daemon.ts`, `src/daemon-transport.ts`, and
> `sdks/typescript/package.json`. Only exports and methods that exist are
> documented; `src/index.ts` is the authoritative export list.

## What the SDK is

`@vaerion/sdk` is the programmatic TypeScript surface of the Vaerion
engine. It is a **projection of the engine, never a second implementation**
(machine parity law, Sacred Invariant #7): the SDK exercises the SAME
contracts the CLI does — same engine calls, same envelopes, same receipts.

**The parity guarantee is tested, not assumed.**
`packages/vaerion/tests/integration/sdk-parity.test.ts` drives the same
workspace through both surfaces and asserts they agree on run ids, journal
verification, receipts, and redacted exports (and that a CLI-issued run is
visible to SDK restore as byte-identical state). The test header states
the law:

> Machine parity test (Sacred Invariant #7): SDK ⇄ CLI over the same
> engine. Both surfaces must agree on run ids, journal verification,
> receipts, and redacted exports — parity is tested, not assumed.

## Installation and consumption

The SDK is a **workspace package of this repository** (`private: true`,
`main: ./src/index.ts`), depending on `@vaerion/engine` via
`workspace:*`. Bun executes TypeScript directly, so today's supported
consumption is from source inside the repository:

```sh
bun install --frozen-lockfile        # repository supply-chain law
```

```ts
import { VaeClient } from "@vaerion/sdk";
```

Honest note on npm: the publishable tarball built by
`packaging/npm/make-package.sh` (`dist/npm/vaerion-<version>.tgz`) is the
**CLI** distribution — the `vaerion` npm package installs the `vae`
binary and the engine source; it does not ship `@vaerion/sdk`. SDK
publication to a registry is a release-train step and remains
Founder-gated (risk-ledger F-5). See `docs/INSTALL.md` for the verified
CLI install paths.

## The in-process client — `VaeClient`

The in-process client binds directly to the engine (no network). It
operates on exactly one workspace — `vaerion.yaml` + `.vaerion/` —
resolved from `cwd` (default: `process.cwd()`).

```ts
import { VaeClient } from "@vaerion/sdk";

const vae = new VaeClient({ cwd: "./my-workspace" });

// Machine-parity anchor: run any CLI argv in --json mode.
// raw() appends --json for you and returns { code, lines } (NDJSON objects).
const help = await vae.raw(["init", "--name", "my-project"]);

// The full research pipeline, in-process — the same path `vae run research`
// takes. Throws (with .code and .lines attached) on a non-zero exit.
const run = await vae.runResearch({
  sources: ["./docs"],
  query: "journal deterministic",
  maxDocs: 8,
});
// => { runId, traceId, documents, hits: [{ doc_id, score }], receipt, journalVerified }
```

Verified method surface (see `src/index.ts` for signatures):

| Method | Parity with the CLI |
|---|---|
| `raw(args)` | Any CLI argv in stable `--json` machine mode |
| `init(name)` | `vae init --name NAME` |
| `runResearch({sources, query, maxDocs?})` | `vae run research` |
| `journalList()` | `vae journal ls` — reads `.vaerion/journal/` |
| `journalVerify(runId)` | `vae journal verify` — `VerifyReport` |
| `journalRecords(runId)` | the raw hash-chained `JournalRecord[]` |
| `journalExport(runId, out?)` | `vae journal export` — redacted derivation |
| `restoreState(runId, traceId)` | deterministic replay (`replayRecords` over the journal; no locks held) |
| `blobs()` / `openBlob(ref)` | content-addressed blob access behind `blob_refs` |
| `resume({runId, answer?})` | `vae resume` — pending-gate resolution |
| `refusals(runId?)` | the workspace Refusal Log (`vae doctor`'s refusal view) |
| `verifyRefusals()` | refusal-log chain verification (same chain law as journals) |
| `verifyRunEvidence(runId)` | evidence ↔ blob bytes ↔ fingerprint triangulation |
| `verifyAudit()` | audit-ledger verification (machine parity with `vae doctor`) |
| `gatewayInvoke({request, intent?, transport?, secrets?})` | `vae run model` through the gateway SINGLE GATE (broker decision → adapter → sanctioned transport → metering → receipt) |
| `metering(runId)` | the gateway metering rollup, identical to `vae explain` |
| `gatewayMatrix()` | the declared capability matrix (`vae doctor`/`dev`) |
| `agentRun({goal, steps?, maxSteps?, tools?, ...})` | `vae run agent` — supervised loop over journaled decisions |
| `workflowRun({dag, ...})` | `vae run workflow` — fail-closed DAG, journaled topological execution |
| `agentMetrics(runId)` | agent metrics, a pure fold identical to `vae explain` |

Transport and secrets are injectable on the gateway/agent/workflow
surfaces (`transport?: GatewayTransport`, `secrets?: SecretPort`); tests
stay hermetic via cassettes/MockBrain, and production defaults to the
sanctioned fetch site and keychain-first resolution (ADR-0019, ADR-0013).

The SDK also re-exports the engine primitives it composes — `RunHarness`,
`BlobStore`, `GatewayService`, `AgentRuntime`, `InlinePlanner`,
`ToolRegistry`, `WorkflowEngine`, `loadConfig`, `graphFromConfig`,
`policyFromConfig`, clock/rng/idgen, and the record/report types — so
consumers can type everything without reaching into the engine barrel.
The full list is the export block of `src/index.ts`.

## The daemon client — `VaeDaemonClient` (MS-5)

For editor-style integration the SDK ships a wire client for the local
API daemon (`vae serve`), reaching the SAME contracts over HTTP/SSE
(ADR-0010, ADR-0020).

```ts
import { VaeDaemonClient } from "@vaerion/sdk";

const daemon = new VaeDaemonClient({
  base: "http://127.0.0.1:7897", // loopback enforced — E2006 otherwise
  token: "<the pairing token>",
});

await daemon.health();                  // { ok, engine_version, uptime_ms } (unauthenticated)
await daemon.version();                 // unauthenticated
await daemon.openapi();                 // unauthenticated — the generated contract
const started = await daemon.startAgentRun({ goal: "..." });
const status  = await daemon.getRun(started.run_id);
for await (const evt of daemon.streamRunEvents(started.run_id)) {
  // journaled events, SSE with journal cursor replay; ends when the run seals
}
```

### Pairing-token authentication (ADR-0010)

The daemon binds loopback only (default `127.0.0.1:7897`) and generates a
pairing token at start, **printed once** to the terminal. Clients send
`Authorization: Bearer <token>` on every call except the unauthenticated
metadata endpoints (`/health`, `/version`, `/openapi.json`). Headless
starts pre-provision the token via `VAE_TRUST=<token>` (`vae serve` never
prints it in that case). Non-loopback binds are refused server-side
(`E2001`); the wire client refuses non-loopback bases **in code** before a
single byte is sent (`assertLoopbackBase`, `E2006`) — remote attachment
waits for a ratified transport-security ADR. There is no flag that opens
the daemon to the network.

### Verified method surface

- Metadata (unauthenticated): `health()`, `version()`, `openapi()`
- Runs: `startAgentRun({goal, planner?, steps?, maxSteps?})`,
  `startWorkflowRun(dag)`, `listRuns()`, `getRun(runId)`,
  `answerGate(runId, gateId, answer?)`, `continueRun(runId, dag?)`,
  `cancelRun(runId)`
- Event streams (SSE): `streamRunEvents(runId, {cursor?, follow?, signal?})`,
  `streamWorkspaceEvents({after?, types?, follow?, limit?, signal?})`
- Capability surfaces: `listModels()`, `getModel(logical)`, `listTools()`
- Admin: `shutdown()` (echoes the token in the body, per the CLI contract)

Human gates surface over the API identically to the CLI: pending gates are
pollable and answerable through the runs endpoints, backed by the same
durable gate records (ADR-0010 §5).

### The wire transport

`DaemonWireTransport` (and `assertLoopbackBase`) is the ONE sanctioned
client egress site — symmetric to the gateway's single sanctioned egress
(ADR-0019). It is a client to the LOCAL DAEMON only: never a second
gateway, never a telemetry sink, never a generic HTTP helper. `WireResponse`
carries `{ status, body }`; daemon errors raise with the daemon's stable
E-code and `fix` hint attached to the thrown error.

---

*Parity is the law of this surface: if the CLI contract moves, the SDK
moves with it, and `sdk-parity.test.ts` fails before any doc or consumer
could drift.*
