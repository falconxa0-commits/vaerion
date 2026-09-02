/**
 * Vaerion repository intelligence (ASCENSION XVIII Phase 8) — Git as a trust
 * system, measured never assumed (Constitution D-S/D-T).
 *
 * Design laws honored here:
 *   - CLI is the surface; this module owns the measurement (L2 domain logic).
 *   - Read-only: every git invocation is plumbing/porcelain with
 *     `--no-optional-locks` and fixed argv (no shell, no interpolation), so a
 *     measurement can never mutate the repository it measures.
 *   - Determinism: outputs are sorted, formats are pinned, no wall-clock,
 *     no ambient randomness (C2). Findings carry stable E-codes.
 *   - Honesty (D-S): a state that cannot be measured is reported as a finding,
 *     never guessed.
 */

import { stat } from "node:fs/promises";
import { join } from "node:path";
import { VaerionError } from "../kernel/errors.ts";

/** The ratified commit identity (Constitution v1.1, D-P). */
export const RATIFIED_IDENTITY = { name: "Auren", email: "auren@vaerion.dev" } as const;

/** Number of recent commits audited for identity compliance (D-P). */
export const IDENTITY_AUDIT_RANGE = 50;

/** Timeout for any single git subprocess (fail-closed, never hangs). */
const GIT_TIMEOUT_MS = 15_000;

export interface GitInvocation {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * One read-only git invocation with fixed argv. `--no-optional-locks` makes
 * every call observation-only (git will not take optional index locks);
 * `-c` pins kill config-driven output drift (color, quoting, pager).
 */
export async function runGit(root: string, args: string[]): Promise<GitInvocation> {
  const argv = ["git", "--no-optional-locks", "-C", root, "-c", "color.ui=false", "-c", "core.quotepath=false", "-c", "core.pager=cat", ...args];
  const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore", timeout: GIT_TIMEOUT_MS });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { ok: exitCode === 0, stdout, stderr, exitCode };
}

export interface RepoFinding {
  code?: string;
  severity: "blocker" | "warn" | "info";
  detail: string;
  fix?: string;
}

export interface CommitIdentity {
  sha: string;
  name: string;
  email: string;
  subject: string;
}

export interface WorktreeEntry {
  path: string;
  head: string | null;
  bare: boolean;
  detached: boolean;
  branch: string | null;
}

export interface CanonicalState {
  configured: boolean;
  reachable: boolean;
  mainInSync: boolean | null;
  headTagPushed: boolean | null;
  protectionHook: "verified" | "absent" | "unmeasurable" | null;
  detail: string;
}

export interface RepositoryIntel {
  root: string;
  gitDir: string;
  branch: string;
  detached: boolean;
  head: string | null;
  headAuthor: { name: string; email: string } | null;
  headSubject: string | null;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  conflicts: string[];
  mergeInProgress: boolean;
  rebaseInProgress: boolean;
  cherryPickInProgress: boolean;
  bisectInProgress: boolean;
  worktrees: WorktreeEntry[];
  submodules: string[];
  tagsAtHead: string[];
  releaseTagsAtHead: string[];
  identityViolations: CommitIdentity[];
  auditedCommits: number;
  remotes: string[];
  canonical: CanonicalState | null;
  findings: RepoFinding[];
}

/** XY state pairs that mean "unresolved merge conflict" (porcelain v1). */
const CONFLICT_XY = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

async function exists(p: string): Promise<boolean> {
  return stat(p).then(() => true, () => false);
}

/** Discover the repository toplevel; fail-closed with honest E-codes. */
export async function discoverRepository(cwd: string): Promise<{ root: string; gitDir: string }> {
  let gitUsable = false;
  try {
    const probe = await runGit(cwd, ["--version"]);
    gitUsable = probe.ok;
  } catch {
    gitUsable = false;
  }
  if (!gitUsable) {
    throw new VaerionError("E2301", "the git executable is missing or unusable — repository state cannot be measured");
  }
  const top = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) {
    throw new VaerionError("E2300", `not inside a git repository (${cwd}): ${top.stderr.trim().split("\n")[0] ?? "no .git discovered upward"}`);
  }
  const dir = await runGit(cwd, ["rev-parse", "--absolute-git-dir"]);
  if (!dir.ok) {
    throw new VaerionError("E2300", "cannot resolve the git directory of this repository");
  }
  return { root: top.stdout.trim(), gitDir: dir.stdout.trim() };
}

function parseStatusPorcelainZ(out: string): { staged: string[]; unstaged: string[]; untracked: string[]; conflicts: string[] } {
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  const conflicts: string[] = [];
  if (out.length === 0) return { staged, unstaged, untracked, conflicts };
  const fields = out.split("\0");
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i] as string;
    if (entry.length < 4) continue; // trailing empty field
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    // Rename/copy entries carry the original path as the next NUL field.
    if (xy[0] === "R" || xy[0] === "C" || xy[1] === "R" || xy[1] === "C") i++;
    if (CONFLICT_XY.has(xy)) {
      conflicts.push(path);
      continue;
    }
    if (xy === "??") {
      untracked.push(path);
      continue;
    }
    if (xy[0] !== " ") staged.push(path); // index differs from HEAD
    if (xy[1] !== " ") unstaged.push(path); // worktree differs from index
  }
  const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return {
    staged: staged.sort(byName),
    unstaged: unstaged.sort(byName),
    untracked: untracked.sort(byName),
    conflicts: conflicts.sort(byName),
  };
}

function parseWorktrees(out: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const rawLine of out.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { path: line.slice("worktree ".length), head: null, bare: false, detached: false, branch: null };
    } else if (current !== null) {
      if (line.startsWith("HEAD ")) current.head = line.slice("HEAD ".length);
      else if (line === "bare") current.bare = true;
      else if (line === "detached") current.detached = true;
      else if (line.startsWith("branch ")) current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    }
  }
  if (current) entries.push(current);
  return entries;
}

function parseCommits(out: string): CommitIdentity[] {
  const commits: CommitIdentity[] = [];
  for (const line of out.split("\n")) {
    if (line.length === 0) continue;
    const [sha, name, email, subject] = line.split("\0");
    if (!sha || sha.length === 0) continue;
    commits.push({ sha, name: name ?? "", email: email ?? "", subject: subject ?? "" });
  }
  return commits;
}

/**
 * Measure the canonical remote — reachability, main sync, HEAD-tag push,
 * and the pre-receive protection hook (D-Q). Every unmeasurable fact is
 * reported honestly, never guessed.
 */
export async function measureCanonical(root: string, head: string | null, tagsAtHead: string[]): Promise<CanonicalState | null> {
  const remotes = await runGit(root, ["remote"]);
  const names = remotes.stdout.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (!names.includes("canonical")) {
    return {
      configured: false, reachable: false, mainInSync: null, headTagPushed: null, protectionHook: null,
      detail: "no `canonical` remote configured — the trust chain is local-only (D-Q governs the canonical store once provisioned)",
    };
  }
  const urlOf = await runGit(root, ["remote", "get-url", "canonical"]);
  const url = urlOf.ok ? urlOf.stdout.trim() : "";
  const ls = await runGit(root, ["ls-remote", "canonical", "refs/heads/main", ...tagsAtHead.map((t) => `refs/tags/${t}`)]);
  if (!ls.ok) {
    return {
      configured: true, reachable: false, mainInSync: null, headTagPushed: null, protectionHook: null,
      detail: `canonical remote configured (${url || "unresolvable URL"}) but unreachable from this environment — canonical state is UNVERIFIED`,
    };
  }
  let mainRemoteSha: string | null = null;
  const pushedTags = new Set<string>();
  for (const line of ls.stdout.split("\n")) {
    const [sha, ref] = line.split("\t");
    if (!sha || !ref) continue;
    if (ref === "refs/heads/main") mainRemoteSha = sha;
    const tagMatch = /^refs\/tags\/(.+?)(\^\{\})?$/.exec(ref);
    if (tagMatch?.[1]) pushedTags.add(tagMatch[1]);
  }
  const mainInSync = mainRemoteSha !== null && head !== null && mainRemoteSha === head;
  const headTagPushed = tagsAtHead.length > 0 ? tagsAtHead.every((t) => pushedTags.has(t)) : null;

  let protectionHook: CanonicalState["protectionHook"] = null;
  let hookDetail = "";
  if (url.startsWith("/") || url.startsWith("file://")) {
    const hookPath = join(url.startsWith("file://") ? url.slice("file://".length) : url, "hooks", "pre-receive");
    if (await exists(hookPath)) {
      const hook = await runGit(root, ["hash-object", hookPath]); // read the hook WITHOUT executing it
      if (hook.ok) {
        protectionHook = "verified";
        hookDetail = "pre-receive hook present in the canonical store (protection law provisioned)";
      } else {
        protectionHook = "unmeasurable";
        hookDetail = "pre-receive hook present but unreadable in this environment";
      }
    } else {
      protectionHook = "absent";
      hookDetail = "canonical store reachable but NO pre-receive hook found — the protection law (D-Q) is NOT enforced there";
    }
  } else {
    hookDetail = `canonical remote is not local (${url}) — branch protection cannot be measured from here (D-S: UNVERIFIED, never claimed)`;
  }

  const parts = [
    `canonical reachable (${url})`,
    mainInSync ? "remote main == HEAD" : mainRemoteSha === null ? "remote main missing" : `remote main ${mainRemoteSha.slice(0, 12)}… != HEAD ${head?.slice(0, 12) ?? "?"}…`,
    tagsAtHead.length === 0 ? "no release tag at HEAD" : headTagPushed ? `release tag(s) ${tagsAtHead.join(", ")} pushed` : `release tag(s) ${tagsAtHead.join(", ")} NOT pushed`,
    hookDetail,
  ];
  return {
    configured: true, reachable: true, mainInSync, headTagPushed, protectionHook,
    detail: parts.join(" · "),
  };
}

/**
 * Full repository measurement. Throws only when measurement is impossible
 * (E2300 not a repository, E2301 git unavailable); every measured state —
 * including unhealthy ones — is returned as data plus findings.
 */
export async function measureRepository(cwd: string, auditRange: number = IDENTITY_AUDIT_RANGE): Promise<RepositoryIntel> {
  const { root, gitDir } = await discoverRepository(cwd);
  const findings: RepoFinding[] = [];

  const branchOut = await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const rawBranch = branchOut.ok ? branchOut.stdout.trim() : "HEAD";
  const detached = rawBranch === "HEAD" || rawBranch === "";
  const branch = detached ? "(detached)" : rawBranch;
  const headOut = await runGit(root, ["rev-parse", "HEAD"]);
  const head = headOut.ok ? headOut.stdout.trim() : null;
  if (!headOut.ok) findings.push({ severity: "warn", detail: "HEAD cannot be resolved (repository with no commits yet)" });

  let headAuthor: { name: string; email: string } | null = null;
  let headSubject: string | null = null;
  if (head !== null) {
    const headFmt = await runGit(root, ["log", "-1", "--format=%an%x00%ae%x00%s", "HEAD"]);
    if (headFmt.ok) {
      const [name, email, subject] = headFmt.stdout.trim().split("\0");
      headAuthor = { name: name ?? "", email: email ?? "" };
      headSubject = subject ?? "";
    }
  }

  const status = await runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const st = status.ok ? parseStatusPorcelainZ(status.stdout) : { staged: [], unstaged: [], untracked: [], conflicts: [] };
  if (!status.ok) findings.push({ severity: "blocker", code: "E2301", detail: `git status failed: ${status.stderr.trim().split("\n")[0] ?? "unknown error"}`, fix: "ensure the repository is readable; git must be able to measure the tree" });

  const mergeInProgress = await exists(join(gitDir, "MERGE_HEAD"));
  const rebaseInProgress = (await exists(join(gitDir, "rebase-merge"))) || (await exists(join(gitDir, "rebase-apply")));
  const cherryPickInProgress = await exists(join(gitDir, "CHERRY_PICK_HEAD"));
  const bisectInProgress = await exists(join(gitDir, "BISECT_LOG"));

  if (st.conflicts.length > 0 || mergeInProgress || rebaseInProgress || cherryPickInProgress) {
    findings.push({
      severity: "blocker",
      code: "E2302",
      detail: st.conflicts.length > 0
        ? `unresolved conflicts: ${st.conflicts.join(", ")}`
        : `in-progress operation: ${mergeInProgress ? "merge" : rebaseInProgress ? "rebase" : "cherry-pick"}`,
      fix: "resolve or abort the in-progress operation before trusting or releasing this tree",
    });
  }
  if (detached) {
    findings.push({ severity: "warn", detail: "HEAD is detached — commits made here are reachable from nothing", fix: "create or checkout a branch before committing" });
  }

  const wt = await runGit(root, ["worktree", "list", "--porcelain"]);
  const worktrees = wt.ok ? parseWorktrees(wt.stdout) : [];
  if (!wt.ok) findings.push({ severity: "info", detail: "worktree list unavailable (git refused `worktree list`)" });

  const sm = await runGit(root, ["submodule", "status"]);
  const submodules = sm.ok
    ? sm.stdout.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).map((l) => {
        const parts = l.split(" ");
        return parts[1] ?? parts[0] ?? "";
      }).sort()
    : [];

  const tagsOut = await runGit(root, ["tag", "--points-at", "HEAD"]);
  const tagsAtHead = tagsOut.ok ? tagsOut.stdout.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).sort() : [];
  const releaseTagsAtHead = tagsAtHead.filter((t) => /^v\d/.test(t));

  const log = await runGit(root, ["log", "-n", String(auditRange), "--format=%H%x00%an%x00%ae%x00%s"]);
  const recentCommits = log.ok ? parseCommits(log.stdout) : [];
  const identityViolations = recentCommits.filter((c) => c.email !== RATIFIED_IDENTITY.email || c.name !== RATIFIED_IDENTITY.name);
  if (headAuthor !== null && (headAuthor.email !== RATIFIED_IDENTITY.email || headAuthor.name !== RATIFIED_IDENTITY.name)) {
    findings.push({
      severity: "blocker",
      code: "E2303",
      detail: `HEAD is authored ${headAuthor.name} <${headAuthor.email}> — the ratified identity is ${RATIFIED_IDENTITY.name} <${RATIFIED_IDENTITY.email}>`,
      fix: "history is immutable by law (no rewrites); record the violation and remedy identity governance by Founder decision",
    });
  } else if (identityViolations.length > 0) {
    findings.push({
      severity: "warn",
      code: "E2303",
      detail: `${identityViolations.length} of the last ${recentCommits.length} commits predate the ratified identity (recorded, immutable history; D-P)`,
      fix: "Founder-approved decision required for any identity governance change; new commits must use the ratified identity",
    });
  }

  const remotesOut = await runGit(root, ["remote"]);
  const remotes = remotesOut.ok ? remotesOut.stdout.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).sort() : [];
  const canonical = await measureCanonical(root, head, releaseTagsAtHead);

  return {
    root, gitDir, branch, detached, head, headAuthor, headSubject,
    staged: st.staged, unstaged: st.unstaged, untracked: st.untracked, conflicts: st.conflicts,
    mergeInProgress, rebaseInProgress, cherryPickInProgress, bisectInProgress,
    worktrees, submodules,
    tagsAtHead, releaseTagsAtHead,
    identityViolations, auditedCommits: recentCommits.length,
    remotes, canonical, findings,
  };
}
