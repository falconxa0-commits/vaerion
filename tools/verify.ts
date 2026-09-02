/**
 * Vaerion Verify — the full verification gate runner (Stage 20/21 law).
 *
 * Gates:
 *   1. engine typecheck (tsc strict)
 *   2. sdk typecheck (tsc strict)
 *   3. full test suite with coverage floors (OBJ-Q6: bun --coverage +
 *      bunfig coverageThreshold; a floor breach fails the gate)
 *   4. layerlint (architecture boundaries)
 *   5. constitutional-check (invariants + contract sync + secrets)
 *   6. perf-budget (Phase 7 — the performance budget law, v1.4 A4)
 *   7. a11y-structural (Phase 8 — the accessibility law, v1.4 A4)
 *   8. repository lint (eslint, app + tooling)
 *
 * Every gate must be green before any commit (release blocker #1).
 * Emits .vaerion-verification.json for reports and the status dashboard.
 *
 * CI truth law (ASCENSION XIX Phase 11, constitution v1.6 A6):
 *   - Every gate's FULL output is persisted to .vaerion-logs/<gate>.log.
 *   - A red gate NAMES its failure: the printed detail is the deterministic
 *     failure excerpt (tools/gate-output.ts), never a trailing window that a
 *     coverage table can push out of view.
 *   - The record carries the MEASURED test counts parsed from the tests gate
 *     (pass/fail/expectations/files) so every downstream surface (status.ts,
 *     the web face, the roadmap report) reads one measured source instead of
 *     hand-copied literals.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { failureExcerpt, GATE_LOG_DIR, gateLogName } from "./gate-output.ts";

const ROOT = resolve(import.meta.dir, "..");
const ENGINE = join2(ROOT, "packages", "vaerion");

function join2(...parts: string[]): string {
  return parts.join("/");
}

interface GateResult {
  gate: string;
  ok: boolean;
  durationMs: number;
  detail: string;
  /** The COMPLETE combined output — the excerpt and the persisted log work on
   *  this, never on the truncated detail (the v1.5-era defect). */
  full: string;
}

function run(name: string, cmd: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): GateResult {
  const started = Date.now();
  const proc = spawnSync(cmd[0]!, cmd.slice(1), {
    cwd: opts.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", ...(opts.env ?? {}) },
    timeout: 600_000,
  });
  const durationMs = Date.now() - started;
  const full = ((proc.stdout ?? "") + (proc.stderr ?? "")).trim();
  const ok = proc.status === 0;
  return {
    gate: name,
    ok,
    durationMs,
    detail: ok ? full.split("\n").slice(-6).join("\n") : full.split("\n").slice(-40).join("\n"),
    full,
  };
}

const gates: GateResult[] = [];
console.log("vaerion verify — starting full gate run\n");

gates.push(run("typecheck-engine", ["bunx", "tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: ENGINE }));
gates.push(run("typecheck-sdk", ["bunx", "tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: join2(ROOT, "sdks", "typescript") }));
gates.push(run("tests", ["bun", "test", "tests/", "--coverage"], {
  cwd: ENGINE,
  // The live-verify marker: the suite reads the PREVIOUS run's record while
  // THIS run's gates are executing — record-freshness pins defer to the live
  // gates under this marker (and are enforced fail-closed in CI against the
  // committed record). The REAL departure condition stays in
  // tools/rehearsal.ts at train time.
  env: { VAE_VERIFY_RUNNING: "1" },
}));
gates.push(run("layerlint", ["bun", "run", join2(ROOT, "tools", "layerlint.ts")]));
gates.push(run("constitutional-check", ["bun", "run", join2(ROOT, "tools", "constitutional-check.ts")]));
gates.push(run("perf-budget", ["bun", "run", join2(ROOT, "tools", "perf-gate.ts")]));
gates.push(run("a11y-structural", ["bun", "run", join2(ROOT, "tools", "a11y-check.ts")]));
gates.push(run("repo-lint", ["bun", "run", "lint"]));

const allOk = gates.every((g) => g.ok);

// The CI truth law: persist every gate's full output BEFORE printing, so a red
// gate can point at its complete evidence.
mkdirSync(join2(ROOT, GATE_LOG_DIR), { recursive: true });
for (const g of gates) {
  writeFileSync(join2(ROOT, GATE_LOG_DIR, gateLogName(g.gate)), g.full + "\n", "utf8");
}

for (const g of gates) {
  console.log(`\n=== ${g.gate}: ${g.ok ? "GREEN" : "RED"} (${g.durationMs}ms) ===`);
  if (g.ok) {
    console.log(g.detail);
  } else {
    // A red gate NAMES its failure (P7 honest surfaces; v1.6 A6) — excerpted
    // from the FULL output, never from a truncated window.
    console.log(failureExcerpt(g.full));
    console.log(`[full gate output: ${GATE_LOG_DIR}/${gateLogName(g.gate)}]`);
  }
}
console.log(`\nvaerion verify: ${allOk ? "ALL GATES GREEN" : "GATE FAILURES PRESENT"}`);

// The measured test counts, parsed from the tests gate's FULL output — the ONE
// measured source for every downstream surface (v1.6 A6: no hand-copied
// counters). Absent honestly when the summary cannot be parsed.
const testsOutput = gates.find((g) => g.gate === "tests")?.full ?? "";
const m = testsOutput.match(/(\d+) pass\s*\n\s*(\d+) fail\s*\n\s*(\d+) expect\(\) calls\s*\nRan (\d+) tests across (\d+) files/);
const measured = m
  ? {
      testsPassed: Number(m[1]),
      testsFailed: Number(m[2]),
      expectations: Number(m[3]),
      testFiles: Number(m[5]),
    }
  : undefined;

writeFileSync(
  join2(ROOT, ".vaerion-verification.json"),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    ok: allOk,
    gates: gates.map((g) => ({ gate: g.gate, ok: g.ok, durationMs: g.durationMs })),
    ...(measured ? { measured } : {}),
  }, null, 2) + "\n",
);

process.exit(allOk ? 0 : 1);
