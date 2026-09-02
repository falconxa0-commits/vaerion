/**
 * Vaerion release readiness (ASCENSION XVIII Phase 8) — the constitutional
 * release evaluator. It answers, measured only (D-S): can this repository
 * ship? Which check blocks? What evidence is missing? What remains?
 *
 * Fail-closed everywhere (P6): a fact that cannot be measured is a finding,
 * never a pass. Honesty labels (D-S) ride on every check: VERIFIED (measured
 * here), UNVERIFIED (authored but not measurable in this environment),
 * NEVER EXECUTED (a path that has never run).
 *
 * The evaluator reuses measured reality; it never re-implements another
 * surface's logic: gates come from the verify.ts record (or a live verify
 * run), CI findings come from repo/ci.ts, git trust from repo/git.ts.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { RATIFIED_IDENTITY, measureRepository } from "./git.ts";
import { validateWorkflows } from "./ci.ts";

export type Honesty = "VERIFIED" | "UNVERIFIED" | "NEVER EXECUTED";

export interface ReadinessCheck {
  check: string;
  ok: boolean;
  severity: "blocker" | "warn" | "info";
  code?: string;
  detail: string;
  fix?: string;
  honesty: Honesty;
}

export interface VersionSurface {
  path: string;
  version: string | null;
}

export interface ReadinessReport {
  root: string;
  ready: boolean;
  verdict: "READY" | "BLOCKED";
  checks: ReadinessCheck[];
  blockers: ReadinessCheck[];
  warnings: ReadinessCheck[];
  passed: number;
  total: number;
  versionSurfaces: VersionSurface[];
}

const VERSION_SURFACES: Array<{ path: string; kind: "json-path" | "json-info" | "toml" }> = [
  { path: "packages/vaerion/package.json", kind: "json-path" },
  { path: "sdks/typescript/package.json", kind: "json-path" },
  { path: "tools/package.json", kind: "json-path" },
  { path: "spec/openapi.json", kind: "json-info" },
  { path: "packaging/python/pyproject.toml", kind: "toml" },
];

async function readVersionSurface(root: string, surface: { path: string; kind: "json-path" | "json-info" | "toml" }): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(join(root, surface.path), "utf8");
  } catch {
    return null;
  }
  if (surface.kind === "toml") {
    const m = /^\s*version\s*=\s*"([^"]+)"/m.exec(text);
    return m?.[1] ?? null;
  }
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    if (surface.kind === "json-info") {
      const info = json["info"] as Record<string, unknown> | undefined;
      return typeof info?.["version"] === "string" ? (info["version"] as string) : null;
    }
    return typeof json["version"] === "string" ? (json["version"] as string) : null;
  } catch {
    return null;
  }
}

interface VerificationRecord {
  ok: boolean;
  gates: Array<{ gate: string; ok: boolean }>;
}

/** Parse the measured verification record (fail-closed: absence is a blocker). */
export async function readVerificationRecord(root: string): Promise<{ record: VerificationRecord | null; detail: string }> {
  let text: string;
  try {
    text = await readFile(join(root, ".vaerion-verification.json"), "utf8");
  } catch {
    return { record: null, detail: "no .vaerion-verification.json at the repository root" };
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const ok = parsed["ok"] === true;
    const gatesRaw = Array.isArray(parsed["gates"]) ? (parsed["gates"] as Array<Record<string, unknown>>) : [];
    const gates = gatesRaw.map((g) => ({ gate: String(g["gate"] ?? "?"), ok: g["ok"] === true }));
    if (gates.length === 0) return { record: null, detail: "verification record has no gate entries" };
    return { record: { ok: ok && gates.every((g) => g.ok), gates }, detail: `verification record present (${gates.length} gates)` };
  } catch {
    return { record: null, detail: "verification record is not parsable JSON" };
  }
}

/** Run the live gates via the single verification authority (the strong evidence).
 *  `argv` is an internal test port (defaults to the authority itself; the CLI
 *  face never overrides it — there is no bypass of tools/verify.ts). */
export async function runLiveGates(root: string, argv: string[] = ["bun", "run", "tools/verify.ts"]): Promise<{ ok: boolean; detail: string; gates: Array<{ gate: string; ok: boolean; durationMs?: number }> }> {
  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn(argv, { cwd: root, stdout: "pipe", stderr: "pipe", stdin: "ignore", timeout: 600_000 });
  } catch (err) {
    return { ok: false, detail: `could not spawn the verification authority: ${(err as Error).message}`, gates: [] };
  }
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const exitCode = await proc.exited;
  void stderr;
  const gates: Array<{ gate: string; ok: boolean; durationMs?: number }> = [];
  for (const m of stdout.matchAll(/===\s+([\w-]+):\s+(GREEN|RED)(?:\s+\((\d+)ms\))?/g)) {
    gates.push({ gate: m[1] ?? "?", ok: m[2] === "GREEN", durationMs: m[3] !== undefined ? parseInt(m[3], 10) : undefined });
  }
  const allGreen = exitCode === 0 && gates.length > 0 && gates.every((g) => g.ok);
  return {
    ok: allGreen,
    detail: allGreen
      ? `live gate run: ALL ${gates.length} GATES GREEN (${gates.map((g) => `${g.gate}${g.durationMs !== undefined ? ` ${g.durationMs}ms` : ""}`).join(", ")})`
      : `live gate run failed (exit ${exitCode}): ${gates.length === 0 ? "no gate output parsed" : gates.filter((g) => !g.ok).map((g) => g.gate).join(", ") + " RED"}`,
    gates,
  };
}

/** The dist/ artifact set of record (dist-pack law). */
const ARTIFACT_SET = ["dist/MANIFEST.json", "dist/MANIFEST.json.sig", "dist/SHA256SUMS", "dist/VERIFY.md"];

export interface ReadinessOptions {
  /** Measure the gates LIVE via tools/verify.ts (slow, strongest evidence). */
  liveGates?: boolean;
}

/**
 * Evaluate release readiness against the measured repository. Zero
 * blockers ⇒ READY. Every check carries an honesty label (D-S).
 */
export async function evaluateReleaseReadiness(cwd: string, opts: ReadinessOptions = {}): Promise<ReadinessReport> {
  const intel = await measureRepository(cwd);
  const root = intel.root;
  const checks: ReadinessCheck[] = [];

  // 1. Verification gates (blocker; §8 blocker 1 + 6).
  if (opts.liveGates === true) {
    const live = await runLiveGates(root);
    checks.push({
      check: "verification-gates", ok: live.ok, severity: "blocker",
      code: live.ok ? undefined : "E2310",
      detail: live.detail,
      fix: live.ok ? undefined : "make the gate run green before any release; the authority is `bun run tools/verify.ts`",
      honesty: "VERIFIED",
    });
  } else {
    const { record, detail } = await readVerificationRecord(root);
    const ok = record !== null && record.ok;
    checks.push({
      check: "verification-gates", ok, severity: "blocker",
      code: ok ? undefined : "E2310",
      detail: ok
        ? `${detail}: ${record!.gates.map((g) => `${g.gate}=${g.ok ? "GREEN" : "RED"}`).join(", ")} (on-disk measured record; freshness relative to HEAD is not git-provable — use --live-gates for live evidence)`
        : `${detail} — gate evidence absent (fail-closed)`,
      fix: ok ? undefined : "run `bun run tools/verify.ts` to produce the measured record, or `vae release readiness --live-gates` to measure now",
      honesty: "VERIFIED",
    });
  }

  // 2. Tree cleanliness (blocker) + conflict state (blocker).
  const dirtyCount = intel.staged.length + intel.unstaged.length + intel.untracked.length;
  checks.push({
    check: "git-tree-clean", ok: dirtyCount === 0 && intel.conflicts.length === 0 && !intel.mergeInProgress && !intel.rebaseInProgress && !intel.cherryPickInProgress,
    severity: "blocker",
    code: dirtyCount > 0 || intel.conflicts.length > 0 ? "E2302" : undefined,
    detail: dirtyCount === 0
      ? "working tree clean (0 staged, 0 unstaged, 0 untracked)"
      : `working tree dirty: ${intel.staged.length} staged, ${intel.unstaged.length} unstaged, ${intel.untracked.length} untracked${intel.conflicts.length > 0 ? `; conflicts: ${intel.conflicts.join(", ")}` : ""}${intel.mergeInProgress ? "; MERGE in progress" : ""}${intel.rebaseInProgress ? "; REBASE in progress" : ""}${intel.cherryPickInProgress ? "; CHERRY-PICK in progress" : ""}`,
    fix: dirtyCount === 0 ? undefined : "commit or stash every change; a release is cut from a clean, fully committed tree",
    honesty: "VERIFIED",
  });

  // 3. Branch state (warn on detached).
  checks.push({
    check: "git-branch", ok: !intel.detached, severity: "warn", code: intel.detached ? "E2300" : undefined,
    detail: `branch ${intel.branch}${intel.bisectInProgress ? " (BISECT in progress)" : ""}`,
    fix: intel.detached ? "checkout a branch; a detached HEAD is reachable from nothing" : undefined,
    honesty: "VERIFIED",
  });

  // 4. HEAD identity (blocker; D-P).
  const headOk = intel.headAuthor !== null && intel.headAuthor.email === RATIFIED_IDENTITY.email && intel.headAuthor.name === RATIFIED_IDENTITY.name;
  checks.push({
    check: "git-identity-head", ok: headOk, severity: "blocker", code: headOk ? undefined : "E2303",
    detail: headOk
      ? `HEAD authored by the ratified identity (${RATIFIED_IDENTITY.name} <${RATIFIED_IDENTITY.email}>)`
      : `HEAD authored ${intel.headAuthor?.name ?? "?"} <${intel.headAuthor?.email ?? "?"}> — not the ratified identity`,
    fix: headOk ? undefined : "commit as Auren <auren@vaerion.dev>; identity governance changes require Founder decision",
    honesty: "VERIFIED",
  });

  // 5. Identity history audit (warn; immutable history is recorded, not rewritten).
  checks.push({
    check: "git-identity-history", ok: intel.identityViolations.length === 0, severity: "warn", code: intel.identityViolations.length > 0 ? "E2303" : undefined,
    detail: intel.identityViolations.length === 0
      ? `all ${intel.auditedCommits} audited commits authored by the ratified identity`
      : `${intel.identityViolations.length} of the last ${intel.auditedCommits} commits predate the ratified identity (recorded; rewrite prohibited by D-P)`,
    fix: undefined,
    honesty: "VERIFIED",
  });

  // 6. Tag binding (blocker).
  const tagOk = intel.releaseTagsAtHead.length > 0;
  checks.push({
    check: "release-tag-binding", ok: tagOk, severity: "blocker", code: tagOk ? undefined : "E2311",
    detail: tagOk ? `HEAD is exactly at release tag(s): ${intel.releaseTagsAtHead.join(", ")}` : "HEAD is not exactly at a v* release tag",
    fix: tagOk ? undefined : "tag the release commit after gates are green and the tree is clean (`git tag -a v<version>`), then pack from the tag",
    honesty: "VERIFIED",
  });

  // 7. Version lockstep (blocker).
  const surfaces: VersionSurface[] = [];
  for (const surface of VERSION_SURFACES) {
    surfaces.push({ path: surface.path, version: await readVersionSurface(root, surface) });
  }
  const present = surfaces.filter((s) => s.version !== null);
  const distinct = [...new Set(present.map((s) => s.version))];
  const lockOk = present.length > 0 && distinct.length === 1;
  checks.push({
    check: "version-lockstep", ok: lockOk, severity: "blocker", code: lockOk ? undefined : "E2309",
    detail: present.length === 0
      ? "no version surfaces found to compare"
      : lockOk
        ? `all ${present.length} version surfaces agree: ${distinct[0]}`
        : `version surfaces disagree: ${present.map((s) => `${s.path}=${s.version}`).join(", ")}${surfaces.some((s) => s.version === null) ? `; absent/unparsable: ${surfaces.filter((s) => s.version === null).map((s) => s.path).join(", ")}` : ""}`,
    fix: lockOk ? undefined : "align every version surface to the release version (lockstep is a release blocker)",
    honesty: "VERIFIED",
  });

  // 8. CI validity (blocker when invalid; warn when absent).
  const ci = await validateWorkflows(root);
  const blockingCi = ci.findings.filter((f) => f.severity === "blocker");
  if (ci.files.length === 0) {
    checks.push({
      check: "ci-validity", ok: false, severity: "warn",
      detail: "no CI workflows discovered under .github/workflows — the remote verification projection is absent (D-R)",
      fix: "provision a workflow that runs `bun run tools/verify.ts` on every push and PR",
      honesty: "VERIFIED",
    });
  } else {
    checks.push({
      check: "ci-validity", ok: blockingCi.length === 0, severity: blockingCi.length === 0 ? "info" : "blocker",
      code: blockingCi.length === 0 ? undefined : "E2304",
      detail: blockingCi.length === 0
        ? `${ci.files.length} workflow(s) validated: ${ci.files.map((f) => f.split("/").slice(-1)[0]).join(", ")}`
        : `${blockingCi.length} CI finding(s): ${blockingCi.map((f) => `${f.file.split("/").slice(-1)[0]}: ${f.detail}`).join(" | ")}`,
      fix: blockingCi.length === 0 ? undefined : "fix the structural findings; CI is the remote projection of the single verification authority",
      honesty: "VERIFIED",
    });
  }

  // 9. Canonical sync + protection (warn when unreachable; measured when local).
  if (intel.canonical === null) {
    checks.push({ check: "canonical-sync", ok: false, severity: "warn", detail: "canonical state not measured (no remote measurement attempted)", honesty: "UNVERIFIED" });
  } else if (!intel.canonical.configured) {
    checks.push({
      check: "canonical-sync", ok: false, severity: "warn",
      detail: intel.canonical.detail,
      fix: "provision the canonical store (protected main, immutable v* tags) and push the release commit + tag",
      honesty: "VERIFIED",
    });
  } else if (!intel.canonical.reachable) {
    checks.push({
      check: "canonical-sync", ok: false, severity: "warn",
      detail: intel.canonical.detail,
      fix: "restore/re-provision the canonical store, then push; until then the release trust chain is local-only",
      honesty: "UNVERIFIED",
    });
  } else {
    const syncOk = intel.canonical.mainInSync === true && intel.canonical.headTagPushed !== false && intel.canonical.protectionHook === "verified";
    checks.push({
      check: "canonical-sync", ok: syncOk, severity: syncOk ? "info" : "warn", code: syncOk ? undefined : "E2303",
      detail: intel.canonical.detail,
      fix: syncOk ? undefined : "push main + the release tag to canonical and verify the pre-receive protection law",
      honesty: "VERIFIED",
    });
  }

  // 10. Packed, signed artifact set (blocker).
  const artifactResults: Array<{ path: string; present: boolean }> = [];
  for (const rel of ARTIFACT_SET) {
    try {
      await readFile(join(root, rel));
      artifactResults.push({ path: rel, present: true });
    } catch {
      artifactResults.push({ path: rel, present: false });
    }
  }
  const artifactsOk = artifactResults.every((a) => a.present);
  checks.push({
    check: "release-artifacts", ok: artifactsOk, severity: "blocker", code: artifactsOk ? undefined : "E2312",
    detail: artifactsOk
      ? `packed artifact set present: ${ARTIFACT_SET.join(", ")} (structural presence — cryptographic verification runs via tools/dist-verify.ts)`
      : `artifact set incomplete: ${artifactResults.filter((a) => !a.present).map((a) => a.path).join(", ")} missing`,
    fix: artifactsOk ? undefined : "pack from the release tag with `bun run tools/dist-pack.ts --ref <tag>` (fail-closed), then verify with tools/dist-verify.ts",
    honesty: "VERIFIED",
  });

  // 11. Worklog phase ledger (info; D-T).
  let worklogDetail = "worklog.md absent — the phase ledger of record is missing";
  let worklogOk = false;
  try {
    const wl = await readFile(join(root, "worklog.md"), "utf8");
    const ids = [...wl.matchAll(/^Task ID:\s*(.+)$/gm)].map((m) => m[1]?.trim() ?? "");
    worklogOk = ids.length > 0;
    worklogDetail = ids.length > 0
      ? `phase ledger present: ${ids.length} recorded task(s); latest: "${ids[ids.length - 1]}" (D-T: claims without repository evidence are not status)`
      : "worklog.md exists but records no Task ID entries";
  } catch {
    worklogOk = false;
  }
  checks.push({ check: "worklog-ledger", ok: worklogOk, severity: "info", detail: worklogDetail, fix: worklogOk ? undefined : "record completed work in worklog.md with evidence (commit, gates, artifacts)", honesty: "VERIFIED" });

  // 12. Truthful reports present (warn; §8 blocker 7).
  const reportFiles = ["VERIFICATION_REPORT.md", "ROADMAP_PROGRESS.md"];
  const reportPresence: string[] = [];
  for (const rel of reportFiles) {
    try {
      await readFile(join(root, rel));
      reportPresence.push(`${rel}=present`);
    } catch {
      reportPresence.push(`${rel}=MISSING`);
    }
  }
  const reportsOk = reportPresence.every((p) => p.endsWith("present"));
  checks.push({
    check: "reports-present", ok: reportsOk, severity: reportsOk ? "info" : "warn",
    detail: reportsOk ? `truthful reports present: ${reportFiles.join(", ")}` : `reports missing: ${reportPresence.filter((p) => p.endsWith("MISSING")).join(", ")}`,
    fix: reportsOk ? undefined : "regenerate the reports from measured reality before the release verdict",
    honesty: "VERIFIED",
  });

  const blockers = checks.filter((c) => c.severity === "blocker" && !c.ok);
  const warnings = checks.filter((c) => c.severity === "warn" && !c.ok);
  const passed = checks.filter((c) => c.ok).length;
  const ready = blockers.length === 0;
  return {
    root,
    ready,
    verdict: ready ? "READY" : "BLOCKED",
    checks,
    blockers,
    warnings,
    passed,
    total: checks.length,
    versionSurfaces: surfaces,
  };
}
