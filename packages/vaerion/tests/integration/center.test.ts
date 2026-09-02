/**
 * `vae center` — the operator cockpit (ASCENSION XVIII Phase 6; constitution
 * v1.3 A3; P7/D-S). One measured core (center/center.ts): runs, receipts,
 * gateway metering, audit + refusal-log integrity, referenced blobs, and the
 * release readiness digest. Read-only, deterministic, honest absences.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli/vae.ts";
import { ExitCode } from "../../src/cli/io.ts";
import { measureCenter } from "../../src/center/center.ts";
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

async function freshDir(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `vaerion-center-`));
  rootsToClean.push(dir);
  return dir;
}

const CONFIG_YAML = `schemaVersion: "0.1"
project:
  name: center-demo
  description: "operator cockpit"
gateway:
  providers:
    mockbrain:
      enabled: true
      models:
        - mock-1
telemetry:
  enabled: false
`;

describe("`vae center` — the operator cockpit (Phase 6)", () => {
  test("fresh directory: honest zeros, both chains absent-but-intact, exit 0", async () => {
    const dir = await freshDir("fresh");
    const { captured, io } = captureIo();
    const code = await runCode(["center", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    expect(captured.out).toHaveLength(1);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    expect(payload["command"]).toBe("center");
    expect(payload["ok"]).toBe(true);
    const ops = payload["operations"] as Record<string, unknown>;
    expect(ops["journals_verified"]).toBe(true);
    expect((ops["runs"] as unknown[]).length).toBe(0);
    const metering = ops["metering"] as Record<string, unknown>;
    expect(metering["invocations"]).toBe(0);
    const release = payload["release"] as Record<string, unknown>;
    // A temp dir is not a git repository: the absence is measured and honest.
    expect(release["measured"]).toBe(false);
    expect(typeof payload["read_only"]).toBe("string");
  });

  test("a real gateway run is folded: runs, receipts, metering, blob refs", async () => {
    const dir = await freshDir("run");
    await mkdir(join(dir, "sources"), { recursive: true });
    await writeFile(join(dir, "vaerion.yaml"), CONFIG_YAML, "utf8");
    expect(await runCode(["run", "model", "--model", "mockbrain/mock-1", "--prompt", "hello", "--seed", "9", "--json"], captureIo().io, dir)).toBe(ExitCode.ok);
    const { captured, io } = captureIo();
    const code = await runCode(["center", "--json"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const payload = JSON.parse(captured.out[0] as string) as Record<string, unknown>;
    const ops = payload["operations"] as Record<string, unknown>;
    expect((ops["runs"] as unknown[]).length).toBe(1);
    expect(ops["receipts"]).toBe(1);
    expect(ops["journals_verified"]).toBe(true);
    const metering = ops["metering"] as Record<string, unknown>;
    expect(metering["invocations"]).toBe(1);
    expect(Number(metering["inputTokens"] ?? 0)).toBeGreaterThan(0);
    const blobRefs = ops["blob_refs"] as Record<string, unknown>;
    // A chat-only run references no blobs; the count is an honest zero.
    expect(blobRefs["failed"]).toBe(0);
  });

  test("determinism: the same artifacts yield byte-identical --json output", async () => {
    const dir = await freshDir("determinism");
    const a = captureIo();
    expect(await runCode(["center", "--json"], a.io, dir)).toBe(ExitCode.ok);
    const b = captureIo();
    expect(await runCode(["center", "--json"], b.io, dir)).toBe(ExitCode.ok);
    expect(b.captured.out[0]).toBe(a.captured.out[0]);
  });

  test("the L2 fold reports honestly without the CLI (structural input)", async () => {
    const dir = await freshDir("fold");
    const report = await measureCenter({
      root: dir,
      journalDir: join(dir, ".vaerion", "journal"),
      blobsDir: join(dir, ".vaerion", "blobs"),
      auditPath: join(dir, ".vaerion", "audit.log"),
      refusalsPath: join(dir, ".vaerion", "refusals.log"),
      repoRoot: null,
    });
    expect(report.workspace.runs).toBe(0);
    expect(report.operations.journals_verified).toBe(true);
    expect(report.release.measured).toBe(false);
  });

  test("is side-effect-free: the directory hash is identical before and after", async () => {
    const dir = await freshDir("readonly");
    await writeFile(join(dir, "keep.txt"), "unchanged\n", "utf8");
    const before = await snapshotDir(dir);
    const { io } = captureIo();
    expect(await runCode(["center"], io, dir)).toBe(ExitCode.ok);
    const after = await snapshotDir(dir);
    expect(after.size).toBe(before.size);
    for (const [k, v] of before) expect(after.get(k)).toBe(v);
  });

  test("usage law: any positional argument is refused (E1600, exit 2)", async () => {
    const dir = await freshDir("usage");
    const { captured, io } = captureIo();
    const code = await runCode(["center", "extra"], io, dir);
    expect(code).toBe(ExitCode.usage);
    expect(captured.lines.join("\n")).toContain("E1600");
  });

  test("help purity: `vae center --help` teaches and never executes", async () => {
    const dir = await freshDir("help");
    const { captured, io } = captureIo();
    const code = await runCode(["center", "--help"], io, dir);
    expect(code).toBe(ExitCode.ok);
    const text = captured.lines.join("\n");
    expect(text).toContain("operator cockpit");
    expect(text).not.toContain("command: center");
  });

  test("rich face (TTY): operations, integrity, and release panels render", async () => {
    const dir = await freshDir("rich");
    const prevUi = process.env.VAE_UI;
    process.env.VAE_UI = "rich";
    try {
      const { captured, io } = captureIo(true, 100);
      const code = await runCode(["center"], io, dir);
      expect(code).toBe(ExitCode.ok);
      const text = captured.lines.join("\n");
      expect(text).toContain("Command Center — operations");
      expect(text).toContain("Integrity");
      expect(text).toContain("Release digest");
    } finally {
      if (prevUi === undefined) delete process.env.VAE_UI;
      else process.env.VAE_UI = prevUi;
    }
  });

  test("security canary: planted secret-shaped material reaches no output face", async () => {
    const CANARY = "sk-canary-NEVER-LEAK-9f3a";
    const dir = await freshDir("canary");
    await writeFile(join(dir, "canary.txt"), CANARY + "\n", "utf8");
    for (const argv of [["center"], ["center", "--json"], ["center", "--help"]]) {
      const { captured, io } = captureIo();
      const code = await runCode(argv as string[], io, dir);
      expect(code).toBe(ExitCode.ok);
      expect(captured.lines.join("\n")).not.toContain(CANARY);
    }
  });
});
