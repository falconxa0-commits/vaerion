/**
 * Five Guarantees conformance (D20.1, Part IV) — exercised against the
 * real binary, in real workspaces. A command that cannot honor the
 * guarantees SHALL NOT ship (D18.1); this suite is the gate.
 */
import { describe, expect, it } from "bun:test";
import { mkdtempSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "main.ts");

interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

function vae(args: string[], cwd?: string): RunResult {
  const proc = Bun.spawnSync(["bun", CLI, ...args], {
    cwd: cwd ?? process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return {
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    exitCode: proc.exitCode ?? 0,
  };
}

function sandbox(): { dir: string; cleanup: () => void } {
  const parent = mkdtempSync(join(tmpdir(), "vae-cli-"));
  const dir = join(parent, "fixture-ws");
  require("node:fs").mkdirSync(dir);
  return { dir, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}

function parseNdjson(text: string): Record<string, unknown>[] {
  return text
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("Guarantee 1 — --help always teaches", () => {
  it("top-level help teaches the Daily Seven and the guarantees", () => {
    const r = vae(["--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Daily Seven");
    expect(r.stdout).toContain("Five Guarantees");
    expect(r.stdout).toContain("init");
    expect(r.stdout).toContain("dev");
  });

  it("every command's --help teaches purpose, example, prerequisites, side effects", () => {
    for (const cmd of ["init", "run", "resume", "explain", "journal", "doctor", "dev"]) {
      const r = vae([cmd, "--help"]);
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain("Example:");
      expect(r.stdout).toContain("Prerequisites:");
      expect(r.stdout).toContain("Side effects:");
      expect(r.stdout).toContain("Related:");
    }
  });

  it("error codes are curriculum: vae help E2010", () => {
    const r = vae(["help", "E2010"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("DRIFT_DETECTED");
    expect(r.stdout).toContain("Fix:");
  });
});

describe("Guarantee 2 — --json always valid", () => {
  it("doctor --json is NDJSON envelopes, schema-stable, even across states", () => {
    const { dir, cleanup } = sandbox();
    try {
      vae(["init"], dir);
      const r = vae(["doctor", "--json"], dir);
      expect(r.exitCode).toBe(0);
      const lines = parseNdjson(r.stdout);
      expect(lines.length).toBeGreaterThanOrEqual(8);
      for (const line of lines) {
        expect(line["v"]).toBe(1);
        expect(typeof line["type"]).toBe("string");
        expect(typeof line["seq"]).toBe("number");
        expect(typeof line["ts"]).toBe("string");
        expect(line["actor"]).toBeDefined();
        expect(line["cause"]).toBeDefined();
      }
    } finally {
      cleanup();
    }
  });

  it("--json stays parseable in failure states (D18.7)", () => {
    const { dir, cleanup } = sandbox();
    try {
      vae(["init"], dir);
      const r = vae(["run", "ghost-plan", "--json"], dir);
      expect(r.exitCode).toBe(2);
      const lines = parseNdjson(r.stdout);
      const last = lines.at(-1) as { type: string; error: { code: string } };
      expect(last.type).toBe("engine.error");
      expect(last.error.code).toBe("E1009");
    } finally {
      cleanup();
    }
  });
});

describe("Guarantee 3 — --dry-run before every change", () => {
  it("init --dry-run writes nothing; init writes a workspace", () => {
    const a = sandbox();
    try {
      const dry = vae(["init", "--dry-run", "--plain"], a.dir);
      expect(dry.exitCode).toBe(0);
      expect(dry.stdout).toContain("prospective");
      expect(existsSync(join(a.dir, "vaerion.yaml"))).toBeFalse();
      const real = vae(["init", "--plain"], a.dir);
      expect(real.exitCode).toBe(0);
      expect(existsSync(join(a.dir, "vaerion.yaml"))).toBeTrue();
    } finally {
      a.cleanup();
    }
  });

  it("run --dry-run journals nothing", () => {
    const s = sandbox();
    try {
      vae(["init"], s.dir);
      vae(["run", "selfcheck", "--dry-run", "--plain"], s.dir);
      const journalFiles = existsSync(join(s.dir, ".vaerion", "journal")) ? readdirSync(join(s.dir, ".vaerion", "journal")) : [];
      expect(journalFiles.length).toBe(0);
    } finally {
      s.cleanup();
    }
  });
});

describe("Guarantee 4 — Receipt after every change", () => {
  it("init and run print receipts with what changed / cost / undo / record", () => {
    const s = sandbox();
    try {
      const init = vae(["init", "--plain"], s.dir);
      expect(init.stdout).toContain("Receipt");
      expect(init.stdout).toContain("what changed:");
      expect(init.stdout).toContain("cost:");
      expect(init.stdout).toContain("undo:");
      expect(init.stdout).toContain("record:");
      const run = vae(["run", "selfcheck", "--plain"], s.dir);
      expect(run.stdout).toContain("Receipt");
      expect(run.stdout).toContain("chain_head=");
    } finally {
      s.cleanup();
    }
  });
});

describe("Guarantee 5 — honest exit codes", () => {
  it("0 success · 2 usage · 3 refusal · 4 run failure", () => {
    const s = sandbox();
    try {
      expect(vae(["--help"]).exitCode).toBe(0);
      expect(vae(["--bogus-flag"]).exitCode).toBe(2);
      expect(vae(["frobnicate"]).exitCode).toBe(2);
      // Refusal: re-init an existing workspace.
      vae(["init"], s.dir);
      expect(vae(["init"], s.dir).exitCode).toBe(3);
      // Refusal: a plan referencing an unregistered tool is refused (E2005/D16.1).
      const plan = join(s.dir, "runs", "failing.yaml");
      require("node:fs").writeFileSync(
        plan,
        'name: failing\nsteps:\n  - id: no-such-tool\n    tool: ghost.tool\n',
      );
      expect(vae(["run", "failing"], s.dir).exitCode).toBe(3);
      // Run failure: the engine refuses to build on a tampered chain (E3001, exit 4).
      const auditFile = join(s.dir, ".vaerion", "audit", "audit.ndjson");
      const tampered = require("node:fs").readFileSync(auditFile, "utf8").replace("workspace.initialized", "workspace.HACKED");
      require("node:fs").writeFileSync(auditFile, tampered);
      expect(vae(["run", "selfcheck"], s.dir).exitCode).toBe(4);
    } finally {
      s.cleanup();
    }
  });
});

describe("the engine refuses to guess (Article XI, D18.5)", () => {
  it("commands outside a workspace refuse with a Fix line", () => {
    const dir = mkdtempSync(join(tmpdir(), "vae-nows-"));
    try {
      const r = vae(["doctor", "--plain"], dir);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain("E1005");
      expect(r.stderr).toContain("Fix:");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
