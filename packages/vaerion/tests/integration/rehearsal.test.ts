/**
 * The release-train rehearsal contract (ASCENSION XVIII Phase 9; v1.4 A4).
 *
 * The suite pins the RUNNER'S CONTRACT — the deterministic plan, the
 * fail-closed departure condition, and the deterministic report shape —
 * with honest failure paths. The FULL train (npm pack → install → exercise
 * → uninstall) is a release-time action executed at the phase boundary; its
 * measured report is the committed artifact (docs/ga/RELEASE-TRAIN-REHEARSAL.md).
 */

import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import {
  REHEARSAL_STEPS,
  buildReport,
  checkVerificationRecord,
  engineVersionOfRecord,
  type RehearsalOutcome,
  type RehearsalStep,
} from "../../../../tools/rehearsal.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");

function step(over: Partial<RehearsalStep> & { step: RehearsalStep["step"] }): RehearsalStep {
  return { ok: true, durationMs: 12, evidence: "measured", ...over };
}

describe("the plan of record", () => {
  test("the nine steps, in the fixed order — the train has exactly one route", () => {
    expect([...REHEARSAL_STEPS]).toEqual([
      "verification-record",
      "release-pack",
      "trust-chain",
      "npm-pack",
      "npm-install",
      "installed-version",
      "installed-init",
      "installed-center",
      "npm-uninstall",
    ]);
  });

  test("the engine version of record is the lockstep target", () => {
    expect(engineVersionOfRecord()).toMatch(/^\d+\.\d+\.\d+(-rc\d+)?$/);
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "packages", "vaerion", "package.json"), "utf8")) as { version: string };
    expect(engineVersionOfRecord()).toBe(pkg.version);
  });
});

describe("the departure condition — fail-closed (D-R)", () => {
  test("the REAL verification record departs green (this tree is measured)", () => {
    const r = checkVerificationRecord();
    if (process.env.VAE_VERIFY_RUNNING === "1") {
      // Under the live verify run, the on-disk record is the PREVIOUS run's —
      // the live gates executing right now are the truth of this run. The
      // REAL fail-closed departure stays in tools/rehearsal.ts at train time;
      // standalone/CI runs (no marker) pin the committed record green.
      expect(typeof r.evidence).toBe("string");
      return;
    }
    if (!r.ok) throw new Error(`the rehearsal must depart from a green record; got: ${r.evidence}`);
    expect(r.ok).toBe(true);
    expect(r.evidence).toContain("GREEN");
  });

  test("a missing record stops the train honestly", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vae-rehearse-test-"));
    try {
      const r = checkVerificationRecord(join(dir, "absent.json"));
      expect(r.ok).toBe(false);
      expect(r.evidence).toContain("missing");
      expect(r.evidence).toContain("verify.ts");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("a RED record stops the train and names the red gate", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vae-rehearse-test-"));
    try {
      const path = join(dir, ".vaerion-verification.json");
      await writeFile(path, JSON.stringify({ ok: false, gates: [{ gate: "tests", ok: false }, { gate: "repo-lint", ok: true }] }), "utf8");
      const r = checkVerificationRecord(path);
      expect(r.ok).toBe(false);
      expect(r.evidence).toContain("tests");
      expect(r.evidence).toContain("RED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("an unreadable record stops the train (never guesses)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vae-rehearse-test-"));
    try {
      const path = join(dir, ".vaerion-verification.json");
      await writeFile(path, "{not json", "utf8");
      const r = checkVerificationRecord(path);
      expect(r.ok).toBe(false);
      expect(r.evidence).toContain("unreadable");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the report of record", () => {
  const outcome: RehearsalOutcome = {
    ref: "v9.9.9",
    commit: "abcdef1234567890abcdef1234567890abcdef12",
    engineVersion: "9.9.9",
    passed: true,
    steps: REHEARSAL_STEPS.map((s) => step({ step: s, evidence: s === "trust-chain" ? "ALL CHECKS PASSED, exit 0" : "measured" })),
  };

  test("deterministic: the same outcome yields the same report", () => {
    const a = buildReport(outcome, "2026-09-03T00:00:00.000Z");
    const b = buildReport(outcome, "2026-09-03T00:00:00.000Z");
    expect(a).toBe(b);
  });

  test("carries the evidence anchors: ref, commit, version, verdict, every step", () => {
    const report = buildReport(outcome, "2026-09-03T00:00:00.000Z");
    expect(report).toContain("# Vaerion Release-Train Rehearsal — v9.9.9");
    expect(report).toContain("abcdef123456"); // commit sliced to 12 chars in the header
    expect(report).toContain("`9.9.9`");
    expect(report).toContain("**PASSED — the release train is rehearsed end-to-end**");
    for (const s of REHEARSAL_STEPS) expect(report).toContain(`\`${s}\``);
    expect(report).toContain("ALL CHECKS PASSED, exit 0");
    expect(report).toContain("Founder-gated"); // the honest limits are part of the record
  });

  test("a failed step yields a FAILED verdict naming the count", () => {
    const failed: RehearsalOutcome = {
      ...outcome,
      passed: false,
      steps: outcome.steps.map((s) => (s.step === "installed-version" ? { ...s, ok: false, evidence: "installed vae reported 0.0.1; engine version of record 9.9.9" } : s)),
    };
    const report = buildReport(failed, "2026-09-03T00:00:00.000Z");
    expect(report).toContain("**FAILED — 1 step(s) stopped the train**");
    expect(report).toContain("❌ FAIL");
  });

  test("evidence containing pipes cannot break the markdown table", () => {
    const escaped: RehearsalOutcome = {
      ...outcome,
      steps: [step({ step: "release-pack", evidence: "a | b | c" })],
    };
    const report = buildReport(escaped, "2026-09-03T00:00:00.000Z");
    expect(report).toContain("a \\| b \\| c");
  });
});

describe("the single verification authority (D-R)", () => {
  test("the rehearsal departs from the record verify.ts writes — never from its own gate logic", () => {
    const source = readFileSync(join(REPO_ROOT, "tools", "rehearsal.ts"), "utf8");
    expect(source).toContain(".vaerion-verification.json");
    expect(source).toContain('join(ROOT, "tools", "dist-pack.ts")');
    expect(source).toContain('join(ROOT, "tools", "dist-verify.ts")');
    // It orchestrates the sanctioned tools; it does not re-implement them
    // (no crypto imports — the mentions of Ed25519 are report prose only).
    expect(source).not.toMatch(/from\s+"(?:node:)?(?:crypto|tweetnacl|elliptic)"/i);
    expect(source).not.toMatch(/require\("(?:crypto|tweetnacl)"/);
  });
});
