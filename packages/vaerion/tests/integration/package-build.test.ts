/**
 * Vaerion packaging — build/verify end-to-end (MS-6, ADR-0016).
 *
 * Law under test: the build is a deterministic fold (identical inputs →
 * byte-identical bundles — proven by rebuild comparison); dry-run purity;
 * the journaled run closes with a receipt; verify is the pure check
 * (digests recomputed, pins compared, content NEVER executed); the tamper
 * matrix refuses honestly (payload flip → E2201, stale lock → E2205, pin
 * swap → E2202, bad magic → E2203, missing input → E2204, artifact pin
 * mismatch at build → E2100); vaerion.lock is regenerated and doctor
 * cross-checks it.
 *
 * Every test drives the real `runCli` entry over a real temp workspace.
 * Hermetic: no network, no wall-clock in the fold.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { runCli } from "../../src/cli/vae.ts";
import { ExitCode } from "../../src/cli/io.ts";
import { loadConfig } from "../../src/config/config.ts";
import { readJournal } from "../../src/journal/reader.ts";
import { verifyJournal } from "../../src/journal/verify.ts";
import { listJournals } from "../../src/journal/ls.ts";
import type { EvtRecord } from "../../src/journal/records.ts";
import { decodeBundle } from "../../src/package/format.ts";
import { readLock } from "../../src/package/lock.ts";

const workspaces: string[] = [];
afterAll(async () => {
  for (const ws of workspaces) await rm(ws, { recursive: true, force: true }).catch(() => undefined);
});

const SHEBANG = `#!${process.execPath}`;

const EXT_SRC = `${SHEBANG}
const input = JSON.parse(require("fs").readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify({ v: 1, result: { echo: input.args } }) + "\\n");
`;

async function makeWorkspace(name: string, extraConfig = ""): Promise<string> {
  const ws = await mkdtemp(join(tmpdir(), `vxn-${name}-`));
  workspaces.push(ws);
  await mkdir(join(ws, "docs"), { recursive: true });
  await mkdir(join(ws, "prompts"), { recursive: true });
  await mkdir(join(ws, "workflows"), { recursive: true });
  await writeFile(join(ws, "docs", "b.md"), "# B\nsecond doc\n");
  await writeFile(join(ws, "docs", "a.md"), "# A\nfirst doc\n");
  await writeFile(join(ws, "prompts", "p.md"), "PROMPT: answer with citations\n");
  await writeFile(join(ws, "workflows", "dag.json"), JSON.stringify({ id: "demo", nodes: [] }, null, 2) + "\n");
  await writeFile(
    join(ws, "vaerion.yaml"),
    `schemaVersion: "0.1"
project:
  name: ${name}
  description: "MS-6 packaging integration"
package:
  include:
    - docs
    - prompts/p.md
    - workflows/dag.json
${extraConfig}telemetry:
  enabled: false
`,
  );
  return ws;
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

async function outLines(ws: string, args: string[]): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = [];
  const { code } = await runCli(args, { out: (l) => lines.push(l), err: (l) => lines.push(l) }, ws);
  return { code, lines };
}

function jsonLine(lines: string[]): Record<string, unknown> {
  const raw = lines.filter((l) => l.trim().startsWith("{")).join("\n");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("package build — the deterministic fold", () => {
  test("build is byte-identical across rebuilds and journaled with receipts (P2)", async () => {
    const ws = await makeWorkspace("determinism");
    const r1 = await outLines(ws, ["package", "build", "--json"]);
    expect(r1.code).toBe(ExitCode.ok);
    const j1 = jsonLine(r1.lines);
    expect(j1.command).toBe("package");
    expect(j1.kind).toBe("build");
    expect(j1.entry_count).toBe(4);
    expect(j1.pins).toEqual([]);
    const bundlePath = join(ws, ".vaerion", "package", "determinism.vxn");
    const bytes1 = await readFile(bundlePath);
    const lock1 = await readFile(join(ws, "vaerion.lock"), "utf8");

    const r2 = await outLines(ws, ["package", "build", "--json"]);
    expect(r2.code).toBe(ExitCode.ok);
    const j2 = jsonLine(r2.lines);
    const bytes2 = await readFile(bundlePath);
    expect(Buffer.compare(bytes1, bytes2)).toBe(0);
    expect(j2.bundle_blake3).toBe(j1.bundle_blake3);
    const lock2 = await readFile(join(ws, "vaerion.lock"), "utf8");
    expect(lock1).toBe(lock2); // the lock fold is deterministic too

    // Both builds are journaled runs that verify and close with receipts.
    const runs = await listJournals(join(ws, ".vaerion", "journal"));
    expect(runs.length).toBe(2);
    for (const run of runs) {
      const report = await verifyJournal(join(ws, ".vaerion", "journal", `${run.run_id}.ndjson`));
      expect(report.ok).toBe(true);
      const read = await readJournal(join(ws, ".vaerion", "journal", `${run.run_id}.ndjson`));
      const built = read.records.filter((r): r is EvtRecord => r.k === "evt" && r.env.type === "package.built");
      expect(built.length).toBe(1);
      expect(((built[0]!.env.payload as Record<string, unknown>).bundle_blake3 as string)).toBe(j1.bundle_blake3 as string);
      const closed = read.records.some((r): r is EvtRecord => r.k === "evt" && r.env.type === "run.closed");
      expect(closed).toBe(true);
    }
    expect(j1.receipt).not.toBe(null);
  });

  test("manifest carries the config fingerprint and canonical entry order", async () => {
    const ws = await makeWorkspace("manifest");
    await outLines(ws, ["package", "build", "--json"]);
    const bytes = await readFile(join(ws, ".vaerion", "package", "manifest.vxn"));
    const decoded = decodeBundle(new Uint8Array(bytes));
    expect(decoded.manifest.entries.map((e) => e.path)).toEqual(["docs/a.md", "docs/b.md", "prompts/p.md", "workflows/dag.json"]);
    const { fingerprint } = await loadConfig(join(ws, "vaerion.yaml"));
    expect(decoded.manifest.configFingerprint).toBe(fingerprint);
    expect(decoded.manifest.project.name).toBe("manifest");
    // The lock seals exactly this bundle.
    const lock = await readLock(ws);
    expect(lock).not.toBe(null);
    expect(lock!.bundle.entries).toBe(4);
  });

  test("--dry-run writes nothing (pure plan)", async () => {
    const ws = await makeWorkspace("dryrun");
    const r = await outLines(ws, ["package", "build", "--dry-run", "--json"]);
    expect(r.code).toBe(ExitCode.ok);
    const j = jsonLine(r.lines);
    expect(j.dry_run).toBe(true);
    expect(j.side_effects).toBe(0);
    expect(j.entry_count).toBe(4);
    const bundleExists = await stat(join(ws, ".vaerion", "package", "dryrun.vxn")).then(() => true, () => false);
    const lockExists = await stat(join(ws, "vaerion.lock")).then(() => true, () => false);
    expect(bundleExists).toBe(false);
    expect(lockExists).toBe(false);
    const runs = await listJournals(join(ws, ".vaerion", "journal")).catch(() => []);
    expect(runs.length).toBe(0);
  });

  test("missing declared input refuses at usage level (E2204, exit 2)", async () => {
    const ws = await makeWorkspace("missing");
    await writeFile(join(ws, "vaerion.yaml"), `schemaVersion: "0.1"
project:
  name: missing
package:
  include:
    - docs
    - not-there.txt
telemetry:
  enabled: false
`);
    const r = await outLines(ws, ["package", "build"]);
    expect(r.code).toBe(ExitCode.usage);
    expect(r.lines.join("\n")).toContain("E2204");
  });

  test("a mismatched extension artifact is NEVER bundled (E2100)", async () => {
    const ws = await makeWorkspace("pinrefuse");
    const artifact = join(ws, "extensions", "helper.sh");
    await mkdir(join(ws, "extensions"), { recursive: true });
    await writeFile(artifact, EXT_SRC, { mode: 0o755 });
    await chmod(artifact, 0o755);
    await writeFile(
      join(ws, "vaerion.yaml"),
      `schemaVersion: "0.1"
project:
  name: pinrefuse
package:
  include:
    - docs
extensions:
  - name: helper
    artifact: extensions/helper.sh
    digest: sha256:${"0".repeat(64)}
telemetry:
  enabled: false
`,
    );
    const r = await outLines(ws, ["package", "build"]);
    expect(r.code).toBe(ExitCode.internal);
    expect(r.lines.join("\n")).toContain("E2100");
  });

  test("extension artifacts are pin-verified and auto-carried with manifest pins", async () => {
    const ws = await makeWorkspace("pincarry");
    const artifact = join(ws, "extensions", "helper.sh");
    await mkdir(join(ws, "extensions"), { recursive: true });
    await writeFile(artifact, EXT_SRC, { mode: 0o755 });
    await chmod(artifact, 0o755);
    const digest = sha256Hex(EXT_SRC);
    await writeFile(
      join(ws, "vaerion.yaml"),
      `schemaVersion: "0.1"
project:
  name: pincarry
package:
  include:
    - docs
extensions:
  - name: helper
    artifact: extensions/helper.sh
    digest: sha256:${digest}
telemetry:
  enabled: false
`,
    );
    const r = await outLines(ws, ["package", "build", "--json"]);
    expect(r.code).toBe(ExitCode.ok);
    const j = jsonLine(r.lines);
    expect(j.entry_count).toBe(3); // docs/a.md + docs/b.md (include) + extensions/helper.sh (auto-carried)
    expect(j.pins).toEqual([{ name: "helper", digest: `sha256:${digest}` }]);
    const bytes = await readFile(join(ws, ".vaerion", "package", "pincarry.vxn"));
    const decoded = decodeBundle(new Uint8Array(bytes));
    expect(decoded.manifest.pins).toEqual([{ name: "helper", digest: `sha256:${digest}` }]);
    expect(decoded.manifest.entries.some((e) => e.path === "extensions/helper.sh")).toBe(true);
    // Verify is green against config + lock.
    const v = await outLines(ws, ["package", "verify", ".vaerion/package/pincarry.vxn", "--json"]);
    expect(v.code).toBe(ExitCode.ok);
    expect(jsonLine(v.lines).ok).toBe(true);
    expect(jsonLine(v.lines).pins_checked).toBe(1);
  });
});

describe("package verify — the pure check and the tamper matrix", () => {
  test("verify is journaled and green on a fresh bundle", async () => {
    const ws = await makeWorkspace("verifyok");
    await outLines(ws, ["package", "build"]);
    const v = await outLines(ws, ["package", "verify", ".vaerion/package/verifyok.vxn", "--json"]);
    expect(v.code).toBe(ExitCode.ok);
    const j = jsonLine(v.lines);
    expect(j.ok).toBe(true);
    expect(j.entries_verified).toBe(4);
    expect(j.run_id).not.toBe(undefined);
    const runs = await listJournals(join(ws, ".vaerion", "journal"));
    expect(runs.length).toBe(2); // build + verify
  });

  test("verify --dry-run journals nothing", async () => {
    const ws = await makeWorkspace("verifydry");
    await outLines(ws, ["package", "build"]);
    const before = (await listJournals(join(ws, ".vaerion", "journal"))).length;
    const v = await outLines(ws, ["package", "verify", ".vaerion/package/verifydry.vxn", "--dry-run", "--json"]);
    expect(v.code).toBe(ExitCode.ok);
    const after = (await listJournals(join(ws, ".vaerion", "journal"))).length;
    expect(after).toBe(before);
  });

  test("payload flip → E2201, exit 5, honest findings (E2206)", async () => {
    const ws = await makeWorkspace("tamper-payload");
    await outLines(ws, ["package", "build"]);
    const path = join(ws, ".vaerion", "package", "tamper-payload.vxn");
    const bytes = Buffer.from(await readFile(path));
    const last = bytes.length - 1;
    bytes[last] = (bytes[last] as number) ^ 0xff;
    const tampered = join(ws, "tampered.vxn");
    await writeFile(tampered, bytes);
    const v = await outLines(ws, ["package", "verify", "tampered.vxn", "--dry-run", "--json"]);
    expect(v.code).toBe(ExitCode.partial);
    const j = jsonLine(v.lines);
    expect(j.ok).toBe(false);
    expect(j.code).toBe("E2206");
    const findings = j.findings as Array<{ code: string; check: string }>;
    expect(findings.some((f) => f.code === "E2201")).toBe(true);
  });

  test("stale lock → E2205 (the lock seals the NEW bundle, the old one refuses)", async () => {
    const ws = await makeWorkspace("stale-lock");
    await outLines(ws, ["package", "build"]);
    const oldBytes = await readFile(join(ws, ".vaerion", "package", "stale-lock.vxn"));
    await writeFile(join(ws, "docs", "a.md"), "# A\nCHANGED — the fold moved\n");
    await outLines(ws, ["package", "build"]); // rebuild → lock resealed
    await writeFile(join(ws, "old.vxn"), oldBytes);
    const v = await outLines(ws, ["package", "verify", "old.vxn", "--dry-run", "--json"]);
    expect(v.code).toBe(ExitCode.partial);
    const findings = (jsonLine(v.lines).findings as Array<{ code: string }>).map((f) => f.code);
    expect(findings).toContain("E2205");
  });

  test("manifest pin swap → E2202 (digest-swap defense)", async () => {
    const ws = await makeWorkspace("pin-swap");
    const artifact = join(ws, "extensions", "helper.sh");
    await mkdir(join(ws, "extensions"), { recursive: true });
    await writeFile(artifact, EXT_SRC, { mode: 0o755 });
    await chmod(artifact, 0o755);
    const digest = sha256Hex(EXT_SRC);
    await writeFile(
      join(ws, "vaerion.yaml"),
      `schemaVersion: "0.1"
project:
  name: pin-swap
package:
  include:
    - docs
extensions:
  - name: helper
    artifact: extensions/helper.sh
    digest: sha256:${digest}
telemetry:
  enabled: false
`,
    );
    await outLines(ws, ["package", "build"]);
    // Craft a bundle whose manifest pins a DIFFERENT digest for the same name.
    const bytes = new Uint8Array(await readFile(join(ws, ".vaerion", "package", "pin-swap.vxn")));
    const decoded = decodeBundle(bytes);
    const forgedManifest = {
      ...decoded.manifest,
      pins: [{ name: "helper", digest: `sha256:${"f".repeat(64)}` }],
    };
    const { encodeBundle } = await import("../../src/package/format.ts");
    const forged = encodeBundle(forgedManifest, decoded.payload);
    await writeFile(join(ws, "forged.vxn"), forged);
    const v = await outLines(ws, ["package", "verify", "forged.vxn", "--dry-run", "--json"]);
    expect(v.code).toBe(ExitCode.partial);
    const findings = jsonLine(v.lines).findings as Array<{ code: string; check: string }>;
    expect(findings.some((f) => f.code === "E2202" && f.check === "pin-match:helper")).toBe(true);
  });

  test("bad magic → E2203, exit 5", async () => {
    const ws = await makeWorkspace("badmagic");
    await writeFile(join(ws, "garbage.vxn"), "definitely not a bundle");
    const v = await outLines(ws, ["package", "verify", "garbage.vxn", "--dry-run"]);
    expect(v.code).toBe(ExitCode.partial);
    expect(v.lines.join("\n")).toContain("E2203");
  });

  test("format-only verification works without vaerion.yaml (no journal)", async () => {
    const ws = await makeWorkspace("adhoc-verify");
    await outLines(ws, ["package", "build"]);
    const bare = await mkdtemp(join(tmpdir(), "vxn-bare-"));
    workspaces.push(bare);
    await writeFile(join(bare, "bundle.vxn"), await readFile(join(ws, ".vaerion", "package", "adhoc-verify.vxn")));
    const v = await outLines(bare, ["package", "verify", "bundle.vxn", "--json"]);
    expect(v.code).toBe(ExitCode.ok);
    const j = jsonLine(v.lines);
    expect(j.ok).toBe(true);
    expect(j.run_id).toBe(undefined); // adhoc workspace journals nothing
  });
});

describe("package — doctor lock cross-check", () => {
  test("doctor reports a green lock after build and refuses a tampered bundle", async () => {
    const ws = await makeWorkspace("doctor-lock");
    await outLines(ws, ["package", "build"]);
    const d1 = await outLines(ws, ["doctor", "--json"]);
    expect(d1.code).toBe(ExitCode.ok);
    const checks1 = JSON.parse(d1.lines.filter((l) => l.trim().startsWith("{")).join("\n")).checks as Array<{ check: string; ok: boolean }>;
    const lockCheck1 = checks1.find((c) => c.check === "package-lock");
    expect(lockCheck1?.ok).toBe(true);

    // Tamper with the on-disk bundle → the seal must notice (E2205).
    const path = join(ws, ".vaerion", "package", "doctor-lock.vxn");
    const bytes = Buffer.from(await readFile(path));
    const lastByte = bytes.length - 1;
    bytes[lastByte] = (bytes[lastByte] as number) ^ 0x01;
    await writeFile(path, bytes);
    const d2 = await outLines(ws, ["doctor", "--json"]);
    expect(d2.code).toBe(ExitCode.partial);
    const checks2 = JSON.parse(d2.lines.filter((l) => l.trim().startsWith("{")).join("\n")).checks as Array<{ check: string; ok: boolean; code?: string }>;
    const lockCheck2 = checks2.find((c) => c.check === "package-lock");
    expect(lockCheck2?.ok).toBe(false);
    expect(lockCheck2?.code).toBe("E2205");
  });
});

describe("package — CLI teach law", () => {
  test("--help teaches package and unknown subcommands refuse at usage level", async () => {
    const ws = await makeWorkspace("help");
    const h = await outLines(ws, ["package", "--help"]);
    expect(h.code).toBe(ExitCode.ok);
    expect(h.lines.join("\n")).toContain("vae package build");
    expect(h.lines.join("\n")).toContain("NEVER executes package content");
    const bad = await outLines(ws, ["package", "frobnicate"]);
    expect(bad.code).toBe(ExitCode.usage);
    const none = await outLines(ws, ["package"]);
    expect(none.code).toBe(ExitCode.usage);
  });

  test("build without a package block refuses at usage level with the teaching fix", async () => {
    const ws = await makeWorkspace("nopackage");
    await writeFile(
      join(ws, "vaerion.yaml"),
      `schemaVersion: "0.1"
project:
  name: nopackage
telemetry:
  enabled: false
`,
    );
    const r = await outLines(ws, ["package", "build"]);
    expect(r.code).toBe(ExitCode.usage);
    expect(r.lines.join("\n")).toContain("package block");
    expect(r.lines.join("\n")).toContain("package.include");
  });
});

