/**
 * Engine integration test — the MS-0 golden path.
 * init → run (dry-run, real) → doctor → journal → explain → resume.
 * Every assertion is against durable state, not mocks (D20.4 posture).
 */
import { describe, expect, it } from "bun:test";
import { mkdtempSync, existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixedClock, EXIT_CODES } from "vae-foundation";
import { openEngineContext, WorkspaceService, RunService, HealthService, JournalService, ExplainService } from "../src/index.ts";

const clock = fixedClock(1_700_000_000_000);

function workspace(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "vae-engine-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function ctx(dir: string) {
  return openEngineContext({ cwd: dir, clock, env: {} });
}

describe("workspace service (vae init)", () => {
  it("dry-run previews the receipt with zero effect (Guarantee 3)", () => {
    const { dir, cleanup } = workspace();
    try {
      const result = new WorkspaceService().init(dir, { dryRun: true, clock });
      expect(result.receipt.ok).toBeTrue();
      expect(result.receipt.what_changed.length).toBeGreaterThan(5);
      expect(existsSync(join(dir, "vaerion.yaml"))).toBeFalse();
      expect(existsSync(join(dir, ".vaerion"))).toBeFalse();
    } finally {
      cleanup();
    }
  });

  it("scaffolds a lawful workspace and records the audit genesis", () => {
    const { dir, cleanup } = workspace();
    try {
      const { receipt } = new WorkspaceService().init(dir, { clock });
      expect(receipt.ok).toBeTrue();
      expect(existsSync(join(dir, "vaerion.yaml"))).toBeTrue();
      expect(existsSync(join(dir, "vaerion.lock"))).toBeTrue();
      expect(existsSync(join(dir, "runs", "selfcheck.yaml"))).toBeTrue();
      expect(existsSync(join(dir, "PROJECT.md"))).toBeTrue();
      // The audit chain exists with the workspace.initialized genesis entry.
      const engine = ctx(dir);
      const report = engine instanceof Object ? true : true;
      void report;
      const entries = new JournalService(engine).entries("audit");
      expect(entries.length).toBe(1);
      expect(entries[0]!.type).toBe("workspace.initialized");
      expect(entries[0]!.actor.kind).toBe("human");
    } finally {
      cleanup();
    }
  });

  it("refuses to re-initialize an existing workspace (E2004)", () => {
    const { dir, cleanup } = workspace();
    try {
      new WorkspaceService().init(dir, { clock });
      expect(() => new WorkspaceService().init(dir, { clock })).toThrow(/already initialized/);
    } finally {
      cleanup();
    }
  });
});

describe("run service (vae run / vae resume)", () => {
  it("dry-run executes nothing but validates the plan", () => {
    const { dir, cleanup } = workspace();
    try {
      new WorkspaceService().init(dir, { clock });
      const engine = ctx(dir);
      const outcome = new RunService(engine).run("selfcheck", { dryRun: true });
      expect(outcome.ok).toBeTrue();
      expect(outcome.runId).toBe("(dry-run)");
      expect(existsSync(join(dir, ".vaerion", "journal"))).toBeTrue();
      const runs = new JournalService(engine).listRuns();
      expect(runs.length).toBe(0); // zero effect
    } finally {
      cleanup();
    }
  });

  it("executes the declared selfcheck run with journaled decisions", () => {
    const { dir, cleanup } = workspace();
    try {
      new WorkspaceService().init(dir, { clock });
      const engine = ctx(dir);
      const outcome = new RunService(engine).run("selfcheck");
      expect(outcome.ok).toBeTrue();
      expect(outcome.completedSteps).toEqual(["config", "audit-chain", "blobs"]);
      expect(outcome.receipt.record.run_id).toBe(outcome.runId);
      expect(outcome.receipt.record.chain_head).toMatch(/^[0-9a-f]{64}$/);

      // Journal truth: decisions precede completions (D11.4).
      const entries = new JournalService(engine).entries(outcome.runId);
      const types = entries.map((e) => e.type);
      expect(types[0]).toBe("run.started");
      expect(types).toContain("run.step.decision");
      expect(types.at(-1)).toBe("run.completed");

      // Chain verifies.
      const verify = new JournalService(engine).verify(outcome.runId);
      expect(verify.ok).toBeTrue();

      // Receipt persisted (D21.5).
      const persisted = JSON.parse(readFileSync(join(dir, ".vaerion", "runs", `${outcome.runId}.receipt.json`), "utf8"));
      expect(persisted.status).toBe("completed");
      expect(persisted.receipt_version).toBe(1);
    } finally {
      cleanup();
    }
  });

  it("is deterministic: identical runs produce identical journals (D20.3)", () => {
    const journals: string[] = [];
    for (let i = 0; i < 2; i++) {
      // Same project basename → same resolved config → same declared work.
      const parent = mkdtempSync(join(tmpdir(), "vae-det-parent-"));
      const dir = join(parent, "proj");
      try {
        new WorkspaceService().init(dir, { clock });
        const engine = ctx(dir);
        const outcome = new RunService(engine).run("selfcheck");
        journals.push(readFileSync(outcome.journalFile, "utf8"));
      } finally {
        rmSync(parent, { recursive: true, force: true });
      }
    }
    // Same inputs (plan, clock, config) → byte-identical journal truth.
    expect(journals[0]).toBe(journals[1]);
  });

  it("refuses to run an undeclared plan (E1009)", () => {
    const { dir, cleanup } = workspace();
    try {
      new WorkspaceService().init(dir, { clock });
      const engine = ctx(dir);
      expect(() => new RunService(engine).run("ghost-plan")).toThrow(/was not found in the workspace/);
    } finally {
      cleanup();
    }
  });

  it("resume of a completed run is a no-op receipt; resume refuses drifted plans (D12.4)", () => {
    const { dir, cleanup } = workspace();
    try {
      new WorkspaceService().init(dir, { clock });
      const engine = ctx(dir);
      const run = new RunService(engine).run("selfcheck");
      const resumed = new RunService(engine).resume(run.runId);
      expect(resumed.ok).toBeTrue();
      expect(resumed.completedSteps.length).toBe(3);

      // Drift the plan on disk → resume must refuse.
      const planFile = join(dir, "runs", "selfcheck.yaml");
      const drifted = readFileSync(planFile, "utf8").replace('id: config', 'id: config-renamed');
      writeFileSync(planFile, drifted);
      expect(() => new RunService(engine).resume(run.runId)).toThrow(/drifted/);
    } finally {
      cleanup();
    }
  });
});

describe("doctor, journal, explain", () => {
  it("doctor reports all checks green on a fresh workspace", () => {
    const { dir, cleanup } = workspace();
    try {
      new WorkspaceService().init(dir, { clock });
      const engine = ctx(dir);
      const { ok, checks } = new HealthService(engine).doctor();
      expect(ok).toBeTrue();
      const ids = checks.map((c) => c.id);
      expect(ids).toContain("config.lock");
      expect(ids).toContain("journal.audit");
      expect(ids).toContain("config.provenance");
    } finally {
      cleanup();
    }
  });

  it("doctor detects a tampered journal chain (tamper detection, D12.1)", () => {
    const { dir, cleanup } = workspace();
    try {
      new WorkspaceService().init(dir, { clock });
      const auditFile = join(dir, ".vaerion", "audit", "audit.ndjson");
      const original = readFileSync(auditFile, "utf8").replace("workspace.initialized", "workspace.HACKED");
      writeFileSync(auditFile, original);
      const engine = ctx(dir);
      const { ok, checks } = new HealthService(engine).doctor();
      expect(ok).toBeFalse();
      expect(checks.find((c) => c.id === "journal.audit")?.ok).toBeFalse();
    } finally {
      cleanup();
    }
  });

  it("explain reconstructs the run's causal story from journal truth (D1.3)", () => {
    const { dir, cleanup } = workspace();
    try {
      new WorkspaceService().init(dir, { clock });
      const engine = ctx(dir);
      const run = new RunService(engine).run("selfcheck");
      const explanation = new ExplainService(engine).explain(run.runId);
      expect(explanation.verdict).toContain("completed");
      expect(explanation.plan).toBe("selfcheck");
      expect(explanation.timeline[0]!.type).toBe("run.started");
      expect(explanation.steps.length).toBe(3);
      expect(explanation.steps.every((s) => s.outcome === "completed")).toBeTrue();
    } finally {
      cleanup();
    }
  });

  it("journal list shows run summaries with honest status", () => {
    const { dir, cleanup } = workspace();
    try {
      new WorkspaceService().init(dir, { clock });
      const engine = ctx(dir);
      new RunService(engine).run("selfcheck");
      const runs = new JournalService(engine).listRuns();
      expect(runs.length).toBe(1);
      expect(runs[0]!.status).toBe("completed");
      expect(runs[0]!.plan).toBe("selfcheck");
    } finally {
      cleanup();
    }
  });
});

// Local helper: the engine context import above surfaces EXIT_CODES via
// vae-foundation; assert the constitutional alphabet here so any drift
// in the integration path is caught where it matters.
describe("constitutional exit alphabet (Part IV)", () => {
  it("is intact in the integration path", () => {
    expect(EXIT_CODES.OK).toBe(0);
    expect(EXIT_CODES.USAGE).toBe(2);
    expect(EXIT_CODES.REFUSAL).toBe(3);
    expect(EXIT_CODES.RUN_FAILURE).toBe(4);
    expect(EXIT_CODES.INTERNAL).toBe(5);
  });
});
