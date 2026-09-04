/**
 * The CI truth law (ASCENSION XIX Phase 11; constitution v1.6 A6).
 *
 * Contract matrix:
 *   1. The workflow shape — triggers, the ONE verification entrypoint (D-R),
 *      the load-bearing hidden-file inclusion on the record upload.
 *   2. failureExcerpt — a red gate NAMES its failure (the root fix for the
 *      last-40-lines window that hid the failing test from CI).
 *   3. The measured record — verify.ts writes the test counts it parsed from
 *      the tests gate (the ONE measured source; hand-copied counters went
 *      stale twice in past campaigns).
 *   4. The generated roadmap report — byte-derived from the measured status
 *      source, never hand-maintained (the stale-report defect class).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { failureExcerpt, GATE_LOG_DIR, gateLogName } from "../../../../tools/gate-output.ts";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");

/* ───────────────────────────  1. the workflow shape  ─────────────────────────── */

describe("the verification workflow — the CI truth law", () => {
  const workflow = readFileSync(join(ROOT, ".github", "workflows", "verify.yml"), "utf8");

  test("triggers on pushes to main, on v* tags, on pull requests, and on dispatch", () => {
    expect(workflow).toContain("branches:");
    expect(workflow).toContain("main");
    expect(workflow).toContain('tags: ["v*"]');
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("workflow_dispatch:");
  });

  test("the verify job re-runs the ONE verification entrypoint (D-R) — no parallel gate logic", () => {
    expect(workflow).toContain("run: bun run tools/verify.ts");
    // The workflow never re-implements gate logic: no direct test/tsc/eslint
    // invocations outside the single verify.ts step.
    const runLines = [...workflow.matchAll(/^\s+run:\s*(.+)$/gm)].map((m) => m[1]!.trim());
    for (const line of runLines) {
      if (line === "bun run tools/verify.ts") continue;
      // The release job's key-provisioning shell is the only other logic, and it
      // runs no gates (dist-pack re-runs the gates internally, fail-closed).
      expect(line).not.toMatch(/\bbun test\b|\btsc\b|\beslint\b/);
    }
  });

  test("the record upload carries the load-bearing hidden-file inclusion", () => {
    // History: upload-artifact@v4 (>= 4.4.0) excludes hidden files by default;
    // `.vaerion-verification.json` is a dotfile — 6/6 historical CI runs failed
    // at exactly this step on otherwise-green trees.
    expect(workflow).toContain("include-hidden-files: true");
    expect(workflow).toContain(".vaerion-verification.json");
    expect(workflow).toContain("if-no-files-found: error");
  });

  test("the release job fails closed on the signing key (disclosed bootstrap path)", () => {
    expect(workflow).toContain("RELEASE_SIGNING_KEY");
    expect(workflow).toContain("dist-pack");
  });
});

/* ─────────────  5. the supply-chain pins (ASCENSION XXVI+)  ───────────── */

describe("workflow action pins + dependabot coverage — the immutable-reference law", () => {
  const readRepo = (p: string) => readFileSync(join(ROOT, p), "utf8");
  const workflows = [".github/workflows/verify.yml", ".github/workflows/release-publish.yml"].map(readRepo);

  test("every external action is pinned to a full commit SHA (immutable reference)", () => {
    for (const wf of workflows) {
      const uses = [...wf.matchAll(/^\s*uses:\s*(.+)$/gm)].map((m) => m[1]!.trim());
      expect(uses.length).toBeGreaterThan(0);
      for (const ref of uses) {
        // `owner/repo@<40-hex>` with an optional ` # tag` annotation —
        // floating major tags (@v4) are the defect class this pins shut.
        expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}( # .+)?$/);
      }
    }
  });

  test("the pinned SHAs are the measured tags of record", () => {
    for (const wf of workflows) {
      if (wf.includes("actions/checkout@")) {
        expect(wf).toContain("actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0");
      }
      if (wf.includes("oven-sh/setup-bun@")) {
        expect(wf).toContain("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0");
      }
      if (wf.includes("actions/upload-artifact@")) {
        expect(wf).toContain("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2");
      }
    }
  });

  test("dependabot covers every declared ecosystem with a weekly schedule and grouping", () => {
    const cfg = readRepo(".github/dependabot.yml");
    const body = cfg.replace(/^#.*$/gm, "").trim(); // comment-stripped body
    expect(body.startsWith("version: 2")).toBe(true);
    for (const eco of ['package-ecosystem: "bun"', 'package-ecosystem: "github-actions"', 'package-ecosystem: "pip"']) {
      expect(cfg).toContain(eco);
    }
    const ecosystems = cfg.split("- package-ecosystem:").length - 1;
    const schedules = [...cfg.matchAll(/interval: "weekly"/g)].length;
    expect(schedules).toBe(ecosystems); // every declared ecosystem has a schedule
    expect(cfg).toContain("update-types:"); // grouping is configured
    expect(cfg).toContain("version-update:semver-major"); // majors are deliberately excluded from bot rides (P11)
    expect(cfg).toContain("/packaging/python"); // the pip directory of record
  });
});

/* ─────────────────────  2. a red gate names its failure  ───────────────────── */

describe("failureExcerpt — the diagnostics law (P7 honest surfaces)", () => {
  const bunFailure = [
    "(pass) suite > first passing test",
    "(pass) suite > second passing test",
    "(fail) D-M′ — help and dispatch never disagree > MAIN_HELP lists every ratified command",
    "error: expect(received).toEqual(expected)",
    "Received: \"vae — Vaerion engine command line (v0.1.10-rc1)\\n...\"",
    "      at <anonymous> (first-run.test.ts:298:23)",
    " 442 pass",
    " 1 fail",
    " 2755 expect() calls",
    "Ran 443 tests across 35 files. [6.69s]",
    " src/receipts/receipt.ts                       |   80.00 |   87.36 | 40-48,130-131",
    " src/repo/ci.ts                                |   90.91 |   90.61 | 109-110,122",
    // ...imagine ~40 more coverage-table lines pushing the failure out of a tail window
    ...Array.from({ length: 40 }, (_, i) => ` src/module-${i}.ts                             |   90.00 |   90.00 |`),
    "-----------------------------------------------|---------|---------|-------------------",
    " 442 pass",
    " 1 fail",
    " 2764 expect() calls",
  ].join("\n");

  test("names the failing test even when 40+ coverage lines would push it out of a tail window", () => {
    const excerpt = failureExcerpt(bunFailure);
    expect(excerpt).toContain("(fail) D-M′ — help and dispatch never disagree > MAIN_HELP lists every ratified command");
    expect(excerpt).toContain("first-run.test.ts:298:23");
    // And the excerpt is NOT merely the tail: the (fail) line sits far above it.
    expect(excerpt.length).toBeGreaterThan(0);
  });

  test("names a perf breach", () => {
    const perf = 'perf-budget: FAILED — 1 breach(es)\n  - journal.append: 452.95ms > budget 400ms\n';
    const excerpt = failureExcerpt(perf);
    expect(excerpt).toContain("journal.append: 452.95ms > budget 400ms");
  });

  test("is deterministic for the same input", () => {
    expect(failureExcerpt(bunFailure)).toBe(failureExcerpt(bunFailure));
  });

  test("an output with no failure marker is honestly labeled, never guessed", () => {
    const excerpt = failureExcerpt("step one ok\nstep two ok\n");
    expect(excerpt).toContain("no explicit failure marker found");
  });

  test("the log name law is deterministic", () => {
    expect(gateLogName("tests")).toBe("tests.log");
    expect(GATE_LOG_DIR).toBe(".vaerion-logs");
  });
});

/* ────────────────────────  3. the measured record  ──────────────────────── */

describe(".vaerion-verification.json — the measured record of the tree", () => {
  const record = JSON.parse(readFileSync(join(ROOT, ".vaerion-verification.json"), "utf8")) as {
    ok: boolean;
    gates: Array<{ gate: string; ok: boolean; durationMs: number }>;
    measured?: { testsPassed: number; testsFailed: number; expectations: number; testFiles: number };
  };
  // Under the live verify run the on-disk record is the PREVIOUS run's — the
  // live gates are the truth of this run. The freshness pins below are the
  // enforcement point for STANDALONE and CI runs (fresh checkout of the
  // committed record), and defer under the live-verify marker.
  const liveVerify = process.env.VAE_VERIFY_RUNNING === "1";

  test("the committed record is GREEN (release blocker #1 holds at every commit)", () => {
    if (liveVerify) return; // the live gates decide this run's record
    expect(record.ok).toBe(true);
    expect(record.gates.length).toBeGreaterThanOrEqual(8);
    expect(record.gates.every((g) => g.ok)).toBe(true);
  });

  test("the record carries the MEASURED test counts (the one measured source)", () => {
    if (liveVerify) return; // this run's verify.ts writes them at the end
    // verify.ts (v1.6 A6) parses the tests-gate summary into the record; a
    // committed record without measured counts predates the CI truth law.
    expect(record.measured).toBeDefined();
    expect(record.measured!.testsFailed).toBe(0);
    expect(record.measured!.testsPassed).toBeGreaterThanOrEqual(400);
    expect(record.measured!.expectations).toBeGreaterThan(record.measured!.testsPassed);
    expect(record.measured!.testFiles).toBeGreaterThanOrEqual(35);
  });
});

/* ───────────────────  4. the generated roadmap report  ─────────────────── */

describe("ROADMAP_PROGRESS.md — generated truth, never hand-maintained", () => {
  const report = readFileSync(join(ROOT, "ROADMAP_PROGRESS.md"), "utf8");
  const siteData = JSON.parse(readFileSync(join(ROOT, "site-data", "vaerion-status.json"), "utf8")) as {
    nextWork: string[];
    risks: string[];
    constitution: { version: string };
    engineVersion: string;
    tests: { totalTests: number };
  };

  test("declares itself generated (the stale hand-written era is closed)", () => {
    expect(report).toContain("**GENERATED** by `tools/status.ts`");
    expect(report).toContain("Regenerate with `bun tools/status.ts`");
  });

  test("every next-work item traces to the measured status source (one source, two surfaces)", () => {
    const workSection = report.slice(report.indexOf("## Recommended next work"));
    for (const item of siteData.nextWork) {
      expect(workSection).toContain(item);
    }
  });

  test("every risk traces to the measured status source", () => {
    const riskSection = report.slice(report.indexOf("## Technical risks"));
    for (const risk of siteData.risks) {
      expect(riskSection).toContain(risk);
    }
  });

  test("the historical defect stays dead: the report never again recommends completed work", () => {
    // The hand-maintained report recommended "version lockstep 0.1.9-rc1" while
    // v0.1.10-rc1 was already tagged — twice-completed work as "next work".
    expect(report).not.toContain("version lockstep 0.1.9-rc1");
    expect(report).toContain(`Engine version of record: \`${siteData.engineVersion}\``);
  });

  test("carries the constitution of record and the measured test counts", () => {
    expect(report).toContain(`Constitution of record: \`${siteData.constitution.version}\``);
    expect(report).toContain(`${siteData.tests.totalTests} pass`);
  });
});
