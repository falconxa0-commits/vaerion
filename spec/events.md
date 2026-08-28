# Event-Type Registry (D3.7, Article IX)

The envelope `type` field carries a value from this registry. Unknown
types are forwarded untouched by intermediaries (forward-compat duty),
but producers register here first. **Additive-only**: a type, once
published, never changes meaning; removal requires the two-minor
deprecation window (Article VIII, D17.10).

| Type | Emitted by | Meaning |
|---|---|---|
| `engine.version` | api, cli | Engine/contract version metadata or a machine payload summary |
| `engine.error` | cli, api | A refusal or failure envelope: payload carries `{error: {code, message, fix}}` (Guarantee 2 in failure states) |
| `workspace.initialized` | engine | A workspace was scaffolded (audit genesis) |
| `config.validated` | engine | Configuration validated against the versioned schema |
| `config.snapshot.pinned` | engine | A run pinned its configuration snapshot (D19.7) |
| `run.started` | engine | A declared run began; payload carries plan fingerprint + pinned config |
| `run.plan.fingerprinted` | engine | The plan fingerprint was journaled (drift detection, D12.4) |
| `run.step.decision` | engine | A broker decision for a step, journaled BEFORE the act (D11.4) |
| `run.step.started` | engine | A step began executing |
| `run.step.completed` | engine | A step completed; payload carries the tool output |
| `run.step.failed` | engine | A step failed; payload carries the typed failure (D16.8) |
| `run.checkpoint.written` | engine | A checkpoint preceded an effect (D11.6) |
| `run.budget.spent` | engine | Budget accounting event (D11.5) |
| `run.completed` | engine | The run completed; every journaled step succeeded |
| `run.failed` | engine | The run failed with a typed reason |
| `run.parked` | engine | The run parked at a human gate (D5.2, D10.4) |
| `run.resumed` | engine | The run resumed from journal truth (D21.7) |
| `journal.entry.appended` | api | A journal entry was appended (stream wrapper) |
| `journal.verified` | engine/cli/api | A journal chain verified |
| `journal.tamper.detected` | engine | Chain verification failed — tamper evidence (D12.1) |
| `broker.decision` | engine | The broker allowed a request (audited, D10.6) |
| `broker.denied` | engine | The broker denied a request (refusal recorded) |
| `broker.parked` | engine | The broker parked a request at a human gate |
| `tool.invocation.completed` | engine | A tool invocation completed (D16.6) |
| `tool.invocation.failed` | engine | A tool invocation failed with its typed kind |
| `doctor.check` | engine/cli/api | One doctor health check result |
| `research.requested` | engine | A research action was requested (attributable) |
| `research.refused` | engine | Research refused — capability or connector absent (E2007/E2008) |
| `research.evidence.recorded` | engine | Evidence recorded with provenance + fencing (D14.3) |
| `extension.manifest.validated` | engine | An extension manifest validated (D15.1) |
| `extension.state.changed` | engine | Extension lifecycle transition (journaled, D15.2) |
