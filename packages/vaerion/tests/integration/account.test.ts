/**
 * `vae account` — the identity & attribution surface (ASCENSION XVIII Phase 3;
 * constitution v1.3 A3; P5/D-D/D-P).
 *
 * Every fixture is a hermetic temp directory. Every test drives the real
 * `runCli` entry. The read-only law is proven by hashing the whole directory
 * before and after. Determinism is proven by byte-identical `--json` output
 * for the same directory. Secret VALUES never appear on any face — names only.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli/vae.ts";
import { ExitCode } from "../../src/cli/io.ts";
import { blake3HexOf } from "../../src/kernel/hash.ts";

const rootsToClean: string[] = [];
afterAll(async () => {
  for (const r of rootsToClean) await rm(r, { recursive: true, force: true }).catch(() => undefined);
});

interface Captured {
  out: string[];
  err: string[];
  lines: string[];
}

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

async function snapshotDir(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { readdir, readFile } = await import("node:fs/promises");
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const rel = prefix === "" ? e.name : `${prefix}/${e.name}`;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        out.set(`${rel}/`, "dir");
        await walk(abs, rel);
      } else if (e.isFile()) {
        const bytes = await readFile(abs);
        out.set(rel, await blake3HexOf(new Uint8Array(bytes)));
      }
    }
  }
  await walk(root, "");
  return out;
}

const CANARY = "sk-canary-NEVER-LEAK-9f3a";

async function freshDir(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `vaerion-account-`));
  rootsToClean.push(dir);
  return dir;
}

const CONFIG_YAML = `schemaVersion: "0.1"
project:
  name: account-demo
  description: "identity surface"
gateway:
  providers:
    mockbrain:
      enabled: true
      models:
        - mock-1
secrets:
  DEMO_TOKEN:
    grant: ["agent:*"]
telemetry:
  enabled: false
`;

describe("`vae account` — the identity & attribution surface (Phase 3, A3)", () => {
  test("plain face teaches the actor law in a fresh directory; exit 0", async () => {
    const dir = await freshDir("plain");
    const { captured, io } = captureIo();
    const code = await runCode(["account"], io, dir);
    expect(code).toBe(ExitCode.ok);
    expect(captured.err).toEqual([]);
    const text = captured.lines.join("\n");
    expect(text).toContain("command: account");
    expect(text).toContain("config_state: absent");
    expect(text).toContain("human_principal_id: human");
    expect(text).toContain("Auren <auren@vaerion.dev>");
    expect(text).not.toContain("E1600");
  });

  test("--json is a single pure line carrying the stable contract", async () => {
    const dir = await freshDir("json");
    const { captured, io } = captureIo();
    const code = await runCode(["account", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    expect(captured.out).toHaveLength(1);
    expect(captured.err).toEqual([]);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect(payload["command"]).toBe("account");
    expect(payload["config_state"]).toBe("absent");
    const law = payload["actor_law"] as Record<string, unknown>;
    expect(law["human_principal_id"]).toBe("human");
    expect(law["local_actor"]).toEqual({ kind: "human", id: "local-user" });
    expect(law["ratified_commit_identity"]).toBe("Auren <auren@vaerion.dev>");
    expect(Array.isArray(law["principal_kinds"])).toBe(true);
    expect(payload["observed_actors"]).toEqual([]);
    const ci = payload["commit_identity"] as Record<string, unknown>;
    // A bare temp dir is not a git repository: the absence is measured and honest.
    expect(ci["measured"]).toBe(false);
    expect(String(ci["note"])).toContain("E2300");
    expect(Array.isArray(payload["secret_profiles"])).toBe(true);
    expect(typeof payload["read_only"]).toBe("string");
  });

  test("determinism: the same directory yields byte-identical --json output", async () => {
    const dir = await freshDir("determinism");
    const a = captureIo();
    expect(await runCode(["account", "--json"], a.io, dir)).toBe(ExitCode.ok);
    const b = captureIo();
    expect(await runCode(["account", "--json"], b.io, dir)).toBe(ExitCode.ok);
    expect(b.captured.out[0]).toBe(a.captured.out[0]);
  });

  test("observed actors: a real gateway run's actors are folded from the journal", async () => {
    const dir = await freshDir("observed");
    await writeFile(join(dir, "vaerion.yaml"), CONFIG_YAML, "utf8");
    const runIo = captureIo();
    expect(await runCode(["run", "model", "--model", "mockbrain/mock-1", "--prompt", "hello", "--seed", "7", "--json"], runIo.io, dir)).toBe(ExitCode.ok);
    const { captured, io } = captureIo();
    const code = await runCode(["account", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect(payload["config_state"]).toBe("present");
    const actors = payload["observed_actors"] as Array<Record<string, unknown>>;
    expect(actors.length).toBeGreaterThan(0);
    const human = actors.find((a) => a["kind"] === "human" && a["id"] === "human");
    expect(human).toBeDefined();
    expect(Number(human?.["decisions"] ?? 0)).toBeGreaterThan(0); // the model.invoke broker decision
    expect(Number(human?.["events"] ?? 0)).toBeGreaterThan(0); // the gateway.invoke.recorded envelope
    // Sorted deterministically: (kind, id) ascending.
    const sorted = [...actors].map((a) => `${a["kind"]}\u0000${a["id"]}`).sort();
    expect(actors.map((a) => `${a["kind"]}\u0000${a["id"]}`)).toEqual(sorted);
  });

  test("secret profiles carry NAMES and grant patterns — never values", async () => {
    const dir = await freshDir("profiles");
    await writeFile(join(dir, "vaerion.yaml"), CONFIG_YAML, "utf8");
    const { captured, io } = captureIo();
    expect(await runCode(["account", "--json"], io, dir)).toBe(ExitCode.ok);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    const profiles = payload["secret_profiles"] as Array<Record<string, unknown>>;
    expect(profiles).toEqual([{ name: "DEMO_TOKEN", granted: ["agent:*"] }]);
  });

  test("invalid config is reported honestly (config_state: invalid) and account still measures", async () => {
    const dir = await freshDir("invalid");
    await writeFile(join(dir, "vaerion.yaml"), "schemaVersion: \"0.1\"\nproject: { name: \"x\" }\nbogus_key: true\ntelemetry:\n  enabled: false\n", "utf8");
    const { captured, io } = captureIo();
    const code = await runCode(["account", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect(payload["config_state"]).toBe("invalid");
    expect(payload["secret_profiles"]).toEqual([]);
  });

  test("is side-effect-free: the directory hash is identical before and after", async () => {
    const dir = await freshDir("readonly");
    await writeFile(join(dir, "keep.txt"), "unchanged\n", "utf8");
    const before = await snapshotDir(dir);
    const { io } = captureIo();
    expect(await runCode(["account"], io, dir)).toBe(ExitCode.ok);
    const after = await snapshotDir(dir);
    expect(after.size).toBe(before.size);
    for (const [k, v] of before) expect(after.get(k)).toBe(v);
  });

  test("usage law: any positional argument is refused (E1600, exit 2)", async () => {
    const dir = await freshDir("usage");
    const { captured, io } = captureIo();
    const code = await runCode(["account", "extra"], io, dir);
    expect(code).toBe(ExitCode.usage);
    expect(captured.lines.join("\n")).toContain("E1600");
  });

  test("help purity: `vae account --help` teaches and never executes", async () => {
    const dir = await freshDir("help");
    const { captured, io } = captureIo();
    const code = await runCode(["account", "--help"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const text = captured.lines.join("\n");
    expect(text).toContain("vae account");
    expect(text).toContain("identity & attribution surface");
    expect(text).not.toContain("command: account");
  });

  test("rich face (TTY): purpose-built identity panels render, exit 0", async () => {
    const dir = await freshDir("rich");
    const prevUi = process.env.VAE_UI;
    process.env.VAE_UI = "rich";
    try {
      const { captured, io } = captureIo(true, 100);
      const code = await runCode(["account"], io, dir);
      expect(code).toBe(ExitCode.ok);
      const text = captured.lines.join("\n");
      expect(text).toContain("Identity — who acts here");
      expect(text).toContain("Commit identity (D-P)");
      expect(text).toContain("Secret profiles");
    } finally {
      if (prevUi === undefined) delete process.env.VAE_UI;
      else process.env.VAE_UI = prevUi;
    }
  });

  test("security canary: a planted secret value reaches NO output face", async () => {
    const dir = await freshDir("canary");
    await writeFile(join(dir, "vaerion.yaml"), CONFIG_YAML, "utf8");
    await writeFile(join(dir, "canary.txt"), CANARY + "\n", "utf8");
    const prevCanary = process.env.VAE_TEST_CANARY;
    process.env.VAE_TEST_CANARY = CANARY;
    try {
      for (const argv of [["account"], ["account", "--json"], ["account", "--help"]]) {
        const { captured, io } = captureIo();
        const code = await runCode(argv as string[], io, dir);
        expect(code).toBe(ExitCode.ok);
        expect(captured.lines.join("\n")).not.toContain(CANARY);
      }
    } finally {
      if (prevCanary === undefined) delete process.env.VAE_TEST_CANARY;
      else process.env.VAE_TEST_CANARY = prevCanary;
    }
  });
});
