/**
 * The cross-version upgrade leg (ASCENSION XXVI+ B-4) — the REAL vN → vN+1
 * path, really executed on this host:
 *
 *   install vN (the TAGGED v0.1.12-rc1 source, through the real installer,
 *   into a sandboxed prefix) → create a workspace and journal WITH vN →
 *   install vN+1 (this tree) over the SAME prefix → the shim serves vN+1 →
 *   the vN version tree is retained → the vN-written journal verifies under
 *   vN+1.
 *
 * Honest scope: this leg exercises the SOURCE-install upgrade path from the
 * tagged git source of record. The signed-artifact download path was
 * measured anonymously at ASCENSION XXV (Task 4, single version); a
 * same-host leg over the RELEASED artifacts of a future train remains a
 * release-train rehearsal step (tools/rehearsal.ts) — it needs that train
 * to exist first, and this test does not pretend otherwise.
 *
 * This is the host-execution companion to the structural XX-D8 pin (a
 * reinstall REFRESHES the version tree): here the installer is executed,
 * twice, with two different engine versions.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");
const PREV_TAG = "v0.1.12-rc1";
const PREV_VERSION = "0.1.12-rc1";
/** The engine version of record at THIS tree (kept literal: the test fails
 *  loudly if the register and the engine ever disagree about it). */
const CUR_VERSION = "0.1.13-rc1";

let home: string | null = null;
afterAll(() => {
  if (home) rmSync(home, { recursive: true, force: true });
});

interface ShResult {
  status: number;
  out: string;
}

function sh(cmd: string[], opts: { cwd?: string; timeoutMs?: number } = {}): ShResult {
  const proc = spawnSync(cmd[0]!, cmd.slice(1), {
    cwd: opts.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    timeout: opts.timeoutMs ?? 300_000,
  });
  return { status: proc.status ?? -1, out: ((proc.stdout ?? "") + (proc.stderr ?? "")).trim() };
}

describe("the cross-version upgrade leg — vN → vN+1 on one host prefix", () => {
  test("the tagged previous engine installs, a vN workspace journals, the upgrade to vN+1 preserves and serves it", () => {
    // 0. Preconditions: this is a git checkout with full history (CI clones
    //    with fetch-depth: 0 — the repository is the evidence).
    expect(sh(["git", "rev-parse", "--verify", PREV_TAG]).status).toBe(0);

    home = mkdtempSync(join(tmpdir(), "vaerion-upgrade-"));
    const prefix = join(home, "prefix");
    const ws = join(home, "upgradews");
    mkdirSync(ws, { recursive: true });
    const vae = (args: string[], cwd?: string) => sh([join(prefix, "bin", "vae"), ...args], { cwd });

    // 1. The two REAL sources of record: the tagged previous train and this tree.
    // Release-tarball layout: a top-level vaerion-<version>/ directory (what
    // GitHub's source archives look like — the installer's layout contract).
    const tgzA = join(home, `vaerion-${PREV_VERSION}-source.tar.gz`);
    const tgzB = join(home, `vaerion-${CUR_VERSION}-source.tar.gz`);
    expect(sh(["git", "archive", "--format=tar.gz", `--prefix=vaerion-${PREV_VERSION}/`, `-o${tgzA}`, PREV_TAG]).status).toBe(0);
    expect(sh(["git", "archive", "--format=tar.gz", `--prefix=vaerion-${CUR_VERSION}/`, `-o${tgzB}`, "HEAD"]).status).toBe(0);

    // 2. Install vN through the REAL installer (sandboxed prefix, no rc writes).
    const installA = sh(["sh", join(ROOT, "packaging", "install.sh"), "--method", "source", "--tarball", tgzA, "--prefix", prefix, "--no-path"]);
    expect(installA.status).toBe(0);
    expect(installA.out).toContain(`installed ${PREV_VERSION}`);

    // 3. The shim serves vN.
    const vA = vae(["--version"]);
    expect(vA.status).toBe(0);
    expect(vA.out).toContain(PREV_VERSION);

    // 4. A workspace is created and journaled BY vN (deterministic local demo).
    const initA = vae(["init", "--name", "upgradews", "--template", "demo"], ws);
    expect(initA.status).toBe(0);
    const demoA = vae(["run", "demo"], ws);
    expect(demoA.status).toBe(0);
    const journalDir = join(ws, ".vaerion", "journal");
    const journals = readdirSync(journalDir).filter((n) => n.endsWith(".ndjson"));
    expect(journals.length).toBe(1);
    const runId = journals[0]!.replace(/\.ndjson$/, "");

    // 5. THE UPGRADE: vN+1 over the SAME prefix, through the REAL installer.
    const installB = sh(["sh", join(ROOT, "packaging", "install.sh"), "--method", "source", "--tarball", tgzB, "--prefix", prefix, "--no-path"]);
    expect(installB.status).toBe(0);
    expect(installB.out).toContain(`installed ${CUR_VERSION}`);

    // The vN tree is RETAINED (versions are never rewritten — the immutable
    // law) and `current` now serves vN+1.
    expect(readdirSync(join(prefix, "lib", "vaerion"))).toContain(PREV_VERSION);
    const vB = vae(["--version"]);
    expect(vB.status).toBe(0);
    expect(vB.out).toContain(CUR_VERSION);
    expect(vB.out).not.toContain(PREV_VERSION);

    // 6. The vN-written journal verifies under vN+1 — the workspace upgrade
    //    contract: the journal is the truth across the version boundary.
    const verifyB = vae(["journal", "verify", runId, "--json"], ws);
    expect(verifyB.status).toBe(0);
    const envelope = JSON.parse(verifyB.out.replace(/^[^{]*/, "")) as { report: { ok: boolean; records: number; events: number; torn: boolean } };
    expect(envelope.report.ok).toBe(true);
    expect(envelope.report.torn).toBe(false);
    expect(envelope.report.events).toBeGreaterThan(0);
  });
});
