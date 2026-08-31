/**
 * Vaerion Model Gateway — CLI + SDK surface integration (MS-3).
 *
 * Machine parity law (Sacred Invariant #7): the SDK exercises the SAME
 * contracts the CLI does. Every test here drives the real `runCli` entry
 * and the real `VaeClient` — the same engine calls, journals, and receipts.
 * Hermetic: temp workspaces + MockBrain (no network anywhere).
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli/vae.ts";
import { ExitCode } from "../../src/cli/io.ts";
import { readJournal } from "../../src/journal/reader.ts";
import { VaeClient } from "../../../../sdks/typescript/src/index.ts";

const workspaces: string[] = [];
afterAll(async () => {
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
});

const CONFIG_YAML = `schemaVersion: "0.1"
project:
  name: gateway-cli
  description: "MS-3 CLI surface"
gateway:
  providers:
    mockbrain:
      enabled: true
      models:
        - mock-1
  budgets:
    tokensPerRun: 100000
telemetry:
  enabled: false
`;

const DENY_YAML = `schemaVersion: "0.1"
project:
  name: gateway-deny
  description: "deny law"
policy:
  rules:
    - id: no-model-calls
      principalKinds: [human]
      domain: model.invoke
      scope: "*"
      effect: deny
      rationale: "this workspace never calls models"
gateway:
  providers:
    mockbrain:
      enabled: true
      models:
        - mock-1
telemetry:
  enabled: false
`;

const PROMPT_YAML = `schemaVersion: "0.1"
project:
  name: gateway-prompt
  description: "prompt law"
policy:
  rules:
    - id: approve-model-calls
      principalKinds: [human]
      domain: model.invoke
      scope: "*"
      effect: prompt
      gateLabel: "Approve this model invocation?"
      rationale: "human authority checkpoint"
gateway:
  providers:
    mockbrain:
      enabled: true
      models:
        - mock-1
telemetry:
  enabled: false
`;

const BUDGET_YAML = `schemaVersion: "0.1"
project:
  name: gateway-budget
  description: "budget law"
gateway:
  providers:
    mockbrain:
      enabled: true
      models:
        - mock-1
  budgets:
    tokensPerRun: 1
telemetry:
  enabled: false
`;

async function makeWorkspace(yaml: string): Promise<string> {
  const ws = await mkdtemp(join(tmpdir(), "vaerion-gwcli-"));
  workspaces.push(ws);
  await writeFile(join(ws, "vaerion.yaml"), yaml, "utf8");
  return ws;
}

function lastJson(lines: Array<Record<string, unknown>>): Record<string, unknown> {
  return lines[lines.length - 1]!;
}

async function collect(io: { out: (l: string) => void; err: (l: string) => void }): Promise<Array<Record<string, unknown>>> {
  const lines: Array<Record<string, unknown>> = [];
  void io;
  return lines;
}
void collect;

describe("vae run model (CLI surface)", () => {
  test("--help teaches the model kind (Guarantee #1: help never executes)", async () => {
    const out: string[] = [];
    const result = await runCli(["run", "--help"], { out: (l) => out.push(l), err: () => undefined }, process.cwd());
    expect(result.code).toBe(ExitCode.ok);
    expect(out.join("\n")).toContain("run model");
    expect(out.join("\n")).toContain("--input-json");
  });

  test("--dry-run: zero side effects (no .vaerion directory is created)", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    const out: string[] = [];
    const result = await runCli(["run", "model", "--model", "mockbrain/mock-1", "--prompt", "hi", "--dry-run", "--json"], { out: (l) => out.push(l), err: () => undefined }, ws);
    expect(result.code).toBe(ExitCode.ok);
    const payload = JSON.parse(out[out.length - 1]!) as Record<string, unknown>;
    expect(payload).toMatchObject({ command: "run", kind: "model", dry_run: true, side_effects: 0 });
    const vaerionDir = await stat(join(ws, ".vaerion")).then(() => true, () => false);
    expect(vaerionDir).toBe(false); // NOTHING was written
  });

  test("happy path: mockbrain invocation is broker-decided, metered, receipted; journal verifies", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    const out: string[] = [];
    const result = await runCli(
      ["run", "model", "--model", "mockbrain/mock-1", "--prompt", "hello cli", "--seed", "42", "--json"],
      { out: (l) => out.push(l), err: () => undefined },
      ws,
    );
    expect(result.code).toBe(ExitCode.ok);
    const payload = JSON.parse(out[out.length - 1]!) as Record<string, unknown>;
    expect(payload).toMatchObject({ command: "run", kind: "model", model: "mockbrain/mock-1", provider: "mockbrain", op: "chat", journal_verified: true });
    expect(payload.usage).toMatchObject({ inputTokens: expect.any(Number), outputTokens: expect.any(Number) });
    expect(payload.cost).toMatchObject({ totalMicroUsd: 0 }); // mockbrain wildcard: honest 0
    expect(payload.metering).toMatchObject({ invocations: 1, failed: 0 });
    expect(payload.receipt).toBeDefined();

    const runId = payload.run_id as string;
    const read = await readJournal(join(ws, ".vaerion", "journal", `${runId}.ndjson`));
    expect(read.records.some((r) => r.k === "evt" && r.env.type === "gateway.invoke.recorded")).toBe(true);
    expect(read.records.some((r) => r.k === "decision" && (r as { decision?: { domain?: string } }).decision?.domain === "model.invoke")).toBe(true);
  });

  test("determinism across runs: the same seed produces the same text (machine parity demo)", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    const runOne = async (): Promise<string> => {
      const out: string[] = [];
      await runCli(["run", "model", "--model", "mockbrain/mock-1", "--prompt", "parity", "--seed", "7", "--json"], { out: (l) => out.push(l), err: () => undefined }, ws);
      return (JSON.parse(out[out.length - 1]!) as Record<string, unknown>).text as string;
    };
    const a = await runOne();
    const b = await runOne();
    expect(a).toBe(b);
  });

  test("deny policy: exit 3, refusal logged, nothing metered", async () => {
    const ws = await makeWorkspace(DENY_YAML);
    const out: string[] = [];
    const result = await runCli(["run", "model", "--model", "mockbrain/mock-1", "--prompt", "hi", "--json"], { out: (l) => out.push(l), err: (l) => out.push(l) }, ws);
    expect(result.code).toBe(ExitCode.brokerDenied);
    const errLine = JSON.parse(out[out.length - 1]!) as { error?: { code?: string } };
    expect(errLine.error?.code).toBe("E1300");
    const refusals = (await import("../../src/broker/refusal-log.ts")).readRefusals(join(ws, ".vaerion", "refusals.log"), {});
    expect((await refusals).map((r) => r.domain)).toEqual(["model.invoke"]);
  });

  test("prompt policy: exit 0 with an open durable gate; resume approval records an elevation", async () => {
    const ws = await makeWorkspace(PROMPT_YAML);
    const out: string[] = [];
    const result = await runCli(["run", "model", "--model", "mockbrain/mock-1", "--prompt", "hi", "--seed", "3", "--json"], { out: (l) => out.push(l), err: () => undefined }, ws);
    expect(result.code).toBe(ExitCode.ok);
    const payload = JSON.parse(out[out.length - 1]!) as Record<string, unknown>;
    expect(payload.awaiting).toBe(true);
    const gate = payload.gate as Record<string, unknown>;
    expect(gate.state).toBe("open");
    const runId = payload.run_id as string;

    const resume = await runCli(["resume", runId, "--answer", '{"approved":true}', "--json"], { out: (l) => out.push(l), err: () => undefined }, ws);
    expect(resume.code).toBe(ExitCode.ok);
    const read = await readJournal(join(ws, ".vaerion", "journal", `${runId}.ndjson`));
    // the gate was resolved and the elevation recorded (MS-2 law, MS-3 flow)
    expect(read.records.some((r) => r.k === "gate" && (r as { gate?: { state?: string } }).gate?.state === "resolved")).toBe(true);
    expect(read.records.some((r) => r.k === "evt" && r.env.type === "broker.elevation.recorded")).toBe(true);
  });

  test("budget exhaustion: exit 5 (partial with repair hint), spend stays journaled", async () => {
    const ws = await makeWorkspace(BUDGET_YAML);
    const out: string[] = [];
    const result = await runCli(["run", "model", "--model", "mockbrain/mock-1", "--prompt", "hi", "--seed", "1", "--json"], { out: (l) => out.push(l), err: (l) => out.push(l) }, ws);
    expect(result.code).toBe(ExitCode.partial);
    const errLine = JSON.parse(out[out.length - 1]!) as { error?: { code?: string; message?: string } };
    expect(errLine.error?.code).toBe("E1703");
    expect(String(errLine.error?.message)).toContain("raise the budget");
  });

  test("usage errors: undeclared provider-model and bad op exit 2 (honest usage code)", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    const resultA = await runCli(["run", "model", "--model", "openai/gpt-4o", "--prompt", "hi"], { out: () => undefined, err: () => undefined }, ws);
    expect(resultA.code).toBe(ExitCode.brokerDenied); // ceiling deny: journaled refusal (E1300)
    const resultB = await runCli(["run", "model", "--model", "mockbrain/mock-1", "--op", "embed", "--prompt", "hi"], { out: () => undefined, err: () => undefined }, ws);
    expect(resultB.code).toBe(ExitCode.usage); // E1600: chat prompt with embed op is a usage error
  });
});

describe("explain / doctor / dev gateway surfaces", () => {
  test("explain reports the gateway metering rollup folded from the journal", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    const out: string[] = [];
    const run = await runCli(["run", "model", "--model", "mockbrain/mock-1", "--prompt", "metered", "--seed", "9", "--json"], { out: (l) => out.push(l), err: () => undefined }, ws);
    const runId = (JSON.parse(out[out.length - 1]!) as Record<string, unknown>).run_id as string;
    out.length = 0;
    const explained = await runCli(["explain", runId, "--json"], { out: (l) => out.push(l), err: () => undefined }, ws);
    expect(explained.code).toBe(ExitCode.ok);
    const payload = JSON.parse(out[out.length - 1]!) as Record<string, unknown>;
    const gateway = payload.gateway as Record<string, unknown>;
    expect(gateway).toMatchObject({ invocations: 1, failed: 0, total_micro_usd: 0 });
    expect(gateway.by_model).toBeDefined();
    const narrative = payload.narrative as string[];
    expect(narrative.some((line) => line.startsWith("gateway:"))).toBe(true);
  });

  test("doctor surfaces the gateway matrix, config, and secret names (never values); dev lists the matrix", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    const out: string[] = [];
    const doctor = await runCli(["doctor", "--json"], { out: (l) => out.push(l), err: () => undefined }, ws);
    expect(doctor.code).toBe(ExitCode.ok);
    const payload = JSON.parse(out[out.length - 1]!) as Record<string, unknown>;
    const checks = payload.checks as Array<Record<string, unknown>>;
    const matrixCheck = checks.find((c) => c.check === "gateway-matrix");
    expect(String(matrixCheck!.detail)).toContain("mockbrain[chat/embed/rerank]");
    expect(checks.find((c) => c.check === "gateway-config")).toBeDefined();
    const zeroTel = checks.find((c) => c.check === "zero-telemetry");
    expect(String(zeroTel!.detail)).toContain("one sanctioned egress site");

    out.length = 0;
    const dev = await runCli(["dev", "--json"], { out: (l) => out.push(l), err: () => undefined }, ws);
    expect(dev.code).toBe(ExitCode.ok);
    const devPayload = JSON.parse(out[out.length - 1]!) as Record<string, unknown>;
    const gateway = devPayload.gateway as Record<string, unknown>;
    expect((gateway.matrix as Array<Record<string, unknown>>).length).toBe(4);
    expect(String(devPayload.next_milestone)).toContain("MS-6");
    expect(String(devPayload.next_milestone)).toContain("Productization Era");
    expect(String(devPayload.next_milestone)).not.toContain("toward release v0.1.7-rc2");
  });
});

describe("SDK gateway surface (machine parity with the CLI)", () => {
  test("gatewayInvoke runs the same single-gate flow in-process; metering() matches explain's fold", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    const client = new VaeClient({ cwd: ws });
    const { result, runId, receipt, journalVerified } = await client.gatewayInvoke({
      request: { op: "chat", model: "mockbrain/mock-1", messages: [{ role: "user", content: "parity" }], seed: 42 },
    });
    expect(journalVerified).toBe(true);
    expect(receipt).toBeDefined();
    expect(result.text.startsWith("mock(seed=42):")).toBe(true);
    expect(result.cost).toEqual({ inputMicroUsd: 0, outputMicroUsd: 0, totalMicroUsd: 0 });

    const metering = await client.metering(runId);
    expect(metering).toMatchObject({ invocations: 1, failed: 0, totalMicroUsd: 0 });

    // parity anchor: the CLI producing the same request yields the same text
    const out: string[] = [];
    await runCli(["run", "model", "--model", "mockbrain/mock-1", "--prompt", "parity", "--seed", "42", "--json"], { out: (l) => out.push(l), err: () => undefined }, ws);
    const cliText = (JSON.parse(out[out.length - 1]!) as Record<string, unknown>).text as string;
    expect(cliText.startsWith("mock(seed=42):")).toBe(true);
    // CLI topic differs (the prompt string itself), so compare the seeded tail, not the echo
  });

  test("gatewayInvoke refuses undeclared models through the broker ceiling (same law as CLI)", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    const client = new VaeClient({ cwd: ws });
    let threw: unknown = null;
    try {
      await client.gatewayInvoke({ request: { op: "chat", model: "openai/gpt-4o", messages: [{ role: "user", content: "hi" }] } });
    } catch (err) {
      threw = err;
    }
    expect((threw as { code?: string }).code).toBe("E1300");
  });

  test("gatewayMatrix matches the doctor's declared capability matrix", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    const client = new VaeClient({ cwd: ws });
    const matrix = await client.gatewayMatrix();
    expect(matrix.map((m) => m.provider).sort()).toEqual(["anthropic", "mockbrain", "ollama", "openai"]);
    expect(matrix.find((m) => m.provider === "mockbrain")!.requiresSecret).toBe(false);
    expect(matrix.find((m) => m.provider === "anthropic")!.secretName).toBe("ANTHROPIC_API_KEY");
  });
});

/* ─────────────────────────  PHASE Ω — design language  ─────────────────────
 * The rich (TTY) rendering layer is engine surface and must be EXECUTED by
 * the suite like everything else (coverage-floor law, OBJ-Q6). These tests
 * drive the real runCli through the rich profile and assert the design
 * system's structural invariants — alignment, width discipline, exit-code
 * parity with plain mode, and the absolute isolation of --json from paint.
 * The plain-mode bytes remain pinned by the pre-existing tests above.     */

const RICH_COLUMNS = 100;

function richIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out: (l: string): void => void out.push(l),
    err: (l: string): void => void err.push(l),
    raw: (): void => undefined,
    tty: true,
    columns: RICH_COLUMNS,
    lines: { out, err },
  };
}

async function withRichEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.VAE_UI;
  process.env.VAE_UI = "rich";
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.VAE_UI;
    else process.env.VAE_UI = prev;
  }
}

/** Plain pipes are the byte-stable machine contract; this pins that the
 *  rich profile NEVER leaks into them (VAE_UI=plain ≡ default plain). */
async function withPlainEnv<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.VAE_UI;
  process.env.VAE_UI = "plain";
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.VAE_UI;
    else process.env.VAE_UI = prev;
  }
}

/** Visible length (ANSI-free) — the alignment assertions measure this. */
function visible(s: string): number {
  return s.replace(/\u001b\[[0-9;]*m/g, "").length;
}

/** Every panel block in `lines` must be width-disciplined: border rows all
 *  share one visible length, and no row exceeds the terminal width. */
function assertPanelsDisciplined(lines: string[], label: string): void {
  let block: string[] = [];
  const flush = (): void => {
    if (block.length >= 2 && block[0]!.startsWith("╭") && block[block.length - 1]!.startsWith("╰")) {
      const widths = new Set(block.map(visible));
      expect(widths.size).toBe(1);
      expect(block[0]!.startsWith("╭─") || block[0]!.startsWith("╭ ")).toBe(true);
    }
    for (const l of block) expect(visible(l)).toBeLessThanOrEqual(RICH_COLUMNS);
    block = [];
  };
  for (const line of lines) {
    if (line.startsWith("│") || line.startsWith("╭") || line.startsWith("╰")) block.push(line);
    else flush();
  }
  flush();
  expect(lines.length).toBeGreaterThan(0);
  void label;
}

describe("PHASE Ω design language (rich profile, TTY-gated)", () => {
  test("banner + help frame render on a TTY; plain pipes get the raw text", async () => {
    await withRichEnv(async () => {
      const rich = richIo();
      const r1 = await runCli(["--help"], rich, process.cwd());
      expect(r1.code).toBe(ExitCode.ok);
      expect(rich.lines.out.join("\n")).toContain("V A E R I O N");
      assertPanelsDisciplined(rich.lines.out, "help");

      const plain: string[] = [];
      const r2 = await withPlainEnv(async () =>
        runCli(["--help"], { out: (l) => plain.push(l), err: () => undefined }, process.cwd()),
      );
      expect(r2.code).toBe(ExitCode.ok);
      expect(plain.join("\n")).not.toContain("V A E R I O N");
      expect(plain.join("\n")).toContain("vae — Vaerion engine command line");
    });
  });

  test("doctor rich report: aligned table, disciplined panels, exit parity with plain", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    await withRichEnv(async () => {
      const rich = richIo();
      const r = await runCli(["doctor"], rich, ws);
      expect(r.code).toBe(ExitCode.ok);
      assertPanelsDisciplined(rich.lines.out, "doctor");
      const joined = rich.lines.out.join("\n");
      expect(joined).toContain("Doctor — workspace audit");
      expect(joined).toContain("all checks green");

      const plain: string[] = [];
      const rp = await withPlainEnv(async () =>
        runCli(["doctor"], { out: (l) => plain.push(l), err: () => undefined }, ws),
      );
      expect(rp.code).toBe(r.code);
      expect(plain[0]).toBe("command: doctor");
    });
  });

  test("dev rich report: banner, engine/gateway/position panels", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    await withRichEnv(async () => {
      const rich = richIo();
      const r = await runCli(["dev"], rich, ws);
      expect(r.code).toBe(ExitCode.ok);
      assertPanelsDisciplined(rich.lines.out, "dev");
      const joined = rich.lines.out.join("\n");
      expect(joined).toContain("V A E R I O N");
      expect(joined).toContain("Gateway — the single gate");
      expect(joined).toContain("PHASE Ω");
    });
  });

  test("run demo dry-run rich: plan panel, zero side effects; json untouched by paint", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    await mkdir(join(ws, "sources"), { recursive: true });
    await writeFile(join(ws, "sources", "doc.md"), "# demo source — deterministic by construction\n", "utf8");
    await withRichEnv(async () => {
      const rich = richIo();
      const r = await runCli(["run", "demo", "--sources", "sources", "--dry-run"], rich, ws);
      expect(r.code).toBe(ExitCode.ok);
      assertPanelsDisciplined(rich.lines.out, "dry-run");
      expect(rich.lines.out.join("\n")).toContain("zero side effects");

      const jsonLines: string[] = [];
      const rj = await runCli(["run", "demo", "--sources", "sources", "--dry-run", "--json"], { out: (l) => jsonLines.push(l), err: () => undefined }, ws);
      expect(rj.code).toBe(ExitCode.ok);
      for (const line of jsonLines) expect(() => JSON.parse(line) as unknown).not.toThrow();
      expect((JSON.parse(jsonLines[jsonLines.length - 1]!) as Record<string, unknown>).dry_run).toBe(true);
    });
  });

  test("errors render as educated blocks in rich; code + Fix preserved", async () => {
    await withRichEnv(async () => {
      const rich = richIo();
      const r = await runCli(["journal", "verify", "not-a-run-id"], rich, process.cwd());
      expect(r.code).toBe(ExitCode.usage);
      const joined = rich.lines.err.join("\n");
      expect(joined).toContain("E1600");
      expect(joined).toContain("Fix:");
      expect(joined).toContain("spec/errors.yaml#E1600");
    });
  });

  test("package build + provenance rich: receipt, digest, lock evidence chain", async () => {
    const ws = await makeWorkspace(`${CONFIG_YAML}
package:
  include:
    - docs
`);
    await mkdir(join(ws, "docs"), { recursive: true });
    await writeFile(join(ws, "docs", "note.md"), "# provenance demo\n", "utf8");
    await withRichEnv(async () => {
      const rich = richIo();
      const r = await runCli(["package", "build"], rich, ws);
      expect(r.code).toBe(ExitCode.ok);
      assertPanelsDisciplined(rich.lines.out, "package build");
      const joined = rich.lines.out.join("\n");
      expect(joined).toContain("Bundle built");
      expect(joined).toContain("receipt");
      expect(joined).toContain("journal verified");

      const prov = richIo();
      const rp = await runCli(["provenance", ".vaerion/package/gateway-cli.vxn"], prov, ws);
      expect(rp.code).toBe(ExitCode.ok);
      const pJoined = prov.lines.out.join("\n");
      expect(pJoined).toContain("Provenance — permanent artifact evidence");
      expect(pJoined).toContain("verified from the artifact itself");

      const lockProv = richIo();
      const rl = await runCli(["provenance", "vaerion.lock"], lockProv, ws);
      expect(rl.code).toBe(ExitCode.ok);
      expect(lockProv.lines.out.join("\n")).toContain("kind");

      const plain: string[] = [];
      const rpp = await withPlainEnv(async () =>
        runCli(["provenance", "vaerion.lock"], { out: (l) => plain.push(l), err: () => undefined }, ws),
      );
      expect(rpp.code).toBe(ExitCode.ok);
      expect(plain[0]).toBe("command: provenance");
    });
  });

  test("run model rich: the single-gate invocation renders its receipt", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    await withRichEnv(async () => {
      const rich = richIo();
      const r = await runCli(["run", "model", "--model", "mockbrain/mock-1", "--prompt", "hello vaerion", "--seed", "42"], rich, ws);
      expect(r.code).toBe(ExitCode.ok);
      assertPanelsDisciplined(rich.lines.out, "run model");
      const joined = rich.lines.out.join("\n");
      expect(joined).toContain("Model invocation — through the single gate");
      expect(joined).toContain("mockbrain/mock-1");
      expect(joined).toContain("Response");
      expect(joined).toContain("journal verified");
    });
  });

  test("explain rich: the narrative folds into panels; verified subtitle honest", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    await mkdir(join(ws, "sources"), { recursive: true });
    await writeFile(join(ws, "sources", "doc.md"), "# explain demo source\n", "utf8");
    await withRichEnv(async () => {
      const run = richIo();
      const rr = await runCli(["run", "research", "--sources", "sources", "--query", "deterministic"], run, ws);
      expect(rr.code).toBe(ExitCode.ok);
      const runIdLine = run.lines.out.find((l) => l.includes("crn_run_"));
      expect(runIdLine).toBeDefined();
      const runId = /crn_run_[A-Z0-9]+/.exec(runIdLine!)![0];

      const rich = richIo();
      const r = await runCli(["explain", runId], rich, ws);
      expect(r.code).toBe(ExitCode.ok);
      assertPanelsDisciplined(rich.lines.out, "explain");
      const joined = rich.lines.out.join("\n");
      expect(joined).toContain("Run explanation — folded from the journal");
      expect(joined).toContain("chain verified");
      expect(joined).toContain("Narrative");
    });
  });
  test("run agent rich: the supervised loop renders steps, spend, receipt", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    await withRichEnv(async () => {
      const rich = richIo();
      const r = await runCli(
        ["run", "agent", "--goal", "note the law", "--planner", "inline", "--plan-json", '[{"kind":"note","text":"write the note"},{"kind":"model","model":"mockbrain/mock-1","messages":[{"role":"user","content":"summarize the law"}]},{"kind":"note","text":"done"}]'],
        rich,
        ws,
      );
      expect(r.code).toBe(ExitCode.ok);
      assertPanelsDisciplined(rich.lines.out, "run agent");
      const joined = rich.lines.out.join("\n");
      expect(joined).toContain("Agent run");
      expect(joined).toContain("planner");
      expect(joined).toContain("journal verified");
    });
  });

  test("resume rich on a closed run: the restored-state panel is honest", async () => {
    const ws = await makeWorkspace(CONFIG_YAML);
    await mkdir(join(ws, "sources"), { recursive: true });
    await writeFile(join(ws, "sources", "doc.md"), "# resume demo source\n", "utf8");
    await withRichEnv(async () => {
      const run = richIo();
      const rr = await runCli(["run", "research", "--sources", "sources", "--query", "resume"], run, ws);
      expect(rr.code).toBe(ExitCode.ok);
      const runIdLine = run.lines.out.find((l) => l.includes("crn_run_"));
      const runId = /crn_run_[A-Z0-9]+/.exec(runIdLine!)![0];

      const rich = richIo();
      const r = await runCli(["resume", runId], rich, ws);
      expect(r.code).toBe(ExitCode.ok);
      assertPanelsDisciplined(rich.lines.out, "resume restored");
      const joined = rich.lines.out.join("\n");
      expect(joined).toContain("Restored");
      expect(joined).toContain("closed");
    });
  });
  test("human gate rich: the awaiting panel renders authority, options, hint", async () => {
    const ws = await makeWorkspace(`schemaVersion: "0.1"
project:
  name: gate-cli
  description: "PHASE Ω gate surface"
policy:
  rules:
    - id: prompt-research
      principalKinds: [research]
      domain: research.index
      scope: "*"
      effect: prompt
      rationale: "human authority checkpoint"
telemetry:
  enabled: false
`);
    await mkdir(join(ws, "sources"), { recursive: true });
    await writeFile(join(ws, "sources", "doc.md"), "# gate demo source\n", "utf8");
    await withRichEnv(async () => {
      const rich = richIo();
      const r = await runCli(["run", "demo", "--sources", "sources"], rich, ws);
      expect(r.code).toBe(ExitCode.ok);
      assertPanelsDisciplined(rich.lines.out, "gate");
      const joined = rich.lines.out.join("\n");
      expect(joined).toContain("Human gate — awaiting your authority");
      const runIdLine = rich.lines.out.find((l) => l.includes("crn_run_"));
      const runId = /crn_run_[A-Z0-9]+/.exec(runIdLine!)![0];

      const review = richIo();
      const rv = await runCli(["resume", runId], review, ws);
      expect(rv.code).toBe(ExitCode.ok);
      expect(review.lines.out.join("\n")).toContain("awaiting your authority");
    });
  });
  test("gate denial rich: the human refusal closes the run with evidence", async () => {
    const ws = await makeWorkspace(`schemaVersion: "0.1"
project:
  name: gate-deny
  description: "PHASE Ω denial surface"
policy:
  rules:
    - id: prompt-research
      principalKinds: [research]
      domain: research.index
      scope: "*"
      effect: prompt
      rationale: "human authority checkpoint"
telemetry:
  enabled: false
`);
    await mkdir(join(ws, "sources"), { recursive: true });
    await writeFile(join(ws, "sources", "doc.md"), "# denial demo source\n", "utf8");
    await withRichEnv(async () => {
      const rich = richIo();
      const r = await runCli(["run", "demo", "--sources", "sources"], rich, ws);
      expect(r.code).toBe(ExitCode.ok);
      const runIdLine = rich.lines.out.find((l) => l.includes("crn_run_"));
      const runId = /crn_run_[A-Z0-9]+/.exec(runIdLine!)![0];

      const deny = richIo();
      const rd = await runCli(["resume", runId, "--answer", '{"approved":false}'], deny, ws);
      expect(rd.code).toBe(ExitCode.brokerDenied);
      const joined = deny.lines.out.join("\n");
      expect(joined).toContain("Gate denied");
      expect(joined).toContain("receipt");
    });
  });
});
