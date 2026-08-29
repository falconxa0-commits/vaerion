/**
 * Vaerion eval harness — hermetic regression gate (MS-4, ADR-0012).
 *
 * Law under test: scenarios run REAL agent runs; transcripts are the spine;
 * the same scenario twice yields the identical transcript hash (seeded
 * determinism); replay folds agree; golden governance blesses only through
 * VAE_BLESS=1 and refuses drift with E1805.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateConfig, type VaerionConfig } from "../../src/config/config.ts";
import { EvalHarness, type EvalScenario } from "../../src/evals/harness.ts";
import { echoTool, type ToolExecutor } from "../../src/agents/tools.ts";

const workspaces: string[] = [];
afterAll(async () => {
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
});

function configFor(): VaerionConfig {
  return validateConfig({
    schemaVersion: "0.1",
    project: { name: "eval-suite" },
    gateway: { providers: { mockbrain: { enabled: true, models: ["mock-1"] } } },
    tools: [{ name: "echo" }],
    policy: {
      rules: [
        { id: "agent-model-allow", principalKinds: ["agent"], domain: "model.invoke", scope: "mockbrain/mock-1", effect: "allow", rationale: "eval allow" },
        { id: "agent-tools-allow", principalKinds: ["agent"], domain: "tool.call", scope: "echo", effect: "allow", rationale: "eval allow" },
      ],
    },
    telemetry: { enabled: false },
  });
}

const scenarios: EvalScenario[] = [
  {
    id: "notes-then-tool",
    goal: "take a note then echo a payload",
    steps: [
      { kind: "note", text: "Assess the goal. The spine is deterministic." },
      { kind: "tool", tool: "echo", args: { value: "payload-1" } },
    ],
    expect: { outcome: "goal", minSteps: 2, maxSteps: 2, toolsUsed: ["echo"], journalVerified: true },
  },
  {
    id: "model-answer",
    goal: "ask the seeded model",
    steps: [{ kind: "model", model: "mockbrain/mock-1", seed: 42, messages: [{ role: "user", content: "summarize the spine" }] }],
    expect: { outcome: "goal", minSteps: 1, minModelInvocations: 1, journalVerified: true },
  },
];

describe("eval harness (hermetic, deterministic, golden-governed)", () => {
  test("the same scenario run twice yields byte-identical transcript hashes", async () => {
    const root = await mkdtemp(join(tmpdir(), "vaerion-eval-"));
    workspaces.push(root);
    const harness = new EvalHarness({ workRoot: join(root, "runs"), config: configFor(), suite: "determinism" });
    const r1 = await harness.runScenario(scenarios[0]!);
    const r2 = await harness.runScenario(scenarios[0]!);
    expect(r1.ok).toBe(true);
    expect(r1.transcriptHash).toBe(r2.transcriptHash);
    expect(r1.replayHash).toBe(r2.replayHash);
    expect(r1.journalVerified).toBe(true);
    // Replay folds agree with themselves (fold equality is part of the hash input).
    expect(r1.replayHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("expectations score honestly: wrong outcome fails its checks", async () => {
    const root = await mkdtemp(join(tmpdir(), "vaerion-eval-"));
    workspaces.push(root);
    const harness = new EvalHarness({ workRoot: join(root, "runs"), config: configFor(), suite: "honest" });
    const impossible: EvalScenario = { ...scenarios[0]!, id: "impossible", expect: { outcome: "step_limit", minSteps: 99 } };
    const result = await harness.runScenario(impossible);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "outcome")?.ok).toBe(false);
    expect(result.checks.find((c) => c.name === "minSteps")?.ok).toBe(false);
  });

  test("suite report totals are exact; golden blesses only via VAE_BLESS", async () => {
    const root = await mkdtemp(join(tmpdir(), "vaerion-eval-"));
    workspaces.push(root);
    await mkdir(join(root, "fixtures", "golden"), { recursive: true });
    const harness = new EvalHarness({ workRoot: join(root, "runs"), config: configFor(), suite: "report" });
    const report = await harness.runSuite(scenarios);
    expect(report.allPassed).toBe(true);
    expect(report.totals).toEqual({ scenarios: 2, passed: 2, failed: 0 });
    expect(report.reportHash).toMatch(/^[0-9a-f]{64}$/);

    // No golden yet + no bless ⇒ refused honestly (not silently created).
    const first = await harness.compareGolden({ ...report });
    expect(first.ok).toBe(false);
    expect(first.blessed).toBe(false);

    // Bless, then the same report matches; a DRIFTED report is refused E1805.
    process.env.VAE_BLESS = "1";
    const blessed = await harness.compareGolden(report);
    delete process.env.VAE_BLESS;
    expect(blessed.blessed).toBe(true);
    const rematch = await harness.compareGolden(report);
    expect(rematch.ok).toBe(true);
    // A DRIFTED report is refused E1805 (never silently re-blessed).
    try {
      await harness.compareGolden({ ...report, reportHash: "0".repeat(64) });
      expect.unreachable();
    } catch (err) {
      expect((err as { code?: string }).code).toBe("E1805");
    }
  });

  test("scenario-local tools are declared for the run and executed", async () => {
    const root = await mkdtemp(join(tmpdir(), "vaerion-eval-"));
    workspaces.push(root);
    const custom: ToolExecutor = { args: { n: "number" }, execute: async (a) => ({ doubled: (a.n as number) * 2 }) };
    const harness = new EvalHarness({ workRoot: join(root, "runs"), config: configFor(), suite: "tools" });
    const result = await harness.runScenario({
      id: "custom-tool",
      goal: "double a number",
      steps: [{ kind: "tool", tool: "math.double", args: { n: 21 } }],
      tools: [{ name: "math.double", executor: custom }],
      expect: { outcome: "goal", toolsUsed: ["math.double"] },
    });
    expect(result.ok).toBe(true);
    expect(result.metrics.tools.completed).toBe(1);
  });
});
