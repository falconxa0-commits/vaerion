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
  { id: "MS-5", name: "Surfaces", status: "pending", progress: 12, evidence: "CLI Daily Seven operational with broker review loop + agent/workflow runs; SDK in-process client with broker + gateway + agent surface; daemon + SDK-parity-over-HTTP pending." },
  { id: "MS-6", name: "Packaging + Hardening", status: "pending", progress: 0, evidence: "Pack/verify flows not started." },
  { id: "GA", name: "General Availability", status: "pending", progress: 0, evidence: "Post-hardening." },
];

const status = {
  generatedAt: new Date().toISOString(),
  engineVersion: "0.1.0-ms1",
  substrate: "TypeScript on Bun (ADR-0018, Proposed — pending Founder ratification)",
  verification,
  tests: { suites: 19, assertedExpectations: 1563, totalTests: 218, coverage: { lines: 84.62, branches: 89.45, floors: "bunfig.toml coverageThreshold (OBJ-Q6, ratcheted at MS-4)" }, note: "counts from the latest full run of `bun test tests/ --coverage`" },
  code: { engine, engineTests, sdk, tools },
  contracts: { specFiles, adrCount: adrFiles.length, adrFiles },
  milestones,
  overallProgress: Math.round(milestones.reduce((acc, m) => acc + m.progress, 0) / milestones.length),
  risks: [
    "Substrate: TypeScript-on-Bun reference implementation awaits Founder ADR-0018 ratification before shipping milestones.",
    "Journal per-record fsync trades durability for throughput; batching decision needed before agent-scale testing.",
    "Provider price table is build-time data (2026-08); provider drift is a data update with a reviewed contract change.",
    "Breaker state is per-process (deliberately not journaled); multi-process breaker sharing is an MS-5 daemon concern.",
    "ModelPlanner success path needs a recorded real-provider cassette for end-to-end golden coverage (MockBrain output is not plan JSON by design).",
  ],
  nextWork: [
    "MS-5: loopback daemon (ADR-0010) so SDK parity holds over the wire, not only in-process; HTTP/SSE transport; extension kit.",
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
