/**
 * Color accessibility (ASCENSION XVIII Phase 8; constitution v1.4 A4 — the
 * accessibility law; P7 honest surfaces).
 *
 * Law under test: color NEVER carries meaning on its own, and the ambient
 * environment always has a veto:
 *   - NO_COLOR / TERM=dumb / CI (any of them) degrades the TTY profile to
 *     plain — ambient honesty beats TTY capability;
 *   - an EXPLICIT VAE_UI=rich beats ambient NO_COLOR (the user asked for it
 *     explicitly; documented precedence: explicit > ambient > detection);
 *   - --json is never painted (ansi:false, structurally).
 * The rich profile's decorative value is pinned separately (gateway-cli rich
 * section); here we pin the ACCESSIBILITY contract of the profile law.
 */

import { describe, expect, test, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfile } from "../../src/cli/ui.ts";
import { runCli } from "../../src/cli/vae.ts";

const CONFIG_YAML = `schemaVersion: "0.1"
project:
  name: color-a11y
  description: "Phase 8 color accessibility pins"
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

const workspaces: string[] = [];
async function makeWorkspace(): Promise<string> {
  const ws = await mkdtemp(join(tmpdir(), "vaerion-color-a11y-"));
  workspaces.push(ws);
  await writeFile(join(ws, "vaerion.yaml"), CONFIG_YAML, "utf8");
  return ws;
}

const savedEnv = new Map<string, string | undefined>();
const track = (k: string): void => { if (!savedEnv.has(k)) savedEnv.set(k, process.env[k]); };
afterAll(async () => {
  for (const [k, v] of savedEnv) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true });
});

const ttyEnv = (vars: Record<string, string | undefined>): { tty: boolean; columns: number; vars: Record<string, string | undefined> } => ({
  tty: true,
  columns: 100,
  vars,
});

describe("profile precedence — the color accessibility law", () => {
  test("NO_COLOR degrades a capable TTY to plain (the standard wins)", () => {
    const p = resolveProfile("plain", ttyEnv({ NO_COLOR: "1", TERM: "xterm-256color" }));
    expect(p.profile).toBe("plain");
    expect(p.ansi).toBe(false);
  });

  test("TERM=dumb degrades to plain (no escape sequences into a dumb terminal)", () => {
    const p = resolveProfile("plain", ttyEnv({ TERM: "dumb" }));
    expect(p.profile).toBe("plain");
    expect(p.ansi).toBe(false);
  });

  test("CI degrades to plain (machines read bytes, not paint)", () => {
    const p = resolveProfile("plain", ttyEnv({ TERM: "xterm-256color", CI: "1" }));
    expect(p.profile).toBe("plain");
    expect(p.ansi).toBe(false);
  });

  test("explicit VAE_UI=rich beats ambient NO_COLOR (explicit > ambient, documented)", () => {
    const p = resolveProfile("plain", ttyEnv({ VAE_UI: "rich", NO_COLOR: "1" }));
    expect(p.profile).toBe("rich");
    expect(p.ansi).toBe(true);
  });

  test("explicit VAE_UI=plain beats a capable TTY", () => {
    const p = resolveProfile("plain", ttyEnv({ VAE_UI: "plain", TERM: "xterm-256color" }));
    expect(p.profile).toBe("plain");
    expect(p.ansi).toBe(false);
  });

  test("--json is never painted in any environment", () => {
    for (const vars of [{}, { NO_COLOR: "1" }, { VAE_UI: "rich" }, { CI: "1" }]) {
      const p = resolveProfile("json", ttyEnv(vars));
      expect(p.profile).toBe("json");
      expect(p.ansi).toBe(false);
    }
  });
});

describe("end-to-end: no ANSI escapes reach the ambient-degraded surface", () => {
  test("a real run with NO_COLOR set emits zero escape sequences (rich capability, ambient veto)", async () => {
    const ws = await makeWorkspace();
    track("NO_COLOR");
    track("VAE_UI");
    track("CI");
    track("TERM");
    process.env.NO_COLOR = "1";
    delete process.env.VAE_UI;
    delete process.env.CI;
    process.env.TERM = "xterm-256color";
    const out: string[] = [];
    const r = await runCli(["dev"], { out: (l) => out.push(l), err: () => undefined, tty: true, columns: 100 }, ws);
    expect(r.code).toBe(0);
    const joined = out.join("\n");
    expect(joined.length).toBeGreaterThan(0);
    expect(joined).not.toMatch(/\u001b\[/);
  });

  test("control: the same run explicitly forced rich does paint (the veto is NO_COLOR's work, not an absence)", async () => {
    const ws = await makeWorkspace();
    track("NO_COLOR");
    track("VAE_UI");
    process.env.VAE_UI = "rich";
    delete process.env.NO_COLOR;
    const out: string[] = [];
    const r = await runCli(["dev"], { out: (l) => out.push(l), err: () => undefined, tty: true, columns: 100 }, ws);
    expect(r.code).toBe(0);
    expect(out.join("\n")).toMatch(/\u001b\[/);
  });
});
