# SPEC CHANGELOG

All changes to files under `spec/` are recorded here. Evolution is
additive-only within a major version; removals require a major bump and a
deprecation window. Every entry requires two approvals on the change itself.

## 0.1.4 — 2026-08-29 (MS-5 surfaces: local API daemon; additive only)

Additive contract surface for the local API daemon (MS-5, ADR-0010 +
ADR-0020). Nothing removed, nothing renamed; all prior v0.1 documents remain
valid unchanged.

- `openapi.json` — NEW. The machine-readable description of the daemon's
  HTTP/SSE surface, GENERATED deterministically from the same route table
  that dispatches requests (ADR-0010 decision 4: an "API gap" is impossible
  by construction). Only implemented routes are described. Constitutional
  check C4 verifies this file never drifts from the generator.
- `errors.yaml` — added the 20xx range (local API daemon, ADR-0010): `E2000`
  daemon_auth_required, `E2001` daemon_bind_refused, `E2002`
  daemon_route_unknown, `E2003` daemon_run_unknown, `E2004`
  daemon_shutdown_echo_mismatch, `E2005` daemon_cancel_unavailable, `E2006`
  daemon_nonloopback_refused. Catalog version stays 1; codes are additive
  and never reused (ADR-0014).

## 0.1.3 — 2026-08-29 (MS-4 intelligence + agents; additive only)

Additive contract surface for the Agent Runtime, Workflow DAG Engine,
Reasoning Sessions, and Evaluation Harness (MS-4). Nothing removed, nothing
renamed; all prior v0.1 documents remain valid unchanged.

- `events/registry.json` — added event types `agent.run.started`,
  `agent.step.recorded`, `agent.step.failed`, `agent.run.completed`,
  `workflow.started`, `workflow.node.started`, `workflow.node.completed`,
  `workflow.node.failed`, `workflow.completed`, `reasoning.note.recorded`,
  and `reasoning.folded`. Registry version stays 1; evolution is additive
  per ADR-0002.
- `errors.yaml` — added the 18xx range (agents, workflow, evals): `E1800`
  agent_plan_invalid, `E1801` agent_tool_unknown, `E1802`
  agent_tool_args_invalid, `E1803` workflow_dag_invalid, `E1804`
  agent_step_limit_exceeded, `E1805` eval_golden_mismatch, `E1806`
  citation_enforcement_violation. Catalog version stays 1; codes are
  additive and never reused (ADR-0014).
- `schemas/vaerion-yaml.schema.json` — added optional top-level `agents`
  block (`maxSteps` positive integer; `plannerModel` canonical
  provider/model-id string) and optional top-level `tools` array
  (declarations with `name`, optional `scope`, optional `description`).
  Declaring a tool grants nothing by itself — `tool.exec` authorization
  still requires explicit broker policy rules. Strict unknown-key
  rejection is unchanged.

## 0.1.2 — 2026-08-29 (MS-3 model gateway; additive only)

Additive contract surface for the Model Gateway (MS-3, the single gate per
constitution D-J). Nothing removed, nothing renamed; all prior v0.1 documents
remain valid unchanged.

- `events/registry.json` — added event types `gateway.invoke.recorded`
  ("A model invocation completed through the gateway single gate; the
  payload carries usage, integer micro-USD cost, attempts, latency, the
  redacted assembled text, and the broker decision link.") and
  `gateway.invoke.failed` ("A model invocation failed after its broker
  decision — secret unresolved, breaker open, transport refusal, budget
  stop; the payload carries the error code and the decision link.").
  Registry version stays 1; evolution is additive per ADR-0002.
- `errors.yaml` — added the 17xx range (model gateway): `E1700`
  gateway_model_unknown, `E1701` gateway_op_unsupported, `E1702`
  gateway_stream_invalid, `E1703` gateway_budget_exceeded, `E1704`
  gateway_secret_unresolved, `E1705` gateway_breaker_open, `E1706`
  gateway_transport_refused. Catalog version stays 1; codes are additive
  and never reused (ADR-0014).
- `schemas/vaerion-yaml.schema.json` — added optional top-level `gateway`
  block (`providers` over the known keys anthropic|openai|ollama with
  `enabled` + optional `models`; `budgets.tokensPerRun` /
  `budgets.microUsdPerRun` as non-negative integers) and optional
  top-level `secrets` block (NAME → `grant: [principal-id patterns]`;
  names only — values are resolved exclusively at call time per ADR-0013).
  Strict unknown-key rejection is unchanged.
- 0.1.2 correction (same date, during MS-3 verification): the
  `gateway.providers` propertyNames enum and pattern were widened to
  include `mockbrain` — the ADR-0012 seeded virtual provider is declared
  like any provider, so its reachability stays governed by the same
  fail-closed ceiling law (declaring it grants nothing). The prior text
  ("mockbrain is always available and is not declared here") contradicted
  the ceiling law and is superseded by this entry.

## 0.1.1 — 2026-08-29 (MS-2 broker wiring; additive only)

Additive contract surface for the Permission Broker engine (MS-2). Nothing
removed, nothing renamed; all prior v0.1 documents remain valid unchanged.

- `events/registry.json` — added event type `broker.elevation.recorded`
  ("A human approval elevated a prompt decision into an authorized action;
  the elevation is journaled and audited."). Registry version stays 1;
  evolution is additive per ADR-0002.
- `schemas/gate.schema.json` — added optional `decision_id` (string,
  minLength 1): the journal link from a durable gate back to the prompt
  decision that opened it. Optional, so all v0.1 gate records remain valid.
- `schemas/journal-record.schema.json` — the inline `gateRecord` definition
  gains the same optional `decision_id` property (mirror of gate.schema.json).
- `schemas/broker-decision.schema.json` — added optional `action` (object):
  the request's action parameters, redacted before journaling — decisions
  never carry secrets. Optional, so all v0.1 decision records remain valid.
- `schemas/vaerion-yaml.schema.json` — added optional top-level `policy`
  block: `policy.rules[]` with `id`, `principalKinds` (`"all"` or a
  non-empty array of principal kinds), `domain`, `scope`, `effect`
  (`allow|deny|prompt`), optional `gateLabel`, and required `rationale`.
  Strict unknown-key rejection is unchanged.

## 0.1.0 — 2026-08-29

Initial publication of the contract set. Additive initial release; no prior
versions exist, so nothing is deprecated or removed.

Published contracts:

- `schemas/envelope.schema.json` — event spine envelope, version 1: required
  `v`, `type`, `seq`, `ts` (RFC3339 UTC, millisecond precision), `trace_id`,
  `span_id`, `actor {kind, id}`, `cause {kind, ref}`, `payload`; journal-read
  form requires `seq >= 1`.
- `schemas/journal-record.schema.json` — hash-chained journal record, version
  1: kinds `meta`, `evt`, `decision`, `gate`, `snapshot`, `receipt` over the
  common chain fields `k`, `i`, `prev`, `hash`.
- `events/registry.json` — event type registry, version 1 (envelope v1): the
  initial registered set across run lifecycle, spine/journal, receipts,
  broker, research, tools, and store prefixes. Additive-only going forward.
- `errors.yaml` — diagnostic catalog, version 1: the initial E#### ranges
  (1xxx journal/persistence, 11xx event spine, 12xx configuration, 13xx
  permission broker, 14xx research, 15xx runtime/restore, 16xx
  surface/usage, 19xx internal invariants), each entry carrying `name`,
  `summary`, and `fix`.
- `schemas/vaerion-yaml.schema.json` — configuration schema 0.1
  (`schemaVersion: "0.1"`): strict unknown-key rejection, zero-telemetry
  structure (`telemetry.enabled` const false), declared permission ceilings
  and research capabilities.
- `schemas/capability-declaration.schema.json`,
  `schemas/broker-decision.schema.json`, `schemas/gate.schema.json` —
  broker contracts, version 1 (frozen ahead of the broker engine per
  ADR-0004): declared-before-requested capabilities, fail-closed decisions
  (`allow` / `deny {E1300,E1301}` / `prompt`), and durable human gates.
- `schemas/evidence-record.schema.json` — research evidence record, version
  1: blob-ref-by-reference (`blake3`), fenced excerpts, mandatory provenance.
- `schemas/receipt.schema.json` — run receipt, version 1: journal-derived
  counts, blob refs, and head hash.

Notes:

- Envelope `type` values are constrained by `events/registry.json` at emit
  time; the envelope schema intentionally admits any event type string to
  preserve the read-time forward-compat duty (unknown types are forwarded
  untouched).
- This initial set is the mirror target for the runtime modules verified in
  MS-1; `tools/verify.ts` asserts spec/mirror sync.
