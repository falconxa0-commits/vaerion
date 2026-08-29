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
 *   6. repository lint (eslint, app + tooling)
 *
 * Every gate must be green before any commit (release blocker #1).
 * Emits .vaerion-verification.json for reports and the status dashboard.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

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
}

function run(name: string, cmd: string[], opts: { cwd?: string } = {}): GateResult {
  const started = Date.now();
  const proc = spawnSync(cmd[0]!, cmd.slice(1), {
    cwd: opts.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: 600_000,
  });
  const durationMs = Date.now() - started;
  const out = ((proc.stdout ?? "") + (proc.stderr ?? "")).trim();
  const ok = proc.status === 0;
  return {
    gate: name,
    ok,
    durationMs,
    detail: ok ? out.split("\n").slice(-6).join("\n") : out.split("\n").slice(-40).join("\n"),
  };
}

const gates: GateResult[] = [];
console.log("vaerion verify — starting full gate run\n");

gates.push(run("typecheck-engine", ["bunx", "tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: ENGINE }));
gates.push(run("typecheck-sdk", ["bunx", "tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: join2(ROOT, "sdks", "typescript") }));
gates.push(run("tests", ["bun", "test", "tests/", "--coverage"], { cwd: ENGINE }));
gates.push(run("layerlint", ["bun", "run", join2(ROOT, "tools", "layerlint.ts")]));
gates.push(run("constitutional-check", ["bun", "run", join2(ROOT, "tools", "constitutional-check.ts")]));
gates.push(run("repo-lint", ["bun", "run", "lint"]));

const allOk = gates.every((g) => g.ok);

for (const g of gates) {
  console.log(`\n=== ${g.gate}: ${g.ok ? "GREEN" : "RED"} (${g.durationMs}ms) ===`);
  console.log(g.detail);
}
console.log(`\nvaerion verify: ${allOk ? "ALL GATES GREEN" : "GATE FAILURES PRESENT"}`);

writeFileSync(
  join2(ROOT, ".vaerion-verification.json"),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    ok: allOk,
    gates: gates.map((g) => ({ gate: g.gate, ok: g.ok, durationMs: g.durationMs })),
  }, null, 2) + "\n",
);

process.exit(allOk ? 0 : 1);
