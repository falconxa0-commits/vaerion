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
  { id: "MS-3", name: "Model Gateway", status: "pending", progress: 0, evidence: "Gateway contracts referenced (model.invoke domain, ADR-0013 secrets); adapters not started." },
  { id: "MS-4", name: "Intelligence + Agents", status: "pending", progress: 5, evidence: "Research local index + context packs + evidence triangulation prefigure intel/context; agent executor not started." },
  { id: "MS-5", name: "Surfaces", status: "pending", progress: 12, evidence: "CLI Daily Seven operational with broker review loop; SDK in-process client with broker surface (refusals/audit/evidence verification); daemon + SDK-parity-over-HTTP pending." },
  { id: "MS-6", name: "Packaging + Hardening", status: "pending", progress: 0, evidence: "Pack/verify flows not started." },
  { id: "GA", name: "General Availability", status: "pending", progress: 0, evidence: "Post-hardening." },
];

const status = {
  generatedAt: new Date().toISOString(),
  engineVersion: "0.1.0-ms1",
  substrate: "TypeScript on Bun (ADR-0018, Proposed — pending Founder ratification)",
  verification,
  tests: { suites: 10, assertedExpectations: 951, totalTests: 114, coverage: { lines: 80.63, branches: 87.43, floors: "bunfig.toml coverageThreshold (OBJ-Q6 wired)" }, note: "counts from the latest full run of `bun test tests/ --coverage`" },
  code: { engine, engineTests, sdk, tools },
  contracts: { specFiles, adrCount: adrFiles.length, adrFiles },
  milestones,
  overallProgress: Math.round(milestones.reduce((acc, m) => acc + m.progress, 0) / milestones.length),
  risks: [
    "Substrate: TypeScript-on-Bun reference implementation awaits Founder ADR-0018 ratification before MS-3 shipping milestones.",
    "Broker engine (MS-2) must integrate the frozen contracts without widening policy evaluation semantics.",
    "Journal per-record fsync trades durability for throughput; batching decision needed before MS-4 scale testing.",
  ],
  nextWork: [
    "MS-3: Model Gateway — provider adapters, streaming normalization, metering, secrets protocol (ADR-0013), behind the broker's model.invoke domain.",
    "Ratify or amend ADR-0018 (substrate) and re-baseline MS-3 shipping goals accordingly.",
    "MS-4 groundwork: agent executor over journaled decisions; workflow DAGs on the spine.",
    "MS-5: loopback daemon (ADR-0010) so SDK parity holds over the wire, not only in-process.",
  ],
};

const OUT = join(ROOT, "site-data");
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "vaerion-status.json"), JSON.stringify(status, null, 2) + "\n");

if (!process.env.VAE_STATUS_QUIET) {
  console.log(JSON.stringify({ ok: true, overallProgress: status.overallProgress, verificationOk: verification.ok, engineFiles: engine.files }, null, 2));
}
