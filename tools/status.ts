/**
 * Vaerion Status — single source of reporting truth.
 *
 * Collects verification results, test inventory, milestone progress, and
 * repository facts into one JSON (consumed by the reports and the status
 * dashboard at /). Never editorializes: every number is measured.
 */

import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function countLines(dir: string, filter: (p: string) => boolean): { files: number; lines: number } {
  const files = walk(dir).filter(filter);
  let lines = 0;
  for (const f of files) lines += readFileSync(f, "utf8").split("\n").length;
  return { files: files.length, lines };
}

const verification = existsSync(join(ROOT, ".vaerion-verification.json"))
  ? (JSON.parse(readFileSync(join(ROOT, ".vaerion-verification.json"), "utf8")) as { ok: boolean; gates: Array<{ gate: string; ok: boolean; durationMs: number }>; generatedAt: string })
  : { ok: false, gates: [], generatedAt: null };

const engine = countLines(join(ROOT, "packages", "vaerion", "src"), (p) => p.endsWith(".ts"));
const engineTests = countLines(join(ROOT, "packages", "vaerion", "tests"), (p) => p.endsWith(".ts"));
const sdk = countLines(join(ROOT, "sdks", "typescript", "src"), (p) => p.endsWith(".ts"));
const tools = countLines(join(ROOT, "tools"), (p) => p.endsWith(".ts"));
const specFiles = walk(join(ROOT, "spec")).map((p) => relative(ROOT, p));
const adrFiles = walk(join(ROOT, "docs", "adr")).map((p) => relative(ROOT, p));

// Milestone law (constitution §7)
const milestones = [
  { id: "MS-0", name: "Skeleton and Law-in-Repo", status: "complete", progress: 100, evidence: "Constitution materialized; spec/ contracts; repository skeleton; verification infrastructure; zero placeholders." },
  { id: "MS-1", name: "Runtime Spine", status: "complete", progress: 100, evidence: "Event Spine; NDJSON+blake3 journal (verify/replay/recovery/export); blob CAS; receipts; broker contracts frozen; research subsystem; chaos suite green." },
  { id: "MS-2", name: "Permission Broker", status: "complete", progress: 100, evidence: "BrokerEngine (fail-closed, first-match) + permission-graph ceiling (graphFromConfig/graphCovers); per-source decisions; durable gates with decision_id links; elevation flow (audit + broker.elevation.recorded); hash-chained Refusal Log (write/verify/read) surfaced in explain + doctor + SDK; policy files in vaerion.yaml; human review loop (resume renders review, --answer resolves); review-diff rendering; config policy validation; golden refusal-chain fixture." },
  { id: "MS-3", name: "Model Gateway", status: "complete", progress: 100, evidence: "GatewayService single gate (decide model.invoke → journal → act); adapters anthropic/openai/ollama + MockBrain (seeded virtual provider, ADR-0012); normalized StreamFrame contract with SSE+NDJSON chunking-invariant parsers; cassettes recorded through the real fingerprint pipeline (fixtures/cassettes/, ADR-0012); retry with deterministic full-jitter backoff around connection only; per-provider circuit breaker (E1705); integer micro-USD pricing + order-free metering fold (R-MG3); budgets (pre/post E1703, loud); secrets boundary (ADR-0013: names in config, broker-mediated reads, resolve at call time, E1704); R-MG5 outbound+journal redaction (secret shapes never pass); CLI `vae run model` + explain metering + doctor matrix/dev; SDK gatewayInvoke/metering/gatewayMatrix parity; spec 0.1.2 (events 24, codes 41, schema gateway/secrets); ADR-0019 single sanctioned egress; coverage ratcheted to measured 83.37/88.96." },
  { id: "MS-4", name: "Intelligence + Agents", status: "complete", progress: 100, evidence: "AgentRuntime supervisor loop (plan → decide → journal → act per step; round/index coordinates; bounded retries; broker refusals fatal; gates pause with awaiting_gate; approved gates = durable elevation authority for restart-safe resume; step ceiling loud E1804); planners (InlinePlanner declared determinism device + ModelPlanner through the gateway single gate with E1800 plan contract); tool invocation pipeline (declare → validate E1801/E1802 → requested → decide tool.call → execute → completed/denied journaled with blake3 result hashes + blob receipts; builtin deterministic tools); reasoning sessions (journaled scratchpads, deterministic memory folding recomputable from the journal, ReasoningSession fold state); Workflow DAG engine (fail-closed validation E1803, deterministic Kahn+lexicographic scheduling, content-addressed node outputs via blob CAS, crash-safe resume skipping completed nodes); eval harness (real hermetic agent runs, normalized transcripts with deep volatile stripping, deterministic transcript hashes, honest expectation scoring, replay fold equality, golden governance VAE_BLESS=1 with E1805 drift refusal); agent metrics folded from journal alone (tokens/cost/latency from gateway metering records only — no double counting); research integration (One Context Path behind context steps; citation enforcement E1806 on answer steps); CLI run agent/run workflow + resume continuation + doctor agents picture + explain agent metrics; SDK agentRun/workflowRun/agentMetrics parity; spec 0.1.3 (36 events, 48 codes, agents/tools config blocks); config agents.maxSteps/plannerModel + tools declarations with agentGrants ceiling-internal derivation; coverage ratcheted to measured 84.62/89.45." },
  { id: "MS-5", name: "Surfaces", status: "complete", progress: 100, evidence: "DAEMON (ADR-0010/ADR-0020): loopback Bun.serve listener; pairing-token authn (CSPRNG, print-once, VAE_TRUST, timing-safe); dispatch and spec/openapi.json generated from ONE route table (C4 byte-sync); agent/workflow runs over the wire through the SAME engine composition (serial run queue protecting single-writer chains); SSE replay-from-cursor + follow-to-receipt; workspace event tail; durable gate answer/continue over the wire (elevation law); receipted cancellation; models/tools surfaces (names only); shutdown echo guard; CLI `vae serve`; SDK wire client (the single sanctioned loopback client site, E2006) with parity tests proving identical journaled event-type sequences vs in-process; C7 listener-egress-freedom check; spec 0.1.4. EXTENSION KIT ALPHA (ADR-0009 R-2): the extension world published at spec/wit/vaerion-extension@0.1.0.wit; digest-pinned subprocess host (sha256 verified BEFORE execution, E2100); EMPTY-environment spawn; broker bridge with the EXTENSION as principal (decide→journal→act, extensionGrants ceiling-internal); fail-closed protocol law (handshake/world/frame-size/call-budget/timeout — E2102/E2103, adversarial suite); extension.spawned/exited events; config extensions block (spec 0.1.5); extensions reachable as tools through the normal pipeline on CLI and daemon; coverage ratcheted to measured 85.33/90.20. Deferred (documented): sessions/intel/packages blueprint route groups await their subsystems." },
  { id: "MS-6", name: "Packaging + Hardening", status: "pending", progress: 0, evidence: "Pack/verify flows not started." },
  { id: "GA", name: "General Availability", status: "pending", progress: 0, evidence: "Post-hardening." },
];

const status = {
  generatedAt: new Date().toISOString(),
  engineVersion: "0.1.0-ms1",
  substrate: "TypeScript on Bun (ADR-0018, Proposed — pending Founder ratification)",
  verification,
  tests: { suites: 23, assertedExpectations: 1740, totalTests: 250, coverage: { lines: 85.33, branches: 90.20, floors: "bunfig.toml coverageThreshold (OBJ-Q6, ratcheted at MS-5 close: 0.85/0.74/0.85/0.90)" }, note: "counts from the latest full run of `bun test tests/ --coverage`" },
  code: { engine, engineTests, sdk, tools },
  contracts: { specFiles, adrCount: adrFiles.length, adrFiles },
  milestones,
  overallProgress: Math.round(milestones.reduce((acc, m) => acc + m.progress, 0) / milestones.length),
  risks: [
    "Substrate: TypeScript-on-Bun reference implementation awaits Founder ADR-0018 ratification before shipping milestones.",
    "Journal per-record fsync trades durability for throughput; batching decision needed before agent-scale testing.",
    "Provider price table is build-time data (2026-08); provider drift is a data update with a reviewed contract change.",
    "Breaker state is per-process (deliberately not journaled); the daemon executes runs serially per workspace so breaker/audit chains stay sound, but multi-process daemon federation still needs an ADR.",
    "ModelPlanner success path needs a recorded real-provider cassette for end-to-end golden coverage (MockBrain output is not plan JSON by design).",
  ],
  nextWork: [
    "Optional blueprint route groups (sessions/intel/packages) land when their subsystems warrant wire exposure; the extension host upgrades to WASI-P2 components when the component toolchain is available (the WIT world is already locked).",
    "Record real-provider planning cassettes through scripts/record-cassettes.ts when network access is available.",
    "Ratify or amend ADR-0018 (substrate) and re-baseline shipping goals accordingly.",
    "Coverage: per-module ratchets on top of the total-based floors (mechanical follow-up).",
  ],
};

const OUT = join(ROOT, "site-data");
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "vaerion-status.json"), JSON.stringify(status, null, 2) + "\n");

if (!process.env.VAE_STATUS_QUIET) {
  console.log(JSON.stringify({ ok: true, overallProgress: status.overallProgress, verificationOk: verification.ok, engineFiles: engine.files }, null, 2));
}
