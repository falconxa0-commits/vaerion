/**
 * Vaerion repository / CI / release intelligence — integration surface
 * (ASCENSION XVIII Phase 8; Constitution v1.1, D-P/D-Q/D-R/D-S/D-T).
 *
 * Every fixture is a hermetic temp git repository with pinned identity and
 * dates (no wall-clock, no network, no global config). Every output-face
 * test drives the real `runCli` entry — the same contracts users exercise.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli/vae.ts";
import { ExitCode } from "../../src/cli/io.ts";
import {
  measureRepository,
  validateWorkflows,
  parseWorkflow,
  validateWorkflowDoc,
  simulateWorkflow,
  evaluateReleaseReadiness,
  readVerificationRecord,
  runLiveGates,
  RATIFIED_IDENTITY,
} from "../../src/repo/index.ts";
import { isVaerionError } from "../../src/cli/workspace.ts";

const roots: string[] = [];
afterAll(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true }).catch(() => undefined);
});

/* ───────────────────────────  git fixture helpers  ─────────────────────────── */

const PIN_DATE = "2026-09-02T00:00:00+00:00";

async function git(cwd: string, args: string[], env: Record<string, string> = {}): Promise<string> {
  const proc = Bun.spawn(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: {
      GIT_AUTHOR_DATE: PIN_DATE,
      GIT_COMMITTER_DATE: PIN_DATE,
      ...env,
    },
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  if ((await proc.exited) !== 0) throw new Error(`git ${args.join(" ")} failed: ${await new Response(proc.stderr).text()}`);
  return out;
}

/** A temp repo with the ratified identity pinned locally (D-P). */
async function makeRepo(name = "vaerion-repo-test"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `vaerion-${name}-`));
  roots.push(dir);
  await git(dir, ["init", "-b", "main"]);
  await git(dir, ["config", "user.name", RATIFIED_IDENTITY.name]);
  await git(dir, ["config", "user.email", RATIFIED_IDENTITY.email]);
  await writeFile(join(dir, "README.md"), "# fixture\n", "utf8");
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "init: fixture repository"]);
  return dir;
}

async function collectOut(cwd: string, argv: string[]): Promise<{ lines: string[]; code: number }> {
  const lines: string[] = [];
  const code = await runCli(argv, { out: (l) => lines.push(l), err: (l) => lines.push(l), raw: () => undefined, tty: false, columns: undefined }, cwd);
  return { lines, code: code.code };
}

/* ───────────────────────────  repository intelligence  ─────────────────────────── */

describe("repository intelligence (git trust)", () => {
  test("measures a clean repository: branch, HEAD, identity, zero findings", async () => {
    const dir = await makeRepo();
    const intel = await measureRepository(dir);
    expect(intel.branch).toBe("main");
    expect(intel.detached).toBe(false);
    expect(intel.head).not.toBeNull();
    expect(intel.headAuthor?.email).toBe(RATIFIED_IDENTITY.email);
    expect(intel.staged).toEqual([]);
    expect(intel.unstaged).toEqual([]);
    expect(intel.untracked).toEqual([]);
    expect(intel.conflicts).toEqual([]);
    expect(intel.findings.filter((f) => f.severity === "blocker")).toEqual([]);
    expect(intel.auditedCommits).toBeGreaterThanOrEqual(1);
  });

  test("refuses to measure outside a repository (E2300, fail-closed)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vaerion-norepo-"));
    roots.push(dir);
    try {
      await measureRepository(dir);
      expect.unreachable();
    } catch (err) {
      expect(isVaerionError(err)).toBe(true);
      expect((err as { code: string }).code).toBe("E2300");
    }
  });

  test("detects detached HEAD as a warn finding", async () => {
    const dir = await makeRepo();
    await writeFile(join(dir, "b.txt"), "2\n", "utf8");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "second commit"]);
    const headSha = (await git(dir, ["rev-parse", "HEAD"])).trim();
    await git(dir, ["checkout", headSha]);
    const intel = await measureRepository(dir);
    expect(intel.detached).toBe(true);
    expect(intel.branch).toBe("(detached)");
    expect(intel.findings.some((f) => f.severity === "warn" && f.detail.includes("detached"))).toBe(true);
  });

  test("classifies staged, unstaged, and untracked paths separately", async () => {
    const dir = await makeRepo();
    await writeFile(join(dir, "staged.txt"), "s\n", "utf8");
    await git(dir, ["add", "staged.txt"]);
    await writeFile(join(dir, "README.md"), "# changed\n", "utf8");
    await writeFile(join(dir, "untracked.txt"), "u\n", "utf8");
    const intel = await measureRepository(dir);
    expect(intel.staged).toEqual(["staged.txt"]);
    expect(intel.unstaged).toEqual(["README.md"]);
    expect(intel.untracked).toEqual(["untracked.txt"]);
  });

  test("detects an unresolved merge conflict (E2302 blocker)", async () => {
    const dir = await makeRepo();
    await writeFile(join(dir, "shared.txt"), "base\n", "utf8");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "base file"]);
    await git(dir, ["checkout", "-b", "feature"]);
    await writeFile(join(dir, "shared.txt"), "feature\n", "utf8");
    await git(dir, ["commit", "-am", "feature edit"]);
    await git(dir, ["checkout", "main"]);
    await writeFile(join(dir, "shared.txt"), "main\n", "utf8");
    await git(dir, ["commit", "-am", "main edit"]);
    await git(dir, ["merge", "feature"]).catch(() => undefined); // conflict expected
    const intel = await measureRepository(dir);
    expect(intel.conflicts).toContain("shared.txt");
    const finding = intel.findings.find((f) => f.code === "E2302");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("blocker");
    // A conflicted tree must never be trusted for release.
    await git(dir, ["merge", "--abort"]).catch(() => undefined);
  });

  test("detects an in-progress rebase (E2302 blocker)", async () => {
    const dir = await makeRepo();
    await writeFile(join(dir, "x.txt"), "1\n", "utf8");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "x1"]);
    await git(dir, ["checkout", "-b", "side"]);
    await writeFile(join(dir, "x.txt"), "2\n", "utf8");
    await git(dir, ["commit", "-am", "x2"]);
    await git(dir, ["checkout", "main"]);
    await writeFile(join(dir, "x.txt"), "3\n", "utf8");
    await git(dir, ["commit", "-am", "x3"]);
    await git(dir, ["checkout", "side"]);
    await git(dir, ["rebase", "main"]).catch(() => undefined); // conflict stops the rebase
    const intel = await measureRepository(dir);
    expect(intel.rebaseInProgress).toBe(true);
    expect(intel.findings.some((f) => f.code === "E2302" && f.severity === "blocker")).toBe(true);
    await git(dir, ["rebase", "--abort"]).catch(() => undefined);
  });

  test("detects an in-progress cherry-pick (E2302 blocker)", async () => {
    const dir = await makeRepo();
    await writeFile(join(dir, "c.txt"), "base\n", "utf8");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "c base"]);
    await git(dir, ["checkout", "-b", "cp"]);
    await writeFile(join(dir, "c.txt"), "branch\n", "utf8");
    await git(dir, ["commit", "-am", "c branch"]);
    await git(dir, ["checkout", "main"]);
    await writeFile(join(dir, "c.txt"), "main\n", "utf8");
    await git(dir, ["commit", "-am", "c main"]);
    const sha = (await git(dir, ["rev-parse", "cp"])).trim();
    await git(dir, ["cherry-pick", sha]).catch(() => undefined);
    const intel = await measureRepository(dir);
    expect(intel.cherryPickInProgress).toBe(true);
    await git(dir, ["cherry-pick", "--abort"]).catch(() => undefined);
  });

  test("audits commit identity: HEAD violation is a blocker (E2303, D-P)", async () => {
    const dir = await makeRepo();
    await writeFile(join(dir, "v.txt"), "v\n", "utf8");
    await git(dir, ["add", "."], { GIT_AUTHOR_NAME: "Someone Else", GIT_AUTHOR_EMAIL: "else@example.com", GIT_COMMITTER_NAME: "Someone Else", GIT_COMMITTER_EMAIL: "else@example.com" });
    await git(dir, ["commit", "-m", "foreign identity commit"], { GIT_AUTHOR_NAME: "Someone Else", GIT_AUTHOR_EMAIL: "else@example.com", GIT_COMMITTER_NAME: "Someone Else", GIT_COMMITTER_EMAIL: "else@example.com" });
    const intel = await measureRepository(dir);
    expect(intel.headAuthor?.email).toBe("else@example.com");
    expect(intel.findings.some((f) => f.code === "E2303" && f.severity === "blocker")).toBe(true);
  });

  test("records historical identity violations as a warn — never proposes a rewrite", async () => {
    const dir = await makeRepo();
    // A violation in HISTORY (not HEAD): foreign commit, then a ratified one on top.
    await writeFile(join(dir, "h.txt"), "h\n", "utf8");
    await git(dir, ["add", "."], { GIT_AUTHOR_NAME: "Historical", GIT_AUTHOR_EMAIL: "hist@example.com", GIT_COMMITTER_NAME: "Historical", GIT_COMMITTER_EMAIL: "hist@example.com" });
    await git(dir, ["commit", "-m", "historical violation"], { GIT_AUTHOR_NAME: "Historical", GIT_AUTHOR_EMAIL: "hist@example.com", GIT_COMMITTER_NAME: "Historical", GIT_COMMITTER_EMAIL: "hist@example.com" });
    await writeFile(join(dir, "h2.txt"), "h2\n", "utf8");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "back to the ratified identity"]);
    const intel = await measureRepository(dir);
    expect(intel.identityViolations.length).toBe(1);
    expect(intel.headAuthor?.email).toBe(RATIFIED_IDENTITY.email);
    const finding = intel.findings.find((f) => f.code === "E2303" && f.severity === "warn");
    expect(finding).toBeDefined();
    expect(finding?.detail).toContain("immutable");
    expect(finding?.fix).toContain("Founder-approved");
  });

  test("measures release tags at HEAD", async () => {
    const dir = await makeRepo();
    await git(dir, ["tag", "-a", "v0.1.8-rc1", "-m", "fixture release"]);
    const intel = await measureRepository(dir);
    expect(intel.tagsAtHead).toContain("v0.1.8-rc1");
    expect(intel.releaseTagsAtHead).toEqual(["v0.1.8-rc1"]);
  });

  test("measures worktrees", async () => {
    const dir = await makeRepo();
    const parent = dir.slice(0, dir.lastIndexOf("/"));
    const wtPath = join(parent, `${dir.split("/").pop()}-wt`);
    roots.push(wtPath);
    await git(dir, ["worktree", "add", wtPath, "-b", "wt-branch"]);
    const intel = await measureRepository(dir);
    expect(intel.worktrees.length).toBe(2);
    expect(intel.worktrees.some((w) => w.branch === "wt-branch")).toBe(true);
    await git(dir, ["worktree", "remove", wtPath, "--force"]).catch(() => undefined);
  });

  test("reports a local-only trust chain when canonical is not configured", async () => {
    const dir = await makeRepo();
    const intel = await measureRepository(dir);
    expect(intel.canonical).not.toBeNull();
    expect(intel.canonical?.configured).toBe(false);
    expect(intel.canonical?.detail).toContain("local-only");
  });

  test("measures the canonical store: sync, tag push, and the pre-receive hook (D-Q)", async () => {
    const dir = await makeRepo();
    const bare = await mkdtemp(join(tmpdir(), "vaerion-canonical-test-"));
    roots.push(bare);
    await git(dir, ["init", "--bare", join(bare, "canonical.git")]);
    const hookPath = join(bare, "canonical.git", "hooks", "pre-receive");
    await writeFile(
      hookPath,
      "#!/bin/sh\n# fixture protection law: fast-forward-only main, no main deletion, v* immutable\nwhile read old new ref; do\n  case \"$ref\" in refs/heads/main) ;; esac\ndone\nexit 0\n",
      "utf8",
    );
    await git(dir, ["remote", "add", "canonical", join(bare, "canonical.git")]);
    await git(dir, ["push", "canonical", "main"]);
    await git(dir, ["tag", "-a", "v0.1.8-rc1", "-m", "fixture tag"]);
    await git(dir, ["push", "canonical", "v0.1.8-rc1"]);
    const intel = await measureRepository(dir);
    expect(intel.canonical?.configured).toBe(true);
    expect(intel.canonical?.reachable).toBe(true);
    expect(intel.canonical?.mainInSync).toBe(true);
    expect(intel.canonical?.headTagPushed).toBe(true);
    expect(intel.canonical?.protectionHook).toBe("verified");
    // Divergence is measured honestly after a new local commit.
    await writeFile(join(dir, "n.txt"), "n\n", "utf8");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "ahead of canonical"]);
    const ahead = await measureRepository(dir);
    expect(ahead.canonical?.mainInSync).toBe(false);
  });
});

/* ───────────────────────────  CI intelligence  ─────────────────────────── */

const VALID_WORKFLOW = `name: fixture
on:
  push:
    branches: [main]
    tags: ["v*"]
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.14"
      - run: bun run tools/verify.ts
`;

const DRIFTED_WORKFLOW = `name: drifted
on: push
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Provision key
        if: env.RELEASE_SIGNING_KEY != ''
        env:
          RELEASE_SIGNING_KEY: \${{ secrets.RELEASE_SIGNING_KEY }}
        run: |
          echo "\${{ secrets.RELEASE_SIGNING_KEY }}" > key.txt
`;

const REIMPLEMENTED_WORKFLOW = `name: rogue
on: push
jobs:
  gates:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - run: bunx tsc --noEmit && bun test tests/
`;

describe("CI intelligence (D-R)", () => {
  test("validates a sound workflow: zero findings, authority invoked", async () => {
    const dir = await makeRepo();
    await mkdir(join(dir, ".github", "workflows"), { recursive: true });
    await writeFile(join(dir, ".github", "workflows", "fixture.yml"), VALID_WORKFLOW, "utf8");
    const { findings } = await validateWorkflows(dir);
    expect(findings).toEqual([]);
  });

  test("flags unparsable YAML (E2307) without crashing", async () => {
    const dir = await makeRepo();
    await mkdir(join(dir, ".github", "workflows"), { recursive: true });
    await writeFile(join(dir, ".github", "workflows", "broken.yml"), "on: [push\njobs: {", "utf8");
    const { docs, findings } = await validateWorkflows(dir);
    expect(docs).toEqual([]);
    expect(findings.some((f) => f.code === "E2307" && f.severity === "blocker")).toBe(true);
  });

  test("flags shape defects: no triggers, no jobs, empty steps (E2304)", async () => {
    const parsed = parseWorkflow("w.yml", "name: empty\n");
    expect(parsed.findings.some((f) => f.code === "E2304")).toBe(true);
    const parsed2 = parseWorkflow("w2.yml", "on: push\njobs: {}\n");
    expect(parsed2.findings.some((f) => f.code === "E2304" && f.detail.includes("no jobs"))).toBe(true);
    const parsed3 = parseWorkflow("w3.yml", "on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps: []\n");
    expect(parsed3.findings.some((f) => f.code === "E2304" && f.detail.includes("empty steps"))).toBe(true);
  });

  test("flags the measured env-if drift class (E2306) — the verify.yml defect", async () => {
    const parsed = parseWorkflow("drifted.yml", DRIFTED_WORKFLOW);
    expect(parsed.doc).not.toBeNull();
    const findings = validateWorkflowDoc(parsed.doc!);
    expect(findings.some((f) => f.code === "E2306" && f.detail.includes("permanently false"))).toBe(true);
  });

  test("flags gate logic without the verification authority (E2305)", async () => {
    const parsed = parseWorkflow("rogue.yml", REIMPLEMENTED_WORKFLOW);
    const findings = validateWorkflowDoc(parsed.doc!);
    const e2305 = findings.find((f) => f.code === "E2305");
    expect(e2305).toBeDefined();
    expect(e2305?.severity).toBe("blocker");
    expect(e2305?.fix).toContain("tools/verify.ts");
  });

  test("flags an unpinned setup-bun (supply-chain) and secret echo (hygiene)", async () => {
    const text = `on: push
jobs:
  j:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: oven-sh/setup-bun@v2
      - run: echo "\${{ secrets.MY_KEY }}"
      - run: bun run tools/verify.ts
`;
    const parsed = parseWorkflow("w.yml", text);
    const findings = validateWorkflowDoc(parsed.doc!);
    expect(findings.some((f) => f.code === "E2304" && f.detail.includes("bun-version"))).toBe(true);
    expect(findings.some((f) => f.code === "E2304" && f.detail.includes("secret material"))).toBe(true);
  });

  test("simulates a tag push: release jobs project as running, by measured conditions", async () => {
    const dir = await makeRepo();
    await mkdir(join(dir, ".github", "workflows"), { recursive: true });
    await writeFile(join(dir, ".github", "workflows", "fixture.yml"), VALID_WORKFLOW, "utf8");
    const { docs } = await validateWorkflows(dir);
    const proj = simulateWorkflow(docs[0]!, "tag", { tagRef: "v9.9.9", branch: null });
    expect(proj.triggered).toBe(true);
    expect(proj.jobs.every((j) => j.wouldRun)).toBe(true);
  });

  test("simulates a branch push and a pull_request: conditions evaluated deterministically", async () => {
    const dir = await makeRepo();
    await mkdir(join(dir, ".github", "workflows"), { recursive: true });
    await writeFile(join(dir, ".github", "workflows", "fixture.yml"), VALID_WORKFLOW, "utf8");
    const { docs } = await validateWorkflows(dir);
    const push = simulateWorkflow(docs[0]!, "push", { tagRef: null, branch: "main" });
    expect(push.triggered).toBe(true);
    const pushWrong = simulateWorkflow(docs[0]!, "push", { tagRef: null, branch: "feature/x" });
    expect(pushWrong.triggered).toBe(false);
    const pr = simulateWorkflow(docs[0]!, "pull_request", { tagRef: null, branch: null });
    expect(pr.triggered).toBe(false); // fixture listens to push only
  });

  test("unknown job conditions project fail-closed with an honest reason", async () => {
    const dir = await makeRepo();
    await mkdir(join(dir, ".github", "workflows"), { recursive: true });
    await writeFile(
      join(dir, ".github", "workflows", "odd.yml"),
      "on: push\njobs:\n  j:\n    if: github.ref_protections.enabled == true\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: bun run tools/verify.ts\n",
      "utf8",
    );
    const { docs } = await validateWorkflows(dir);
    const proj = simulateWorkflow(docs[0]!, "push", { tagRef: null, branch: "main" });
    const job = proj.jobs[0]!;
    expect(job.wouldRun).toBe(false);
    expect(job.reason).toContain("fail-closed projection");
  });

  test("regression: the repository's real verify.yml validates clean after the Phase 8 fix", async () => {
    // The engine repo root, resolved relative to this test file.
    const engineRoot = join(import.meta.dir, "..", "..", "..", "..");
    const workflowPath = join(engineRoot, ".github", "workflows", "verify.yml");
    try {
      await stat(workflowPath);
    } catch {
      return; // workflow not present in this checkout shape; nothing to pin
    }
    const text = await readFile(workflowPath, "utf8");
    const parsed = parseWorkflow("verify.yml", text);
    expect(parsed.doc).not.toBeNull();
    const findings = validateWorkflowDoc(parsed.doc!);
    expect(findings.filter((f) => f.severity === "blocker")).toEqual([]);
  });
});

/* ───────────────────────────  release readiness  ─────────────────────────── */

async function makeEngineLikeRepo(opts: { version?: string; drift?: boolean } = {}): Promise<string> {
  const dir = await makeRepo();
  const version = opts.version ?? "0.1.8-rc1";
  await mkdir(join(dir, "packages", "vaerion"), { recursive: true });
  await mkdir(join(dir, "sdks", "typescript"), { recursive: true });
  await mkdir(join(dir, "spec"), { recursive: true });
  await mkdir(join(dir, "tools"), { recursive: true });
  await writeFile(join(dir, "packages", "vaerion", "package.json"), JSON.stringify({ name: "vaerion", version: opts.drift === true ? "9.9.9" : version }), "utf8");
  await writeFile(join(dir, "sdks", "typescript", "package.json"), JSON.stringify({ name: "@vaerion/sdk", version }), "utf8");
  await writeFile(join(dir, "tools", "package.json"), JSON.stringify({ name: "vaerion-tools", version }), "utf8");
  await writeFile(join(dir, "spec", "openapi.json"), JSON.stringify({ info: { version } }), "utf8");
  await writeFile(join(dir, ".vaerion-verification.json"), JSON.stringify({ generatedAt: "measured-in-fixture", ok: true, gates: [{ gate: "typecheck-engine", ok: true, durationMs: 1 }, { gate: "typecheck-sdk", ok: true, durationMs: 1 }, { gate: "tests", ok: true, durationMs: 1 }, { gate: "layerlint", ok: true, durationMs: 1 }, { gate: "constitutional-check", ok: true, durationMs: 1 }, { gate: "repo-lint", ok: true, durationMs: 1 }] }), "utf8");
  await writeFile(join(dir, "worklog.md"), "---\nTask ID: FIXTURE\nAgent: test\nTask: fixture ledger\n", "utf8");
  await writeFile(join(dir, "VERIFICATION_REPORT.md"), "# verification\n", "utf8");
  await writeFile(join(dir, "ROADMAP_PROGRESS.md"), "# roadmap\n", "utf8");
  await git(dir, ["add", "."]);
  await git(dir, ["commit", "-m", "fixture: release surfaces"]);
  await git(dir, ["tag", "-a", "v0.1.8-rc1", "-m", "fixture tag"]);
  return dir;
}

describe("release readiness (D-S/D-T, fail-closed)", () => {
  test("BLOCKED with E2310 when no verification record exists (absence is measured)", async () => {
    const dir = await makeRepo();
    const report = await evaluateReleaseReadiness(dir);
    expect(report.ready).toBe(false);
    expect(report.verdict).toBe("BLOCKED");
    const gateCheck = report.checks.find((c) => c.check === "verification-gates");
    expect(gateCheck?.ok).toBe(false);
    expect(gateCheck?.code).toBe("E2310");
    expect(gateCheck?.fix).toContain("tools/verify.ts");
  });

  test("parses the verification record honestly", async () => {
    const dir = await makeRepo();
    await writeFile(join(dir, ".vaerion-verification.json"), "{ not json", "utf8");
    const bad = await readVerificationRecord(dir);
    expect(bad.record).toBeNull();
    expect(bad.detail).toContain("not parsable");
  });

  test("a tagged, clean, recorded fixture passes the measured checks it can pass", async () => {
    const dir = await makeEngineLikeRepo();
    const report = await evaluateReleaseReadiness(dir);
    const byName = (n: string): unknown => report.checks.find((c) => c.check === n);
    expect(byName("git-tree-clean")).toMatchObject({ ok: true });
    expect(byName("git-identity-head")).toMatchObject({ ok: true });
    expect(byName("release-tag-binding")).toMatchObject({ ok: true });
    expect(byName("version-lockstep")).toMatchObject({ ok: true });
    expect(byName("worklog-ledger")).toMatchObject({ ok: true });
    // Artifacts are still missing — the honest blocker.
    expect(byName("release-artifacts")).toMatchObject({ ok: false, code: "E2312" });
    expect(report.ready).toBe(false);
    expect(report.blockers.map((b) => b.check)).toContain("release-artifacts");
  });

  test("version drift is a blocker (E2309) with the disagreeing surfaces listed", async () => {
    const dir = await makeEngineLikeRepo({ drift: true });
    const report = await evaluateReleaseReadiness(dir);
    const check = report.checks.find((c) => c.check === "version-lockstep");
    expect(check?.ok).toBe(false);
    expect(check?.code).toBe("E2309");
    expect(check?.detail).toContain("9.9.9");
  });

  test("a foreign-identity HEAD blocks release (E2303) and a missing tag blocks (E2311)", async () => {
    const dir = await makeEngineLikeRepo();
    await writeFile(join(dir, "new.txt"), "n\n", "utf8");
    await git(dir, ["add", "."], { GIT_AUTHOR_NAME: "X", GIT_AUTHOR_EMAIL: "x@x.x", GIT_COMMITTER_NAME: "X", GIT_COMMITTER_EMAIL: "x@x.x" });
    await git(dir, ["commit", "-m", "foreign head"], { GIT_AUTHOR_NAME: "X", GIT_AUTHOR_EMAIL: "x@x.x", GIT_COMMITTER_NAME: "X", GIT_COMMITTER_EMAIL: "x@x.x" });
    const report = await evaluateReleaseReadiness(dir);
    expect(report.checks.find((c) => c.check === "git-identity-head")?.code).toBe("E2303");
    expect(report.checks.find((c) => c.check === "release-tag-binding")?.code).toBe("E2311");
  });

  test("every check carries an honesty label (D-S) and blockers repeat with fixes", async () => {
    const dir = await makeRepo();
    const report = await evaluateReleaseReadiness(dir);
    for (const c of report.checks) {
      expect(["VERIFIED", "UNVERIFIED", "NEVER EXECUTED"]).toContain(c.honesty);
    }
    expect(report.blockers.length).toBeGreaterThan(0);
    for (const b of report.blockers) {
      expect(b.fix !== undefined || b.detail.length > 0).toBe(true);
    }
  });

  test("live gates run through an injected stub (internal port; parsing is deterministic)", async () => {
    const dir = await makeRepo();
    const script = join(roots[0]!, "stub-verify.ts");
    await writeFile(script, 'console.log("=== typecheck-engine: GREEN (1ms) ===");\nconsole.log("=== repo-lint: GREEN (2ms) ===");\n', "utf8");
    const live = await runLiveGates(dir, ["bun", "run", script]);
    expect(live.ok).toBe(true);
    expect(live.gates.length).toBe(2);
    const redScript = join(roots[0]!, "stub-verify-red.ts");
    await writeFile(redScript, 'console.log("=== tests: RED (3ms) ===");\nprocess.exit(1);\n', "utf8");
    const red = await runLiveGates(dir, ["bun", "run", redScript]);
    expect(red.ok).toBe(false);
    expect(red.detail).toContain("tests");
  });
});

/* ───────────────────────────  CLI contracts  ─────────────────────────── */

describe("repo / ci / release CLI contracts (Five Guarantees)", () => {
  test("help teaches and never executes (Guarantee #1)", async () => {
    const dir = await makeRepo();
    for (const topic of ["repo", "ci", "release"]) {
      const { lines, code } = await collectOut(dir, [topic, "--help"]);
      expect(code).toBe(ExitCode.ok);
      expect(lines.join("\n")).toContain("measured");
    }
    const r = await collectOut(dir, ["release", "--help"]);
    expect(r.lines.join("\n").toLowerCase()).toContain("fail-closed");
  });

  test("usage errors teach with E1600 and exit 2", async () => {
    const dir = await makeRepo();
    const bad = await collectOut(dir, ["ci", "frobnicate"]);
    expect(bad.code).toBe(ExitCode.usage);
    expect(bad.lines.join("\n")).toContain("E1600");
    const noEvent = await collectOut(dir, ["ci", "simulate"]);
    expect(noEvent.code).toBe(ExitCode.usage);
    const badSub = await collectOut(dir, ["release", "ship-it"]);
    expect(badSub.code).toBe(ExitCode.usage);
    const badRepo = await collectOut(dir, ["repo", "morph"]);
    expect(badRepo.code).toBe(ExitCode.usage);
  });

  test("outside a repository: E2300 teaches and exits usage (2)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vaerion-norepo-cli-"));
    roots.push(dir);
    const { lines, code } = await collectOut(dir, ["repo", "--plain"]);
    expect(code).toBe(ExitCode.usage);
    expect(lines.join("\n")).toContain("E2300");
    expect(lines.join("\n")).toContain("Fix:");
  });

  test("--json is a single pure NDJSON line with the stable shape (Guarantee #2)", async () => {
    const dir = await makeRepo();
    await git(dir, ["tag", "-a", "v0.1.8-rc1", "-m", "t"]);
    const { lines, code } = await collectOut(dir, ["repo", "--json"]);
    expect(code).toBe(ExitCode.ok);
    expect(lines.filter((l) => l.trim().length > 0)).toHaveLength(1);
    const payload = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(payload.command).toBe("repo");
    expect(payload.kind).toBe("summary");
    const state = payload.state as Record<string, unknown>;
    expect(state.conflict_count).toBe(0);
  });

  test("--plain is flat key: value at the top level with no ANSI", async () => {
    const dir = await makeRepo();
    const { lines, code } = await collectOut(dir, ["repo", "--plain"]);
    expect(code).toBe(ExitCode.ok);
    expect(lines[0]).toBe("command: repo");
    for (const line of lines) {
      expect(line.includes("[")).toBe(false);
    }
    expect(lines.join("\n")).toContain("branch: main");
  });

  test("rich mode renders panels over the same payload (TTY harness)", async () => {
    const dir = await makeRepo();
    const savedUi = process.env.VAE_UI;
    process.env.VAE_UI = "rich";
    try {
      const lines: string[] = [];
      const code = await runCli(["repo"], { out: (l) => lines.push(l), err: (l) => lines.push(l), raw: () => undefined, tty: true, columns: 100 }, dir);
      expect(code.code).toBe(ExitCode.ok);
      const joined = lines.join("\n");
      expect(joined).toContain("Repository intelligence");
      expect(joined).toContain("Working tree");
    } finally {
      if (savedUi === undefined) delete process.env.VAE_UI;
      else process.env.VAE_UI = savedUi;
    }
  });

  test("rich mode renders the release verdict with honesty columns", async () => {
    const dir = await makeRepo();
    const savedUi = process.env.VAE_UI;
    process.env.VAE_UI = "rich";
    try {
      const lines: string[] = [];
      const code = await runCli(["release", "readiness"], { out: (l) => lines.push(l), err: (l) => lines.push(l), raw: () => undefined, tty: true, columns: 100 }, dir);
      expect(code.code).toBe(ExitCode.partial);
      const joined = lines.join("\n");
      expect(joined).toContain("Release readiness — BLOCKED");
      expect(joined).toContain("honesty");
      expect(joined).toContain("VERIFIED");
    } finally {
      if (savedUi === undefined) delete process.env.VAE_UI;
      else process.env.VAE_UI = savedUi;
    }
  });

  test("ci validate --json reports the authority and ok state", async () => {
    const dir = await makeRepo();
    await mkdir(join(dir, ".github", "workflows"), { recursive: true });
    await writeFile(join(dir, ".github", "workflows", "ok.yml"), VALID_WORKFLOW, "utf8");
    const { lines, code } = await collectOut(dir, ["ci", "validate", "--json"]);
    expect(code).toBe(ExitCode.ok);
    const payload = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(payload.ok).toBe(true);
    expect(String(payload.authority)).toContain("tools/verify.ts");
  });

  test("ci simulate --json declares its own limits (projection, NEVER EXECUTED)", async () => {
    const dir = await makeRepo();
    await mkdir(join(dir, ".github", "workflows"), { recursive: true });
    await writeFile(join(dir, ".github", "workflows", "ok.yml"), VALID_WORKFLOW, "utf8");
    const { lines, code } = await collectOut(dir, ["ci", "simulate", "--event", "push", "--ref", "main", "--json"]);
    expect(code).toBe(ExitCode.ok);
    const payload = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(payload.event).toBe("push");
    expect(String(payload.scope)).toContain("NEVER EXECUTED");
    const projections = payload.projections as Array<Record<string, unknown>>;
    expect(projections[0]?.triggered).toBe(true);
  });

  test("release readiness --json: fail-closed BLOCKED payload with blockers and fixes", async () => {
    const dir = await makeRepo();
    const { lines, code } = await collectOut(dir, ["release", "readiness", "--json"]);
    expect(code).toBe(ExitCode.partial);
    const payload = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(payload.ready).toBe(false);
    expect(payload.verdict).toBe("BLOCKED");
    const blockers = payload.blockers as Array<Record<string, unknown>>;
    expect(blockers.length).toBeGreaterThan(0);
    expect(String(payload.honesty)).toContain("fail-closed");
  });

  test("release readiness --dry-run is pure and says so (Guarantee #3)", async () => {
    const dir = await makeRepo();
    const { lines, code } = await collectOut(dir, ["release", "readiness", "--dry-run", "--json"]);
    expect(code).toBe(ExitCode.partial);
    const payload = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(payload.dry_run).toBe(true);
    expect(payload.side_effects).toBe(0);
  });

  test("SECURITY CANARY: a secret-shaped commit subject never reaches any output face", async () => {
    const dir = await makeRepo();
    await writeFile(join(dir, "canary.txt"), "c\n", "utf8");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "subject with sk-canary-NEVER-LEAK-9f3a inside"]);
    for (const argv of [["repo", "--json"], ["repo", "--plain"]]) {
      const { lines } = await collectOut(dir, argv);
      expect(lines.join("\n")).not.toContain("sk-canary-NEVER-LEAK-9f3a");
    }
    const savedUi = process.env.VAE_UI;
    process.env.VAE_UI = "rich";
    try {
      const lines: string[] = [];
      await runCli(["repo"], { out: (l) => lines.push(l), err: (l) => lines.push(l), raw: () => undefined, tty: true, columns: 100 }, dir);
      expect(lines.join("\n")).not.toContain("sk-canary-NEVER-LEAK-9f3a");
    } finally {
      if (savedUi === undefined) delete process.env.VAE_UI;
      else process.env.VAE_UI = savedUi;
    }
  });

  test("read-only law: a repo measurement leaves the working tree byte-identical", async () => {
    const dir = await makeRepo();
    const before = await git(dir, ["status", "--porcelain=v1"]);
    await measureRepository(dir);
    const after = await git(dir, ["status", "--porcelain=v1"]);
    expect(after).toBe(before);
    // And the journal in a Vaerion workspace is untouched by `vae repo`.
    const { code } = await collectOut(dir, ["repo", "--plain"]);
    expect(code).toBe(ExitCode.ok);
  });
});

/* ───────────────────────────  law & lockstep regression  ─────────────────────────── */

describe("constitution and version lockstep regression (Phase 8)", () => {
  test("the ratified constitution is v1.7 with the master-directive process law ratified and the honest phase ledger", async () => {
    const root = join(import.meta.dir, "..", "..", "..", "..");
    const constitution = await readFile(join(root, "docs", "constitution", "VAERION_CONSTITUTION_v1.7.md"), "utf8");
    expect(constitution).toContain("VAERION_CONSTITUTION_v1.7");
    expect(constitution).toContain("D-M′");
    for (const law of ["D-P", "D-Q", "D-R", "D-S", "D-T", "D-U", "D-V", "D-W", "D-X", "D-Y"]) {
      expect(constitution).toContain(`| ${law} |`);
    }
    // The surface (A3, carried unchanged into v1.7): account, ai, center ratified;
    // init carries the template face.
    expect(constitution).toContain("tour, account, ai, center`");
    expect(constitution).toContain("--template NAME");
    expect(constitution).toContain("welcome front door");
    // The GA campaign (A4), its boundary reconciliation (A5), and the production
    // operations campaign (A6).
    expect(constitution).toContain("### A4 — v1.3 → v1.4");
    expect(constitution).toContain("### A5 — v1.4 → v1.5");
    expect(constitution).toContain("### A6 — v1.5 → v1.6");
    expect(constitution).toContain("the performance budget law");
    expect(constitution).toContain("the accessibility law");
    expect(constitution).toContain("the release-train rehearsal");
    expect(constitution).toContain("the GA gate");
    expect(constitution).toContain("zero repository evidence"); // the honest Phase 7 adjudication, quoted in A4
    expect(constitution).toContain("rehearsed and pending Founder GO"); // §7 after A5
    expect(constitution).toContain("docs/ga/GO-NO-GO.md"); // the dossier of record
    // A6 — the synchronization protection law: D-Q extended to every synchronized
    // remote, with measured probes, D-S-labeled protection state, and the staged
    // fail-closed elevation of required checks (a check that cannot run is not a check).
    expect(constitution).toContain("Synchronization protection law");
    expect(constitution).toContain("no force-push, no deletion, linear history");
    expect(constitution).toContain("adversarially probed after every provisioning");
    expect(constitution).toContain("a check that cannot run is not a check");
    expect(constitution).toContain("Phase 11 — the CI truth law");
    expect(constitution).toContain("Phase 12 — the remote protection law");
    expect(constitution).toContain("Phase 13 — the CI execution law");
    expect(constitution).toContain("Phase 14 — the program close");
    // A7 — the master-directive process law: the Reality Recovery Protocol, the
    // Implementation Rule + Root Cause Law, the Campaign Close Law, the Declaration
    // Standard, and the Empty Machine Test, ratified as register law (D-U…D-Y).
    expect(constitution).toContain("### A7 — v1.6 → v1.7");
    expect(constitution).toContain("THE MASTER CONSTITUTIONAL DIRECTIVE");
    expect(constitution).toContain("Reality Recovery Law");
    expect(constitution).toContain("Nothing proceeds until reality is measured");
    expect(constitution).toContain("Implementation Rule + Root Cause Law");
    expect(constitution).toContain("fix the root cause → verify prevention");
    expect(constitution).toContain("Campaign Close Law");
    expect(constitution).toContain("Remaining Reality Report");
    expect(constitution).toContain("Declaration Standard");
    expect(constitution).toContain("Vaerion is progressing toward readiness");
    expect(constitution).toContain("The Empty Machine Test");
    expect(constitution).toContain("discover → install → verify → initialize → use → upgrade → remove");
    expect(constitution).toContain("a package is a product only when it installs, executes, upgrades, and removes");
    expect(constitution).toContain("Phase 15 — the materialization");
    expect(constitution).toContain("Phase 16 — the live-reference law");
    expect(constitution).toContain("Phase 17 — the provisioning law");
    expect(constitution).toContain("Phase 18 — the program close");
    expect(constitution).not.toContain("▶ in flight"); // the campaign is complete — no rows in flight
    // History is retained unmodified: v1.6 (with the A6-era D-Q scope), v1.5,
    // v1.4, v1.3 (with the A3 surface), v1.2 (with the A2 surface), v1.1 (with
    // the v1.1-era adjudication) and v1.0.
    const v16 = await readFile(join(root, "docs", "constitution", "VAERION_CONSTITUTION_v1.6.md"), "utf8");
    expect(v16).toContain("VAERION_CONSTITUTION_v1.6");
    expect(v16).toContain("Synchronization protection law"); // the A6-era D-Q scope, preserved in history
    expect(v16).not.toContain("D-U"); // v1.6 predates the master-directive register additions
    const v15 = await readFile(join(root, "docs", "constitution", "VAERION_CONSTITUTION_v1.5.md"), "utf8");
    expect(v15).toContain("VAERION_CONSTITUTION_v1.5");
    expect(v15).toContain("Canonical protection law"); // the pre-A6 D-Q scope, preserved in history
    const v14 = await readFile(join(root, "docs", "constitution", "VAERION_CONSTITUTION_v1.4.md"), "utf8");
    expect(v14).toContain("VAERION_CONSTITUTION_v1.4");
    const v13 = await readFile(join(root, "docs", "constitution", "VAERION_CONSTITUTION_v1.3.md"), "utf8");
    expect(v13).toContain("VAERION_CONSTITUTION_v1.3");
    expect(v13).toContain("tour, account, ai, center`");
    const v12 = await readFile(join(root, "docs", "constitution", "VAERION_CONSTITUTION_v1.2.md"), "utf8");
    expect(v12).toContain("VAERION_CONSTITUTION_v1.2");
    expect(v12).toContain("release, tour`");
    const v11 = await readFile(join(root, "docs", "constitution", "VAERION_CONSTITUTION_v1.1.md"), "utf8");
    expect(v11).toContain("VAERION_CONSTITUTION_v1.1");
    expect(v11).toContain("2–7");
    await readFile(join(root, "docs", "constitution", "VAERION_CONSTITUTION_v1.0.md"), "utf8");
  });

  test("version lockstep holds across every measured surface", async () => {
    const root = join(import.meta.dir, "..", "..", "..", "..");
    const { VERSION } = await import("../../src/cli/vae.ts");
    const { ENGINE_VERSION } = await import("../../src/journal/writer.ts");
    const pkg = JSON.parse(await readFile(join(root, "packages", "vaerion", "package.json"), "utf8")) as { version: string };
    const sdk = JSON.parse(await readFile(join(root, "sdks", "typescript", "package.json"), "utf8")) as { version: string };
    const tools = JSON.parse(await readFile(join(root, "tools", "package.json"), "utf8")) as { version: string };
    const openapi = JSON.parse(await readFile(join(root, "spec", "openapi.json"), "utf8")) as { info: { version: string } };
    expect(ENGINE_VERSION).toBe(VERSION);
    expect(pkg.version).toBe(VERSION);
    expect(sdk.version).toBe(VERSION);
    expect(tools.version).toBe(VERSION);
    expect(openapi.info.version).toBe(VERSION);
  });
});

/* ───────────────────  constitution-of-record derivation (MASTER DIRECTIVE Phase 16)  ─────────────────── */

describe("the ONE derivation + the ONE ledger parser (v1.7 A7, D-B/D-V)", () => {
  test("constitutionOfRecord names the highest ratified version and fails closed", async () => {
    const root = join(import.meta.dir, "..", "..", "..", "..");
    const { constitutionOfRecord } = await import("../../src/repo/constitution.ts");
    const record = constitutionOfRecord(root);
    expect(record.version).toBe("v1.7");
    expect(record.file).toBe("VAERION_CONSTITUTION_v1.7.md");
    expect(record.path).toBe("docs/constitution/VAERION_CONSTITUTION_v1.7.md");
    // Fail-closed (P6): no ratified constitution ⇒ no guess, ever.
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const empty = await mkdtemp(join(tmpdir(), "vaerion-no-law-"));
    expect(() => constitutionOfRecord(empty)).toThrow(/fail-closed/);
  });

  test("parsePhaseLedger reads the real D-T ledger; the in-flight state derives from the same rows", async () => {
    const root = join(import.meta.dir, "..", "..", "..", "..");
    const { constitutionOfRecord, parsePhaseLedger } = await import("../../src/repo/constitution.ts");
    const ledger = parsePhaseLedger(await readFile(join(root, "docs", "constitution", constitutionOfRecord(root).file), "utf8"));
    expect(ledger.length).toBeGreaterThanOrEqual(15);
    const last = ledger.at(-1)!;
    expect(last.status).toBe("✅ complete");
    // The tail moves as campaigns close: rows 19–22 are ASCENSION XX
    // (the ecosystem completion campaign); rows 23–26 are the FINAL FOUR
    // PHASES (the GA-completion campaign, appended at its close — the pin
    // moved WITH the lawfully appended rows, the same amendment the
    // ASCENSION XX close performed).
    expect(last.era).toBe("FINAL FOUR PHASES");
    expect(last.phase).toBe("26");
    expect(ledger.filter((r) => r.status === "▶ in flight").length).toBe(0);
    // The five-section register era: D-U…D-Y exist alongside the historical rows.
    for (const phase of ["14", "15", "19", "22", "26"]) {
      expect(ledger.some((r) => r.phase === phase)).toBe(true);
    }
  });
});
