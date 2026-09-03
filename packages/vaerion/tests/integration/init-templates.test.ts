/**
 * `vae init --template` — the deterministic template registry (ASCENSION
 * XVIII Phase 5; constitution v1.3 A3).
 *
 * Pins: bare init == minimal == the pre-A3 default bytes; every template
 * renders byte-stably, validates against the strict config law, and carries
 * structurally-false telemetry; unknown templates are E1203 (exit 2); a
 * scaffolded agent workspace passes doctor end-to-end.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli/vae.ts";
import { ExitCode } from "../../src/cli/io.ts";
import { INIT_TEMPLATES, initTemplateNames, renderInitTemplate, DEFAULT_INIT_TEMPLATE } from "../../src/config/templates.ts";
import { loadConfig } from "../../src/config/config.ts";
import { blake3HexOf } from "../../src/kernel/hash.ts";

const rootsToClean: string[] = [];
afterAll(async () => {
  for (const r of rootsToClean) await rm(r, { recursive: true, force: true }).catch(() => undefined);
});

interface Captured { out: string[]; err: string[]; lines: string[] }

function captureIo(tty = false, columns?: number) {
  const captured: Captured = { out: [], err: [], lines: [] };
  return {
    captured,
    io: {
      out: (l: string) => { captured.out.push(l); captured.lines.push(l); },
      err: (l: string) => { captured.err.push(l); captured.lines.push(l); },
      raw: () => undefined,
      tty,
      columns,
    },
  };
}

async function runCode(argv: string[], io: ReturnType<typeof captureIo>["io"], dir: string): Promise<number> {
  return (await runCli(argv, io, dir)).code;
}

async function freshDir(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `vaerion-init-`));
  rootsToClean.push(dir);
  return dir;
}

/** The pre-A3 default (the literal that lived in commands.ts through v1.2). */
const PRE_A3_DEFAULT = `# Vaerion project configuration (schema 0.1)
# Unknown keys are rejected by law — see spec/schemas/vaerion-yaml.schema.json
schemaVersion: "0.1"
project:
  name: {{NAME}}
  description: "Vaerion project"
research:
  capabilities:
    - name: project-docs
      sources:
        - { kind: local, path: "./docs" }
      fencing: untrusted
      maxItems: 100
# Broker policy rules (MS-2) — first match wins; unmatched requests deny fail-closed.
# Every rule must state its rationale:
# policy:
#   rules:
#     - id: deny-secret-read
#       principalKinds: [agent]
#       domain: secret.read
#       scope: "*"
#       effect: deny
#       rationale: "agents never read secrets; humans use the keychain directly"
telemetry:
  enabled: false
`;

describe("the init template registry (Phase 5)", () => {
  test("the registry of record is exactly minimal, demo, agent — deterministic names", () => {
    expect(initTemplateNames()).toEqual(["agent", "demo", "minimal"]);
    expect(DEFAULT_INIT_TEMPLATE).toBe("minimal");
    expect(Object.keys(INIT_TEMPLATES).length).toBe(3);
  });

  test("bare init is byte-identical to the pre-A3 default (evolution without betrayal)", async () => {
    const dir = await freshDir("bare-bytes");
    expect(await runCode(["init", "--name", "byte-check"], captureIo().io, dir)).toBe(ExitCode.ok);
    const written = await readFile(join(dir, "vaerion.yaml"), "utf8");
    expect(written).toBe(PRE_A3_DEFAULT.replace("{{NAME}}", "byte-check"));
  });

  test("every template renders byte-stably and validates against the strict config law", async () => {
    for (const templateName of initTemplateNames()) {
      const a = renderInitTemplate(templateName, "render-check");
      const b = renderInitTemplate(templateName, "render-check");
      expect(a).toBe(b); // deterministic: no wall-clock, no ambient state
      expect(a).not.toContain("{{NAME}}"); // the single token is substituted
      // The strict law accepts every scaffold (unknown keys are rejected).
      const dir = await freshDir(`validate-${templateName}`);
      await writeFile(join(dir, "vaerion.yaml"), a, "utf8");
      const { config } = await loadConfig(join(dir, "vaerion.yaml"));
      expect(config.project.name).toBe("render-check");
      expect(config.telemetry.enabled).toBe(false); // zero telemetry is structural
    }
  });

  test("every template carries the project name substitution and a declared capability", () => {
    for (const templateName of initTemplateNames()) {
      const rendered = renderInitTemplate(templateName, "name-probe");
      expect(rendered).toContain("name: name-probe");
      expect(rendered).toContain("research:");
      expect(rendered).toContain("fencing: untrusted");
    }
  });

  test("invalid project names are refused before any write (E1600)", () => {
    expect(() => renderInitTemplate("minimal", "Bad Name")).toThrow(/invalid project name/);
    expect(() => renderInitTemplate("minimal", "9-lives")).toThrow(/invalid project name/);
  });
});

describe("`vae init --template` — the CLI face (Phase 5)", () => {
  test("unknown template is a stable usage error: E1203, exit 2, nothing written", async () => {
    const dir = await freshDir("unknown");
    const { captured, io } = captureIo();
    const code = await runCode(["init", "--template", "vibes"], io, dir);
    expect(code).toBe(ExitCode.usage);
    const text = captured.lines.join("\n");
    expect(text).toContain("E1203");
    expect(text).toContain("agent, demo, minimal"); // the available set is named (deterministic order)
    const { stat } = await import("node:fs/promises");
    expect(await stat(join(dir, "vaerion.yaml")).then(() => true, () => false)).toBe(false);
  });

  test("--dry-run is pure and names the template in the plan", async () => {
    const dir = await freshDir("dryrun");
    const { captured, io } = captureIo();
    const code = await runCode(["init", "--template", "agent", "--dry-run", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    expect(captured.out).toHaveLength(1);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect(payload["command"]).toBe("init");
    expect(payload["template"]).toBe("agent");
    expect(payload["dry_run"]).toBe(true);
    expect(payload["side_effects"]).toBe(0);
    const { stat } = await import("node:fs/promises");
    expect(await stat(join(dir, "vaerion.yaml")).then(() => true, () => false)).toBe(false);
  });

  test("a scaffolded agent workspace passes doctor end-to-end (config + gateway matrix)", async () => {
    const dir = await freshDir("agent-e2e");
    expect(await runCode(["init", "--template", "agent", "--name", "agent-probe"], captureIo().io, dir)).toBe(ExitCode.ok);
    const { captured, io } = captureIo();
    const code = await runCode(["doctor", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok); // every doctor check green
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    const checks = payload["checks"] as Array<Record<string, unknown>>;
    const configCheck = checks.find((c) => c["check"] === "config");
    expect(configCheck?.["ok"]).toBe(true);
    const matrixCheck = checks.find((c) => c["check"] === "gateway-config");
    expect(String(matrixCheck?.["detail"] ?? "")).toContain("mockbrain");
  });

  test("the demo template scaffolds its declared capability — no manual setup (XX-D6)", async () => {
    const dir = await freshDir("demo-cap");
    expect(await runCode(["init", "--template", "demo", "--name", "demo-probe"], captureIo().io, dir)).toBe(ExitCode.ok);
    // D-Y: the template scaffolds EXACTLY what its config declares. The old
    // test created ./sources by hand — teaching the workaround instead of
    // proving the journey; the empty machine measured the consequence.
    const scaffolded = await readFile(join(dir, "sources", "demo.md"), "utf8");
    expect(scaffolded).toContain("append-only hash chain");
    const { captured, io } = captureIo();
    // The declared capability name resolves in the config law (unknown → E1600).
    const code = await runCode(["ai", "ask", "--question", "q", "--capability", "sources", "--dry-run", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect((payload["plan"] as Record<string, unknown>)["capability"]).toBe("sources");
  });

  test("the demo first-run journey works AS TAUGHT — bare 'run demo', no --sources (D-Y, XX-D6)", async () => {
    const dir = await freshDir("demo-journey");
    expect(await runCode(["init", "--template", "demo", "--name", "journey"], captureIo().io, dir)).toBe(ExitCode.ok);
    // Dry-run: the default derives from the workspace config of record —
    // the hardcoded ["./docs/constitution", "./docs/adr"] literal is dead.
    const dry = captureIo();
    expect(await runCode(["run", "demo", "--query", "journal", "--dry-run", "--json"], dry.io, dir)).toBe(ExitCode.ok);
    const dryPayload = JSON.parse(dry.captured.out[0] as string) as Record<string, unknown>;
    expect((dryPayload["plan"] as Record<string, unknown>)["sources"]).toEqual(["./sources"]);
    // The real journey: index the scaffolded source, query, receipt, verified.
    const real = captureIo();
    const code = await runCode(["run", "demo", "--query", "journal", "--json"], real.io, dir);
    expect(code).toBe(ExitCode.ok);
    const payload = JSON.parse(real.captured.out[0] as string) as Record<string, unknown>;
    expect(payload["journal_verified"]).toBe(true);
    expect(payload["documents"]).toBe(1); // the scaffolded source, indexed
    expect(payload["hits"]).toBe(1);
  });

  test("a configless demo run with no --sources fails closed with teaching (E1600)", async () => {
    const dir = await freshDir("demo-configless");
    const { captured, io } = captureIo();
    const code = await runCode(["run", "demo", "--query", "q"], io, dir);
    expect(code).toBe(ExitCode.usage);
    expect(captured.lines.join("\n")).toContain("declare research.capabilities");
  });

  test("--json face is a single pure line with the stable contract", async () => {
    const dir = await freshDir("json");
    const { captured, io } = captureIo();
    const code = await runCode(["init", "--template", "demo", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    expect(captured.out).toHaveLength(1);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect(payload["command"]).toBe("init");
    expect(payload["template"]).toBe("demo");
    expect(payload["dry_run"]).toBe(false);
    expect(typeof payload["config_fingerprint"]).toBe("string");
  });

  test("init still refuses to overwrite an existing vaerion.yaml (E1600, exit 2)", async () => {
    const dir = await freshDir("overwrite");
    expect(await runCode(["init"], captureIo().io, dir)).toBe(ExitCode.ok);
    const { captured, io } = captureIo();
    const code = await runCode(["init", "--template", "agent"], io, dir);
    expect(code).toBe(ExitCode.usage);
    expect(captured.lines.join("\n")).toContain("already exists");
  });
});
