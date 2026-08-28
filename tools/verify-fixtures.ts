/**
 * verify-fixtures — golden fixture conformance (D20.2, D4.3).
 *
 * Golden fixtures pin CLI output in both render modes. They are
 * BINDING PRECEDENT: a fixture change is a contract change, reviewed
 * as such — never test maintenance. `--bless` regenerates fixtures;
 * the diff of a bless MUST be reviewed like spec/ changes (daylight
 * rule, D6.3).
 *
 * Normalization: volatile fields (timestamps, ULIDs, hash digests,
 * absolute sandbox paths) are canonicalized before comparison so the
 * fixtures pin MEANING (D18.12), not clock state.
 */

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "packages", "vae-cli", "src", "main.ts");
const FIXTURES = join(ROOT, "fixtures");
const BLESS = process.argv.includes("--bless");

interface Scenario {
  readonly name: string;
  readonly setup: (dir: string) => void;
  readonly args: string[];
}

const SCENARIOS: Scenario[] = [
  {
    name: "cli/help-top.txt",
    setup: () => undefined,
    args: ["--help", "--plain"],
  },
  {
    name: "cli/init-dry-run.txt",
    setup: () => undefined,
    args: ["init", "--dry-run", "--plain"],
  },
  {
    name: "cli/error-unknown-flag.txt",
    setup: () => undefined,
    args: ["--bogus", "--plain"],
  },
  {
    name: "cli/init-and-run.txt",
    setup: (dir) => {
      const r = Bun.spawnSync(["bun", CLI, "init", "--plain"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
      if (r.exitCode !== 0) throw new Error(`setup init failed: ${r.stderr.toString()}`);
    },
    args: ["run", "selfcheck", "--plain"],
  },
  {
    name: "cli/doctor.json",
    setup: (dir) => {
      const r = Bun.spawnSync(["bun", CLI, "init", "--plain"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
      if (r.exitCode !== 0) throw new Error(`setup init failed: ${r.stderr.toString()}`);
    },
    args: ["doctor", "--json"],
  },
];

/** Canonicalize volatile fields (D18.12 — meaning, not clock state). */
function normalize(text: string, sandboxDir: string): string {
  let out = text
    .replaceAll(sandboxDir, "<SANDBOX>")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<TS>")
    .replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/g, "<ULID>")
    .replace(/blake3:[0-9a-f]{64}/g, "blake3:<HASH>")
    .replace(/\b[0-9a-f]{64}\b/g, "<HASH>")
    .replace(/\b[0-9a-f]{16}\b/g, "<HASH16>");
  if (sandboxDir !== "") {
    out = out.replaceAll("<SANDBOX>", "<SANDBOX>");
  }
  return out;
}

function runCli(args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(["bun", CLI, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { stdout: proc.stdout.toString(), stderr: proc.stderr.toString(), exitCode: proc.exitCode ?? 0 };
}

function main(): number {
  const failures: string[] = [];
  let checked = 0;

  for (const scenario of SCENARIOS) {
    const parent = mkdtempSync(join(tmpdir(), "vae-fixture-"));
    const dir = join(parent, "fixture-ws");
    mkdirSync(dir, { recursive: true });
    try {
      scenario.setup(dir);
      const result = runCli(scenario.args, dir);
      const actual = normalize(result.stdout, dir) + (result.stderr.length > 0 ? `\n--- stderr ---\n${normalize(result.stderr, dir)}` : "");
      const header = `# GOLDEN FIXTURE — ${scenario.name}\n# Binding precedent (D4.3, D20.2). Bless with: bun tools/verify-fixtures.ts --bless\n# args: vae ${scenario.args.join(" ")}\n# exit: ${result.exitCode}\n\n`;
      const blessed = `${header}exit: ${result.exitCode}\n${actual}`;
      const fixturePath = join(FIXTURES, scenario.name);

      if (BLESS) {
        mkdirSync(join(fixturePath, ".."), { recursive: true });
        writeFileSync(fixturePath, blessed, "utf8");
        console.log(`blessed: ${scenario.name}`);
        checked++;
        continue;
      }

      if (!existsSync(fixturePath)) {
        failures.push(`${scenario.name}: fixture missing (run with --bless and review as a contract change)`);
        continue;
      }
      const expected = readFileSync(fixturePath, "utf8");
      if (expected !== blessed) {
        failures.push(`${scenario.name}: output drifted from the binding fixture (D4.3)`);
        continue;
      }
      checked++;
      console.log(`ok: ${scenario.name}`);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }

  if (BLESS) {
    console.log(`\nblessed ${checked} fixture(s). Review the diff as a CONTRACT change (D20.2) under the daylight rule (D6.3).`);
    return 0;
  }
  if (failures.length > 0) {
    console.error(`\nverify-fixtures: RED — ${failures.length} failure(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error("\nGolden fixtures are binding precedent (D4.3). If the change is a ratified contract change, bless and review the diff.");
    return 1;
  }
  console.log(`\nverify-fixtures: GREEN — ${checked} golden fixture(s) conform (D20.2).`);
  return 0;
}

process.exit(main());
