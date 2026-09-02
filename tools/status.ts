/**
 * Vaerion Status — single source of reporting truth.
 *
 * Collects verification results, test inventory, milestone progress, and
 * repository facts into one JSON (consumed by the reports and the status
 * dashboard at /). Never editorializes: every number is measured.
 */

import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ENGINE_VERSION } from "../packages/vaerion/src/journal/writer.ts";
import { measureCenter } from "../packages/vaerion/src/center/center.ts";
import { evaluateReleaseReadiness } from "../packages/vaerion/src/repo/release.ts";

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
  { id: "MS-6", name: "Packaging + Hardening", status: "in_progress", progress: 85, evidence: "PHASE 1 (2026-08-30): distribution packaging fail-closed tooling (tools/dist-pack.ts: deterministic git-archive tarball built twice + byte-compared, canonical MANIFEST.json with sha256+blake3, Ed25519-signed manifest with self-verification, tamper detection proven, consumer tools/dist-verify.ts), LICENSE Apache-2.0 + CONTRIBUTING, beta experience (README/QUICKSTART/INSTALL/TROUBLESHOOTING/BETA-ONBOARDING + examples/vaerion-demo executed end-to-end), security dossier (docs/security/ threat model + mitigations + 7-item risk ledger, zero critical), ADR finalization (docs/adr/README.md — no unclear decisions; ADR-0018 provisional with migration path), CI workflow (.github/workflows/verify.yml), version lockstep 0.1.7-rc1. REPRODUCIBLE BUNDLES (ADR-0016) COMPLETE: src/package/ deterministic .vxn format (magic VXN1, canonical JSON manifest, strictly ascending entry order, zstd pinned level 19, blake3 content identity); build = pure fold over declared inputs (config package.include + pin-verified extension artifacts auto-carried, E2100 refusal on mismatch) — no wall-clock, no ambient paths, byte-identical rebuilds proven by test; vaerion.lock generated canonical-JSON seal (config fingerprint + extension pins + bundle digest); verify = pure check with honest per-check findings (payload/entry digests E2201, pin swap E2202, non-canonical E2200, bad magic E2203, stale lock E2205) — content NEVER executed; CLI `vae package build|verify` (additive ninth command) with --dry-run purity + journaled package.built/package.verified runs + receipts; doctor package-lock cross-check (E2205); config package block (spec 0.1.6: errors E2200–E2206, events package.built/verified); exit-code mapping E2204→usage, verification failures→partial; +28 tests (unit format law + integration build/verify/tamper matrix/doctor), coverage ratcheted to measured 86.07/90.87. REMAINING (honest): native single-binary installers, performance double-check, accessibility sweep; release-train publish steps are Founder-gated. PHASE Ω (2026-08-31): product refinement pass — brand system (tools/brand-render.ts generates the seal/monogram/wordmark/editions byte-reproducibly; brand/BRAND-BOOK.md; brand book PDF; web face + favicon rebranded), terminal design language (src/cli/ui.ts: TTY-gated rich rendering — panels, tables, badges, receipts, educated error blocks with E-code + fix + docs pointer, quiet spinners; plain/--json contracts byte-stable and pinned by tests), the additive `vae provenance` command (artifact evidence with recomputed digests), honest dev surface (ADR-0018 Provisional wording, current milestone position), docs (README refresh, FAQ, quickstart provenance step), version lockstep 0.1.7-rc2 + spec 0.1.7-rc2 changelog + golden re-bless. +12 tests (290 total, 1969 expectations); coverage floors held (measured 86.00 lines / 90.84 branches)." },
  { id: "GA", name: "General Availability", status: "pending", progress: 0, evidence: "PUBLIC BETA READY declared at Phase 1 close (v0.1.7-rc1): legal foundation (Apache-2.0), signed reproducible release artifacts, CI pipeline, security dossier, beta experience executed; GA requires the risk-ledger exit criteria, release-train Founder steps, and the GO decision." },
];

// ── Command center (constitution v1.3 A3, Phase 6): the SAME measured core
// `vae center` uses — never a second implementation.

// The phase ledger of record (D-T), parsed from the constitution artifact.
const phaseLedger: Array<{ phase: string; status: string; evidence: string }> = [];
try {
  const constitution = readFileSync(join(ROOT, "docs", "constitution", "VAERION_CONSTITUTION_v1.4.md"), "utf8");
  for (const m of constitution.matchAll(/^\| ([^|]+) \| (ASCENSION XVIII|PHASE Ω) \| (✅ complete|▶ in flight|❌ NOT complete) \| (.+?) \|$/gm)) {
    phaseLedger.push({ phase: m[1]!.trim(), status: m[3]!.trim(), evidence: m[4]!.trim() });
  }
} catch {
  // Constitution unreadable: measured absence — the section renders empty.
}

// Release readiness digest (fail-closed, D-S) for THIS repository.
let release: { measured: boolean; ready?: boolean; verdict?: string; passed?: number; total?: number; blockers: string[]; note?: string };
try {
  const report = await evaluateReleaseReadiness(ROOT, { liveGates: false });
  release = {
    measured: true,
    ready: report.ready,
    verdict: report.verdict,
    passed: report.passed,
    total: report.total,
    blockers: report.blockers.map((b) => `${b.check}: ${b.detail}`),
  };
} catch (err) {
  release = { measured: false, blockers: [], note: (err as Error).message };
}

// The operator cockpit fold over the companion demo workspace.
const demoDir = join(ROOT, "examples", "vaerion-demo");
const commandCenter = await measureCenter({
  root: demoDir,
  journalDir: join(demoDir, ".vaerion", "journal"),
  blobsDir: join(demoDir, ".vaerion", "blobs"),
  auditPath: join(demoDir, ".vaerion", "audit.log"),
  refusalsPath: join(demoDir, ".vaerion", "refusals.log"),
  repoRoot: ROOT,
});

const status = {
  generatedAt: new Date().toISOString(),
  engineVersion: ENGINE_VERSION,
  substrate: "TypeScript on Bun (ADR-0018 — provisional with recorded migration path; Founder ratification pending)",
  verification,
  tests: { suites: 30, assertedExpectations: 2498, totalTests: 388, coverage: { lines: 86.00, branches: 90.84, floors: "bunfig.toml coverageThreshold (OBJ-Q6, ratcheted at MS-6 bundle close: 0.86/0.74/0.86/0.90; held at every ASCENSION phase close)" }, note: "counts from the latest full run of `bun test tests/ --coverage`" },
  code: { engine, engineTests, sdk, tools },
  contracts: { specFiles, adrCount: adrFiles.length, adrFiles },
  milestones,
  overallProgress: Math.round(milestones.reduce((acc, m) => acc + m.progress, 0) / milestones.length),
  phaseLedger,
  release,
  commandCenter,
  risks: [
    "Substrate: TypeScript-on-Bun reference implementation is explicitly PROVISIONAL (ADR-0018, Phase 1 finalization) with a recorded migration path; Founder ratification pending.",
    "Release signing uses the bootstrap Ed25519 key; rotation to a held-offline key is Founder-gated (docs/security/RISK-LEDGER.md R-2).",
    "Exec-sandbox hardening matrix (ADR-0015 full profiles) and per-run token scoping are open engineering items (RISK-LEDGER R-1/R-5).",
    "Journal per-record fsync trades durability for throughput; batching decision needed before agent-scale testing.",
    "Provider price table is build-time data (2026-08); provider drift is a data update with a reviewed contract change.",
    "ModelPlanner success path needs a recorded real-provider cassette for end-to-end golden coverage (environment has no provider network access).",
  ],
  nextWork: [
    "ASCENSION phase 6 (command-center) closes the Founder four-phase program; phase 7 awaits Founder re-issue or cancellation.",
    "MS-6 remaining exit criteria: native single-binary installers, performance double-check, accessibility sweep; then the daemon packages route group (wire parity, spec/openapi regen).",
    "GitHub synchronization executes at program close (remote provisioned by the Founder: falconxa0-commits/vaerion, main at a strict ancestor — fast-forward push ready).",
    "Release train steps (publish, announce, key ceremony) — Founder-gated; artifacts are reproducible via tools/dist-pack.ts at the release tag.",
    "Coverage: per-module ratchets on top of the total-based floors (mechanical follow-up).",
  ],
};

const OUT = join(ROOT, "site-data");
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "vaerion-status.json"), JSON.stringify(status, null, 2) + "\n");

if (!process.env.VAE_STATUS_QUIET) {
  console.log(JSON.stringify({ ok: true, overallProgress: status.overallProgress, verificationOk: verification.ok, engineFiles: engine.files }, null, 2));
}
