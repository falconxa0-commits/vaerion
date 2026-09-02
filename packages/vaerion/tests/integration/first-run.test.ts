/**
 * The empty-laptop experience — integration surface (ASCENSION XVIII Phase 2;
 * constitution v1.2 D-M′/A2: the welcome front door + the guided tour).
 *
 * Every fixture is a hermetic temp directory (no network, no wall-clock, no
 * ambient state). Every test drives the real `runCli` entry — the same
 * contracts a user exercises on an empty laptop. The read-only law is proven
 * by hashing the whole directory before and after every read-only surface.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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

/** runCli returns a CliResult; tests assert the honest exit code. */
async function runCode(argv: string[], io: ReturnType<typeof captureIo>["io"], dir: string): Promise<number> {
  return (await runCli(argv, io, dir)).code;
}

/** Deterministic directory snapshot: relative path → blake3 of contents
 *  (files only; the empty-directory case yields an empty map). */
async function snapshotDir(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
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
  const dir = await mkdtemp(join(tmpdir(), `vaerion-${name}-`));
  rootsToClean.push(dir);
  return dir;
}

/* ───────────────────────────  the welcome front door  ─────────────────────────── */

describe("bare `vae` — the welcome front door (constitution v1.2 D-M′/A2)", () => {
  test("teaches in a fresh directory and exits 0 (plain face)", async () => {
    const dir = await freshDir("welcome-fresh");
    const { captured, io } = captureIo();
    const code = await runCode([], io, dir);
    expect(code).toBe(ExitCode.ok);
    expect(captured.err).toEqual([]);
    const text = captured.lines.join("\n");
    expect(text).toContain("command: welcome");
    expect(text).toContain("kind: fresh");
    expect(text).toContain("vae init");
    expect(text).not.toContain("E1600");
  });

  test("--json is a single pure line with the stable contract", async () => {
    const dir = await freshDir("welcome-json");
    const { captured, io } = captureIo();
    const code = await runCode(["--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    expect(captured.out).toHaveLength(1);
    expect(captured.err).toEqual([]);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect(payload["command"]).toBe("welcome");
    const directory = payload["directory"] as Record<string, unknown>;
    expect(directory["kind"]).toBe("fresh");
    expect(directory["has_config"]).toBe(false);
    expect(directory["runs"]).toBe(0);
    const next = payload["next"] as Record<string, unknown>;
    expect(next["command"]).toBe("vae init");
    expect(typeof payload["read_only"]).toBe("string");
  });

  test("detects an existing workspace and points at `vae doctor`", async () => {
    const dir = await freshDir("welcome-ws");
    const init = captureIo();
    expect(await runCode(["init", "--name", "tour-demo"], init.io, dir)).toBe(ExitCode.ok);
    const { captured, io } = captureIo();
    const code = await runCode(["--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    const directory = payload["directory"] as Record<string, unknown>;
    expect(directory["kind"]).toBe("workspace");
    expect(directory["has_config"]).toBe(true);
    const next = payload["next"] as Record<string, unknown>;
    expect(next["command"]).toBe("vae doctor");
  });

  test("is side-effect-free: the directory hash is identical before and after", async () => {
    const dir = await freshDir("welcome-readonly");
    await writeFile(join(dir, "keep.txt"), "unchanged\n", "utf8");
    const before = await snapshotDir(dir);
    const { io } = captureIo();
    expect(await runCode([], io, dir)).toBe(ExitCode.ok);
    const after = await snapshotDir(dir);
    expect(after.size).toBe(before.size);
    for (const [k, v] of before) expect(after.get(k)).toBe(v);
  });

  test("rich face (TTY): banner + payload + footer, still exit 0, still teaching", async () => {
    const dir = await freshDir("welcome-rich");
    const prevUi = process.env.VAE_UI;
    process.env.VAE_UI = "rich";
    try {
      const { captured, io } = captureIo(true, 100);
      const code = await runCode([], io, dir);
      expect(code).toBe(ExitCode.ok);
      const text = captured.lines.join("\n");
      expect(text).toContain("welcome");
      expect(text).not.toContain("E1600");
    } finally {
      if (prevUi === undefined) delete process.env.VAE_UI;
      else process.env.VAE_UI = prevUi;
    }
  });

  test("the unknown-command usage contract is intact (E1600, exit 2)", async () => {
    const dir = await freshDir("welcome-usage");
    const { captured, io } = captureIo();
    const code = await runCode(["definitely-not-a-command"], io, dir);
    expect(code).toBe(ExitCode.usage);
    expect(captured.lines.join("\n")).toContain("E1600");
  });

  test("security canary: no planted secret-shaped material reaches any output face", async () => {
    const dir = await freshDir("welcome-canary");
    await writeFile(join(dir, "canary.txt"), CANARY + "\n", "utf8");
    const prevCanary = process.env.VAE_TEST_CANARY;
    process.env.VAE_TEST_CANARY = CANARY;
    try {
      for (const argv of [[], ["--json"], ["tour"], ["tour", "--json"]]) {
        const { captured, io } = captureIo();
    const code = await runCode(argv as string[], io, dir);
        expect(code).toBe(ExitCode.ok);
        const all = captured.lines.join("\n");
        expect(all).not.toContain(CANARY);
      }
    } finally {
      if (prevCanary === undefined) delete process.env.VAE_TEST_CANARY;
      else process.env.VAE_TEST_CANARY = prevCanary;
    }
  });
});

/* ───────────────────────────────  `vae tour`  ─────────────────────────────── */

describe("`vae tour` — the guided, read-only walk (Phase 2)", () => {
  test("walks nine steps in a fresh directory and exits 0", async () => {
    const dir = await freshDir("tour-fresh");
    const { captured, io } = captureIo();
    const code = await runCode(["tour"], io, dir);
    expect(code).toBe(ExitCode.ok);
    expect(captured.err).toEqual([]);
    const text = captured.lines.join("\n");
    expect(text).toContain("command: tour");
    for (const title of ["What Vaerion is", "This directory", "The config law", "The journal", "Doctor — the health audit", "The gateway single gate", "Your first run", "The trust surface", "Where to go next"]) {
      expect(text).toContain(title);
    }
    expect(text).toContain("try: vae init");
    expect(text).toContain("try: vae doctor");
    expect(text).toContain("try: vae journal ls");
  });

  test("--json is a single pure line with nine measured steps", async () => {
    const dir = await freshDir("tour-json");
    const { captured, io } = captureIo();
    const code = await runCode(["tour", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    expect(captured.out).toHaveLength(1);
    expect(captured.err).toEqual([]);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect(payload["command"]).toBe("tour");
    const steps = payload["steps"] as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(9);
    for (let i = 0; i < 9; i++) expect(steps[i]?.["step"]).toBe(i + 1);
    expect(typeof payload["read_only"]).toBe("string");
  });

  test("is deterministic: the same directory yields byte-identical --json output", async () => {
    const dir = await freshDir("tour-determinism");
    const a = captureIo();
    const b = captureIo();
    await runCli(["tour", "--json"], a.io, dir);
    await runCli(["tour", "--json"], b.io, dir);
    expect(b.captured.out).toEqual(a.captured.out);
  });

  test("is read-only: the directory hash is identical before and after", async () => {
    const dir = await freshDir("tour-readonly");
    await writeFile(join(dir, "keep.txt"), "unchanged\n", "utf8");
    const before = await snapshotDir(dir);
    const { io } = captureIo();
    expect(await runCode(["tour"], io, dir)).toBe(ExitCode.ok);
    const after = await snapshotDir(dir);
    expect(after.size).toBe(before.size);
    for (const [k, v] of before) expect(after.get(k)).toBe(v);
  });

  test("measures a real workspace after init (kind, runs, audit ledger)", async () => {
    const dir = await freshDir("tour-ws");
    expect(await runCode(["init", "--name", "tour-demo"], captureIo().io, dir)).toBe(ExitCode.ok);
    const { captured, io } = captureIo();
    const code = await runCode(["tour", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    const directory = payload["directory"] as Record<string, unknown>;
    expect(directory["kind"]).toBe("workspace");
    expect(directory["has_config"]).toBe(true);
    const steps = payload["steps"] as Array<Record<string, unknown>>;
    const doctorStep = steps[4] as { measured: string[] };
    expect(doctorStep.measured[0]).toContain("intact");
  });

  test("refuses arguments (E1600, exit 2) — the walk takes none", async () => {
    const dir = await freshDir("tour-usage");
    const { captured, io } = captureIo();
    const code = await runCode(["tour", "extra"], io, dir);
    expect(code).toBe(ExitCode.usage);
    expect(captured.lines.join("\n")).toContain("E1600");
  });

  test("--help teaches and never executes (Guarantee #1)", async () => {
    const dir = await freshDir("tour-help");
    const { captured, io } = captureIo();
    const code = await runCode(["tour", "--help"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const text = captured.lines.join("\n");
    expect(text).toContain("vae tour");
    expect(text).toContain("guided, read-only walk");
    expect(text).not.toContain("command: tour");
    expect(text).not.toContain("What Vaerion is");
  });

  test("rich face (TTY) renders the walk within the design language", async () => {
    const dir = await freshDir("tour-rich");
    const prevUi = process.env.VAE_UI;
    process.env.VAE_UI = "rich";
    try {
      const { captured, io } = captureIo(true, 100);
      const code = await runCode(["tour"], io, dir);
      expect(code).toBe(ExitCode.ok);
      expect(captured.lines.join("\n")).toContain("The gateway single gate");
    } finally {
      if (prevUi === undefined) delete process.env.VAE_UI;
      else process.env.VAE_UI = prevUi;
    }
  });
});

/* ───────────────────────  D-M′ help/dispatch agreement  ─────────────────────── */

describe("D-M′ — help and dispatch never disagree (v1.5 surface)", () => {
  test("MAIN_HELP lists every ratified command including `tour`, `account`, `ai` and `center`, and the welcome door is announced", async () => {
    const { MAIN_HELP } = await import("../../src/cli/vae.ts");
    for (const command of ["init", "run", "resume", "explain", "journal", "doctor", "dev", "serve", "package", "provenance", "repo", "ci", "release", "tour", "account", "ai", "center"])  {
      expect(MAIN_HELP).toContain(command);
    }
    expect(MAIN_HELP).toContain("welcome front door");
    expect(MAIN_HELP).toContain("VAERION_CONSTITUTION_v1.5.md");
  });

  test("the full first-run journey: bare vae → init → bare vae → tour, all exit 0", async () => {
    const dir = await freshDir("journey");
    const s1 = captureIo();
    expect(await runCode([], s1.io, dir)).toBe(ExitCode.ok);
    expect(s1.captured.lines.join("\n")).toContain("kind: fresh");
    expect(await runCode(["init", "--name", "journey"], captureIo().io, dir)).toBe(ExitCode.ok);
    const s3 = captureIo();
    expect(await runCode([], s3.io, dir)).toBe(ExitCode.ok);
    const text = s3.captured.lines.join("\n");
    expect(text).toContain("kind: workspace");
    expect(text).toContain("vae doctor");
    expect(await runCode(["tour"], captureIo().io, dir)).toBe(ExitCode.ok);
  });
});
