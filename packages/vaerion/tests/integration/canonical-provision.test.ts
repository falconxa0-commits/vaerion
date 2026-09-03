/**
 * The provisioning law (MASTER DIRECTIVE Phase 17; constitution v1.7 A7, D-Q).
 *
 * Contract matrix:
 *   1. The hook text is VERSIONED LAW — stable bytes carrying the three D-Q
 *      properties (fast-forward-only main, main deletion refused, v* tag
 *      immutability) with a fail-closed exit.
 *   2. Provisioning is idempotent and refs are NEVER touched: re-provisioning
 *      re-asserts the hook bytes, byte-identical, history sacred.
 *   3. THE PROBES ARE REAL EXECUTIONS against a real seeded bare store: every
 *      adversarial push is REFUSED BY THE HOOK (non-ff under --force, main
 *      deletion, tag overwrite under --force, tag deletion), a legal
 *      fast-forward push is ACCEPTED (the law never over-refuses), and the
 *      post-probe ref state is byte-identical.
 *   4. Fail-closed probe preconditions: an empty store and a hookless store
 *      are errors — never probed, never mutated (a hookless store's forced
 *      probes WOULD mutate it, so the probe refuses to run).
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANONICAL_STORE_PATH, PRE_RECEIVE_HOOK, provisionPlan } from "../../../../packages/vaerion/src/repo/canonical.ts";
import { probeStore, provisionStore, renderProbeReport } from "../../../../tools/canonical-provision.ts";

function sh(cwd: string, argv: string[]): { ok: boolean; stdout: string; stderr: string } {
  const p = Bun.spawnSync(argv, {
    cwd,
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
  });
  return { ok: p.exitCode === 0, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

/** Provision a scratch store, then seed it THROUGH the law: a fast-forward
 *  main push and a new v* tag push must both be ACCEPTED (the positive
 *  control — the protection law must never over-refuse). */
function seedStore(root: string, name: string): { store: string; work: string } {
  const store = join(root, `${name}.git`);
  const work = join(root, `${name}-seed`);
  provisionStore(store);
  expect(sh(root, ["git", "init", "--quiet", "--initial-branch=main", work]).ok).toBe(true);
  expect(sh(work, ["git", "config", "user.email", "seed@vaerion.dev"]).ok).toBe(true);
  expect(sh(work, ["git", "config", "user.name", "Seed"]).ok).toBe(true);
  expect(sh(work, ["git", "commit", "--allow-empty", "--quiet", "-m", "seed c1"]).ok).toBe(true);
  expect(sh(work, ["git", "commit", "--allow-empty", "--quiet", "-m", "seed c2"]).ok).toBe(true);
  expect(sh(work, ["git", "tag", "v0.0.0-probe"]).ok).toBe(true);
  const mainPush = sh(work, ["git", "push", "--quiet", store, "main"]);
  expect(mainPush.ok).toBe(true); // the positive control: a legal ff push passes the hook
  const tagPush = sh(work, ["git", "push", "--quiet", store, "v0.0.0-probe"]);
  expect(tagPush.ok).toBe(true); // a NEW v* tag is legal (immutability forbids overwrites, not firsts)
  return { store, work };
}

describe("the D-Q hook as versioned law text (Phase 17)", () => {
  test("the hook bytes carry the three protection properties and fail closed", () => {
    expect(PRE_RECEIVE_HOOK.startsWith("#!/bin/sh")).toBe(true);
    expect(PRE_RECEIVE_HOOK).toContain("fast-forward only");
    expect(PRE_RECEIVE_HOOK).toContain("main deletion is forbidden");
    expect(PRE_RECEIVE_HOOK).toContain("v* tags are immutable");
    expect(PRE_RECEIVE_HOOK).toContain("git merge-base --is-ancestor");
    expect(PRE_RECEIVE_HOOK.trimEnd().endsWith("exit $status")).toBe(true); // fail-closed exit
    // The law text is generated, never hand-edited at the store.
    expect(PRE_RECEIVE_HOOK).toContain("generated from packages/vaerion/src/repo/canonical.ts");
  });

  test("provisioning is idempotent and never touches refs", () => {
    const root = mkdtempSync(join(tmpdir(), "vaerion-dq-provision-"));
    try {
      const { store, work } = seedStore(root, "idem");
      const before = sh(store, ["git", "ls-remote", "."]).stdout;
      const { hookPath, preExisting } = provisionStore(store);
      expect(preExisting).toBe(true);
      const after = sh(store, ["git", "ls-remote", "."]).stdout;
      expect(after).toBe(before); // refs untouched
      expect(existsSync(hookPath)).toBe(true);
      // Byte-identical law: the installed hook IS the engine's law text.
      expect(readFileSync(hookPath, "utf8")).toBe(PRE_RECEIVE_HOOK);
      expect(sh(work, ["git", "rev-parse", "--verify", "--quiet", "HEAD"]).ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("the adversarial probes are real executions (D-Q: probed after every provisioning)", () => {
  test("every forbidden push is REFUSED BY THE HOOK; the legal push is accepted; state unchanged", () => {
    const root = mkdtempSync(join(tmpdir(), "vaerion-dq-probe-"));
    try {
      const { store } = seedStore(root, "probe");
      const report = probeStore(store, root);
      expect(report.ok).toBe(true);
      expect(report.honesty).toBe("VERIFIED");
      const names = report.probes.map((p) => p.probe);
      expect(names).toEqual([
        "non-fast-forward main",
        "main deletion",
        "tag overwrite (v0.0.0-probe)",
        "tag deletion (v0.0.0-probe)",
      ]);
      for (const p of report.probes) {
        expect(p.refused).toBe(true);
        expect(p.detail).toContain("D-Q REFUSED");
      }
      expect(report.postStateUnchanged).toBe(true);
      expect(renderProbeReport(report)).toContain("PROTECTION LAW VERIFIED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an empty store is never probed (fail-closed precondition)", () => {
    const root = mkdtempSync(join(tmpdir(), "vaerion-dq-empty-"));
    try {
      const store = join(root, "empty.git");
      provisionStore(store);
      expect(() => probeStore(store, root)).toThrow(/no main ref/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a hookless store refuses to be probed (the forced probes would mutate it)", () => {
    const root = mkdtempSync(join(tmpdir(), "vaerion-dq-hookless-"));
    try {
      const { store } = seedStore(root, "hookless");
      rmSync(join(store, "hooks", "pre-receive"));
      expect(() => probeStore(store, root)).toThrow(/NOT provisioned/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

test("the canonical store path of record is the environment's law (D-S: presence measured at runtime)", () => {
  expect(CANONICAL_STORE_PATH).toBe("/home/z/vaerion-canonical.git");
  const plan = provisionPlan(CANONICAL_STORE_PATH);
  expect(plan.hookPath).toBe("/home/z/vaerion-canonical.git/hooks/pre-receive");
  expect(plan.steps.length).toBe(3);
});
