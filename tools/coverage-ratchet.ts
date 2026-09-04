/**
 * Vaerion coverage ratchet — per-module floors on top of the total-based
 * bunfig thresholds (OBJ-Q6; ASCENSION XXVI+ B-3).
 *
 * The law this tool enforces: **coverage can never decrease silently.**
 * bunfig.toml floors the TOTALS; this gate floors EVERY MODULE the test
 * suite covers, from a checked-in baseline of record
 * (packages/vaerion/coverage-baseline.json). A module that drops below its
 * floor fails the gate BY NAME; a baselined module that disappears from the
 * measured table fails too (deleted/renamed code re-baselines deliberately,
 * never silently). New modules are reported, not failed — they enter the
 * baseline at the next deliberate bless.
 *
 * The bless path (like the golden fixtures' VAE_BLESS): `--bless` re-measures
 * and writes the CURRENT state as the new floor. Blessing is a deliberate,
 * reviewed act — the gate itself never blesses, and a bless that would LOWER
 * an existing floor is a diff the reviewer is expected to see and justify.
 *
 * Measurement honesty: per-module coverage JITTERS between runs by up to
 * ~1 percentage point on timing-sensitive modules (measured: rehearsal.ts
 * swung 25.00 → 24.51 across two green runs — waitFor/race branches). The
 * gate therefore breaches only when a module measures more than JITTER_EPS
 * (1.0pp) below its floor: jitter is absorbed, real regressions (and any
 * downward trend past 1pp) still fail BY NAME, and only a deliberate bless
 * can lower a floor.
 *
 * Modes:
 *   bun run tools/coverage-ratchet.ts                 — measure + check (runs the suite)
 *   bun run tools/coverage-ratchet.ts --check FILE    — check from a captured gate log (no re-run)
 *   bun run tools/coverage-ratchet.ts --bless         — measure + write the baseline of record
 *
 * verify.ts wires this as the coverage-ratchet gate, fed from the tests
 * gate's OWN captured coverage table (the suite runs once; the ratchet
 * parses the same measured output).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dir, "..");
const ENGINE = resolve(ROOT, "packages", "vaerion");
const BASELINE_PATH = resolve(ENGINE, "coverage-baseline.json");

export interface CoverageRow {
  file: string;
  funcs: number;
  lines: number;
}

export interface RatchetViolation {
  file: string;
  metric: "funcs" | "lines";
  floor: number;
  measured: number;
}

export interface RatchetFinding {
  file: string;
  problem: string;
}

export interface RatchetBaseline {
  version: 1;
  /** path (as printed by the coverage table, relative to the engine dir) → floors. */
  modules: Record<string, { funcs: number; lines: number }>;
}

/** Coverage jitter allowance (percentage points) — measured, not guessed:
 * timing-sensitive modules swing ≤ ~1pp between green runs. A breach needs
 * measured < floor - JITTER_EPS. */
export const JITTER_EPS = 1.0;

/**
 * Parse bun's per-file coverage table. Data rows look like:
 *   ` src/kernel/canonical.ts |   75.00 |   91.89 | 34,49`
 * (path | % Funcs | % Lines | uncovered). The "All files" total row does not
 * match the row shape (the path cell contains a space) — totals stay under
 * the bunfig thresholds; this tool governs the modules.
 */
export function parseCoverageTable(output: string): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const line of output.split("\n")) {
    const m = /^\s*(\S+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/.exec(line);
    if (!m) continue;
    const file = m[1]!;
    if (file === "File") continue;
    rows.push({ file, funcs: Number(m[2]), lines: Number(m[3]) });
  }
  return rows;
}

/** The ratchet check itself: baseline floors vs the measured table. */
export function checkRatchet(rows: CoverageRow[], baseline: RatchetBaseline): { violations: RatchetViolation[]; findings: RatchetFinding[]; unbaselined: string[] } {
  const violations: RatchetViolation[] = [];
  const findings: RatchetFinding[] = [];
  const measured = new Map(rows.map((r) => [r.file, r]));
  for (const [file, floor] of Object.entries(baseline.modules)) {
    const row = measured.get(file);
    if (!row) {
      findings.push({ file, problem: "baselined module is ABSENT from the measured coverage table (deleted or renamed? re-baseline deliberately)" });
      continue;
    }
    if (row.funcs < floor.funcs - JITTER_EPS) violations.push({ file, metric: "funcs", floor: floor.funcs, measured: row.funcs });
    if (row.lines < floor.lines - JITTER_EPS) violations.push({ file, metric: "lines", floor: floor.lines, measured: row.lines });
  }
  const unbaselined = rows.filter((r) => baseline.modules[r.file] === undefined).map((r) => r.file);
  return { violations, findings, unbaselined };
}

function loadBaseline(): RatchetBaseline {
  if (!existsSync(BASELINE_PATH)) {
    return { version: 1, modules: {} };
  }
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as RatchetBaseline;
}

function rowsFromSuite(): CoverageRow[] {
  const proc = spawnSync("bun", ["test", "tests/", "--coverage"], { cwd: ENGINE, encoding: "utf8", env: { ...process.env, FORCE_COLOR: "0" }, timeout: 600_000 });
  const out = ((proc.stdout ?? "") + (proc.stderr ?? "")).trim();
  if (proc.status !== 0) {
    console.error("coverage-ratchet: the test suite itself is RED — fix that first (the ratchet measures a green suite)");
    console.error(out.split("\n").slice(-30).join("\n"));
    process.exit(2);
  }
  return parseCoverageTable(out);
}

/** The verify.ts gate: check the tests gate's OWN captured table. */
export function checkCoverageRatchetGate(testsFullOutput: string): { gate: string; ok: boolean; durationMs: number; detail: string; full: string } {
  const started = Date.now();
  const rows = parseCoverageTable(testsFullOutput);
  const baseline = loadBaseline();
  const { violations, findings, unbaselined } = checkRatchet(rows, baseline);
  const lines: string[] = [];
  if (rows.length === 0) {
    lines.push("coverage-ratchet: FAILED — no coverage table found in the tests gate output");
  } else {
    lines.push(`coverage-ratchet: ${rows.length} module(s) measured, ${Object.keys(baseline.modules).length} ratcheted`);
    for (const v of violations) lines.push(`  RATCHET BREACH: ${v.file} ${v.metric} ${v.measured.toFixed(2)} < floor ${v.floor.toFixed(2)}`);
    for (const f of findings) lines.push(`  BASELINE DRIFT: ${f.file} — ${f.problem}`);
    if (unbaselined.length > 0) lines.push(`  new modules (enter the baseline at the next deliberate bless): ${unbaselined.join(", ")}`);
    if (violations.length === 0 && findings.length === 0) lines.push("coverage-ratchet: OK — no module decreased silently");
  }
  const ok = rows.length > 0 && violations.length === 0 && findings.length === 0;
  const full = lines.join("\n");
  return { gate: "coverage-ratchet", ok, durationMs: Date.now() - started, detail: ok ? full : full, full };
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--bless")) {
    const rows = rowsFromSuite();
    const modules: Record<string, { funcs: number; lines: number }> = {};
    for (const r of rows) modules[r.file] = { funcs: r.funcs, lines: r.lines };
    writeFileSync(BASELINE_PATH, JSON.stringify({ version: 1, modules } as RatchetBaseline, null, 2) + "\n");
    console.log(`coverage-ratchet: baseline BLESSED from the measured suite — ${rows.length} module(s) → ${BASELINE_PATH}`);
    process.exit(0);
  }
  const checkIdx = args.indexOf("--check");
  if (checkIdx >= 0) {
    const file = args[checkIdx + 1];
    if (!file) {
      console.error("usage: tools/coverage-ratchet.ts --check <captured-log-file>");
      process.exit(2);
    }
    const rows = parseCoverageTable(readFileSync(file, "utf8"));
    const { violations, findings, unbaselined } = checkRatchet(rows, loadBaseline());
    for (const v of violations) console.error(`RATCHET BREACH: ${v.file} ${v.metric} ${v.measured.toFixed(2)} < floor ${v.floor.toFixed(2)}`);
    for (const f of findings) console.error(`BASELINE DRIFT: ${f.file} — ${f.problem}`);
    if (unbaselined.length > 0) console.log(`new modules (unratcheted): ${unbaselined.join(", ")}`);
    console.log(violations.length === 0 && findings.length === 0 ? "coverage-ratchet: OK" : "coverage-ratchet: FAILED");
    process.exit(violations.length === 0 && findings.length === 0 ? 0 : 1);
  }
  const rows = rowsFromSuite();
  const { violations, findings } = checkRatchet(rows, loadBaseline());
  for (const v of violations) console.error(`RATCHET BREACH: ${v.file} ${v.metric} ${v.measured.toFixed(2)} < floor ${v.floor.toFixed(2)}`);
  for (const f of findings) console.error(`BASELINE DRIFT: ${f.file} — ${f.problem}`);
  console.log(violations.length === 0 && findings.length === 0 ? "coverage-ratchet: OK" : "coverage-ratchet: FAILED");
  process.exit(violations.length === 0 && findings.length === 0 ? 0 : 1);
}

if (import.meta.main) {
  main();
}
