/**
 * Vaerion — the release-train REHEARSAL (ASCENSION XVIII Phase 9; constitution
 * v1.4 A4; P3 protocol discipline, D-R, D-S honesty).
 *
 * ONE deterministic runner exercises the full release train end-to-end in a
 * sandbox — the same steps the release commander executes at a real train:
 *
 *   1. verification-record  the train departs ONLY from a measured-green
 *                           verification record (.vaerion-verification.json
 *                           written by tools/verify.ts — D-R); fail-closed.
 *   2. release-pack         tools/dist-pack.ts --ref <ref> → deterministic
 *                           signed artifact set in dist/.
 *   3. trust-chain          tools/dist-verify.ts (the consumer's verification)
 *                           → ALL CHECKS PASSED or the train stops.
 *   4. npm-pack             packaging/npm/make-package.sh → the npm tarball.
 *   5. npm-install          install the tarball into a scratch prefix.
 *   6. installed-version    the INSTALLED `vae version --json` must report the
 *                           engine version of record (lockstep through the
 *                           artifact, not the repo).
 *   7. installed-init       the installed `vae init` scaffolds a workspace.
 *   8. installed-center     the installed `vae center --json` reads a workspace
 *                           (honest zeros on a fresh scaffold — exit 0).
 *   9. npm-uninstall        uninstall leaves NOTHING behind (bin gone).
 *
 * The report (docs/ga/RELEASE-TRAIN-REHEARSAL.md) is generated from the
 * measured steps — the GA evidence of record that Phase 10 archives.
 *
 * Determinism: the step PLAN and the report SHAPE are deterministic; wall
 * durations are measured and honestly recorded (D-S). The only repository
 * writes are the sanctioned artifact directory (dist/, untracked) and the
 * generated rehearsal report (committed as GA evidence). Everything else
 * lives in a temp scratch that is removed afterwards.
 *
 * Usage:
 *   bun run tools/rehearsal.ts [--ref <git-ref>] [--json]
 *   (default ref: the highest v* release tag)
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

/* ──────────────────────────────  the plan  ────────────────────────────── */

/** The step ids of record, in the fixed order (deterministic plan). */
export const REHEARSAL_STEPS = [
  "verification-record",
  "release-pack",
  "trust-chain",
  "npm-pack",
  "npm-install",
  "installed-version",
  "installed-init",
  "installed-center",
  "npm-uninstall",
] as const;

export type RehearsalStepId = (typeof REHEARSAL_STEPS)[number];

export interface RehearsalStep {
  readonly step: RehearsalStepId;
  readonly ok: boolean;
  readonly durationMs: number;
  /** Measured evidence: the exit code, the digest, the version — never a claim. */
  readonly evidence: string;
}

export interface RehearsalOutcome {
  readonly ref: string;
  readonly commit: string;
  readonly engineVersion: string;
  readonly passed: boolean;
  readonly steps: readonly RehearsalStep[];
}

/* ────────────────────────────  helpers  ──────────────────────────── */

function run(cmd: string[], opts: { cwd?: string; timeoutMs?: number } = {}): { ok: boolean; code: number | null; out: string } {
  const proc = spawnSync(cmd[0]!, cmd.slice(1), {
    cwd: opts.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: opts.timeoutMs ?? 600_000,
  });
  return { ok: proc.status === 0, code: proc.status, out: ((proc.stdout ?? "") + (proc.stderr ?? "")).trim() };
}

function lastLine(text: string): string {
  const lines = text.split("\n").filter((l) => l.length > 0);
  return lines.length > 0 ? (lines[lines.length - 1] ?? "") : "";
}

/** The engine version of record (lockstep target). */
export function engineVersionOfRecord(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, "packages", "vaerion", "package.json"), "utf8")) as { version: string };
  return pkg.version;
}

/** The highest v* tag — the default departure ref of the train. */
export function latestReleaseTag(): string {
  const git = run(["git", "tag", "-l", "v*", "--sort=-v:refname"], { timeoutMs: 30_000 });
  if (!git.ok) throw new Error(`rehearsal: cannot list tags: ${git.out}`);
  const first = git.out
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)[0];
  if (!first) throw new Error("rehearsal: no v* release tag exists — the train has nothing to rehearse against");
  return first;
}

/** The commit the ref binds (the evidence anchor of the rehearsal). */
export function commitOf(ref: string): string {
  const git = run(["git", "rev-parse", `${ref}^{commit}`], { timeoutMs: 30_000 });
  if (!git.ok) throw new Error(`rehearsal: cannot resolve ${ref}: ${git.out}`);
  return git.out.split("\n")[0]!.trim();
}

/** Step 1 — the train departs only from a measured-green record (D-R). */
export function checkVerificationRecord(recordPath: string = join(ROOT, ".vaerion-verification.json")): { ok: boolean; evidence: string } {
  const path = recordPath;
  if (!existsSync(path)) {
    return { ok: false, evidence: ".vaerion-verification.json missing — run `bun tools/verify.ts` first (D-R: the ONE entrypoint)" };
  }
  try {
    const record = JSON.parse(readFileSync(path, "utf8")) as { ok: boolean; gates?: Array<{ gate: string; ok: boolean }> };
    const gates = record.gates ?? [];
    const red = gates.filter((g) => !g.ok).map((g) => g.gate);
    if (!record.ok || red.length > 0) {
      return { ok: false, evidence: `verification record is RED (${red.join(", ") || "ok=false"}) — green gates are the departure condition` };
    }
    return { ok: true, evidence: `verification record GREEN (${gates.length} gates through the single verification authority)` };
  } catch (err) {
    return { ok: false, evidence: `verification record unreadable: ${(err as Error).message}` };
  }
}

/* ────────────────────────────  the report  ──────────────────────────── */

/** Deterministic markdown report from the measured steps (the GA evidence). */
export function buildReport(outcome: RehearsalOutcome, generatedAtIso: string): string {
  const rows = outcome.steps
    .map((s) => `| \`${s.step}\` | ${s.ok ? "✅ PASS" : "❌ FAIL"} | ${s.durationMs}ms | ${s.evidence.replaceAll("|", "\\|")} |`)
    .join("\n");
  const failed = outcome.steps.filter((s) => !s.ok);
  return `# Vaerion Release-Train Rehearsal — ${outcome.ref}

| | |
|---|---|
| **Departure ref** | \`${outcome.ref}\` (commit \`${outcome.commit.slice(0, 12)}\`) |
| **Engine version of record** | \`${outcome.engineVersion}\` |
| **Rehearsed at** | ${generatedAtIso} (wall-clock of the rehearsal, not of the artifacts) |
| **Verdict** | ${outcome.passed ? "**PASSED — the release train is rehearsed end-to-end**" : `**FAILED — ${failed.length} step(s) stopped the train**`} |
| **Method** | ONE deterministic runner (\`tools/rehearsal.ts\`); every step is a measurement with its evidence; honesty labels per D-S |

## The measured steps

| Step | Result | Duration | Evidence |
|---|---|---|---|
${rows}

## What this proves

- The signed artifact set is reproducible from the departure ref and the
  consumer trust chain verifies (\`dist-verify\`: Ed25519 manifest signature,
  every consumer file digest-bound).
- The npm channel install works from the packed tarball: the INSTALLED
  \`vae\` reports the engine version of record (lockstep through the
  artifact, not the repo), scaffolds a workspace with \`vae init\`, and
  reads it with \`vae center --json\` (exit 0, honest zeros).
- Uninstall leaves nothing behind.

## Honest limits (D-S)

- Registry publication (npm/PyPI/brew/winget) and the vaerion.dev installer
  URL are release-train **publish** steps — Founder-gated (risk ledger F-5);
  this rehearsal proves the LOCAL train end-to-end.
- Channels whose host tooling is absent here (brew, winget, dmg, rpm) are
  authored but UNVERIFIED — see packaging/README.md's verification matrix.
- The bootstrap signing key is generated at pack time (session-bound
  pattern, disclosed in dist/VERIFY.md) until the Founder key ceremony (F-3).
`;
}

/* ────────────────────────────  the runner  ──────────────────────────── */

export async function runRehearsal(opts: { ref: string }): Promise<RehearsalOutcome> {
  const ref = opts.ref;
  const commit = commitOf(ref);
  const engineVersion = engineVersionOfRecord();
  const steps: RehearsalStep[] = [];

  const timed = async (step: RehearsalStepId, body: () => Promise<{ ok: boolean; evidence: string }>): Promise<boolean> => {
    const t0 = Date.now();
    const result = await body();
    steps.push({ step, ok: result.ok, durationMs: Date.now() - t0, evidence: result.evidence });
    return result.ok;
  };

  // 1 — verification record (fail-closed, cheap).
  const recordOk = await timed("verification-record", async () => checkVerificationRecord());

  // 2 — the signed artifact set at the departure ref.
  let packOk = false;
  if (recordOk) {
    packOk = await timed("release-pack", async () => {
      const r = run(["bun", "run", join(ROOT, "tools", "dist-pack.ts"), "--ref", ref]);
      return { ok: r.ok, evidence: r.ok ? `dist/ artifact set packed at ${ref} (${lastLine(r.out).slice(0, 120)})` : lastLine(r.out).slice(0, 300) };
    });
  } else {
    steps.push({ step: "release-pack", ok: false, durationMs: 0, evidence: "skipped — the train never departed (red verification record)" });
  }

  // 3 — the consumer trust chain.
  let chainOk = false;
  if (packOk) {
    chainOk = await timed("trust-chain", async () => {
      const r = run(["bun", "run", join(ROOT, "tools", "dist-verify.ts"), "--manifest", "dist/MANIFEST.json", "--sig", "dist/MANIFEST.json.sig", "--pub", "keys/release-signing.pub"]);
      return { ok: r.ok, evidence: r.ok ? lastLine(r.out).slice(0, 160) : r.out.slice(0, 300) };
    });
  } else {
    steps.push({ step: "trust-chain", ok: false, durationMs: 0, evidence: "skipped — no artifact set" });
  }

  // 4 — the npm tarball.
  const npmPackStep = async (): Promise<boolean> => {
    if (!chainOk) {
      steps.push({ step: "npm-pack", ok: false, durationMs: 0, evidence: "skipped — the trust chain failed" });
      return false;
    }
    return timed("npm-pack", async () => {
      const r = run(["sh", join(ROOT, "packaging", "npm", "make-package.sh"), join(ROOT, "dist", "npm")]);
      const tgzLine = r.out.split("\n").find((l) => l.startsWith("make-package: ") && l.trim().endsWith(".tgz")) ?? "";
      return { ok: r.ok && tgzLine.length > 0, evidence: r.ok ? tgzLine.replace("make-package: ", "") : r.out.slice(0, 300) };
    });
  };
  const npmPackOk = await npmPackStep();

  // 5–9 — install, exercise the INSTALLED vae, uninstall. Scratch only.
  let scratch: string | null = null;
  const tgz = join(ROOT, "dist", "npm", `vaerion-${engineVersion}.tgz`);

  if (!npmPackOk) {
    for (const step of ["npm-install", "installed-version", "installed-init", "installed-center", "npm-uninstall"] as const) {
      steps.push({ step, ok: false, durationMs: 0, evidence: "skipped — no npm tarball" });
    }
  } else {
    scratch = await mkdtemp(join(tmpdir(), "vae-rehearsal-"));
    const binVae = join(scratch, "bin", "vae");
    const installed = await timed("npm-install", async () => {
      const r = run(["npm", "install", "-g", "--prefix", scratch!, tgz], { timeoutMs: 300_000 });
      return { ok: r.ok && existsSync(binVae), evidence: r.ok ? "installed into the scratch prefix; bin present" : r.out.slice(0, 300) };
    });

    if (installed) {
      await timed("installed-version", async () => {
        const r = run([binVae, "version", "--json"], { timeoutMs: 120_000 });
        let reported: string | null = null;
        try {
          const jsonLines = r.out.split("\n").filter((l) => l.trim().startsWith("{"));
          const parsed = JSON.parse(jsonLines[jsonLines.length - 1] ?? "{}") as Record<string, unknown>;
          if (typeof parsed.version === "string") reported = parsed.version;
        } catch {
          reported = null;
        }
        return { ok: r.ok && reported === engineVersion, evidence: `installed vae reported ${reported ?? "no version"}; engine version of record ${engineVersion}` };
      });

      const ws = join(scratch, "workspace");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(ws, { recursive: true });

      await timed("installed-init", async () => {
        // `vae init` scaffolds its CWD by law (no positional path) — the
        // runner obeys the ratified surface: run it inside the fresh dir.
        const r = run([binVae, "init"], { cwd: ws, timeoutMs: 120_000 });
        const scaffolded = existsSync(join(ws, "vaerion.yaml"));
        return { ok: r.ok && scaffolded, evidence: scaffolded ? "workspace scaffolded by the installed CLI in its cwd (vaerion.yaml present)" : `init failed: ${r.out.slice(0, 200)}` };
      });

      await timed("installed-center", async () => {
        const r = run([binVae, "center", "--json"], { cwd: ws, timeoutMs: 120_000 });
        return { ok: r.ok, evidence: r.ok ? "installed vae center --json exit 0 over the fresh scaffold (honest zeros)" : r.out.slice(0, 200) };
      });
    }

    await timed("npm-uninstall", async () => {
      if (!installed) return { ok: false, evidence: "not installed — nothing to uninstall" };
      const r = run(["npm", "uninstall", "-g", "--prefix", scratch!, "vaerion"], { timeoutMs: 120_000 });
      const binGone = !existsSync(binVae);
      return { ok: r.ok && binGone, evidence: binGone ? "uninstalled; bin removed — nothing left behind" : `uninstall incomplete (bin still present): ${r.out.slice(0, 200)}` };
    });
  }

  // Cleanup — the rehearsal leaves no scratch behind.
  if (scratch) await rm(scratch, { recursive: true, force: true });

  const passed = steps.every((s) => s.ok);
  return { ref, commit, engineVersion, passed, steps };
}

/* ────────────────────────────  the entry  ──────────────────────────── */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const refArg = argv.includes("--ref") ? argv[argv.indexOf("--ref") + 1] : undefined;
  const asJson = argv.includes("--json");
  const ref = refArg ?? latestReleaseTag();

  const outcome = await runRehearsal({ ref });
  const generatedAt = new Date().toISOString();

  if (asJson) {
    console.log(JSON.stringify({ ...outcome, generatedAt }, null, 2));
  } else {
    for (const s of outcome.steps) {
      console.log(`${s.ok ? "✅" : "❌"} ${s.step} (${s.durationMs}ms) — ${s.evidence}`);
    }
    console.log(`\nrehearsal: ${outcome.passed ? "PASSED" : "FAILED"} — ref ${outcome.ref} @ ${outcome.commit.slice(0, 12)} (v${outcome.engineVersion})`);
  }

  // The report of record — committed as GA evidence (Phase 10 reads it).
  const report = buildReport(outcome, generatedAt);
  await writeFile(join(ROOT, "docs", "ga", "RELEASE-TRAIN-REHEARSAL.md"), report, "utf8");
  process.exit(outcome.passed ? 0 : 1);
}

// CLI entry; tests import the pure pieces (plan, record check, report builder).
if (import.meta.main) await main();
