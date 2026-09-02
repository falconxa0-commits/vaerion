/**
 * Vaerion CI intelligence (ASCENSION XVIII Phase 8) — CI as the remote
 * projection of the single verification authority (Constitution v1.1, D-R).
 *
 * This module never executes a pipeline. It measures workflow structure,
 * validates it against the repository's laws, and SIMULATES trigger/job
 * selection deterministically from the workflow text plus measured git
 * state. Every projection states its own limits (a projection is not an
 * execution — honesty per D-S).
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";

export interface StepDoc {
  name: string | null;
  run: string | null;
  uses: string | null;
  with: Record<string, unknown>;
  env: Record<string, string>;
  ifCond: string | null;
}

export interface JobDoc {
  id: string;
  name: string | null;
  needs: string[];
  ifCond: string | null;
  timeoutMinutes: number | null;
  env: Record<string, string>;
  steps: StepDoc[];
}

export interface WorkflowDoc {
  file: string;
  name: string | null;
  triggers: string[];
  pushBranches: string[] | null;
  pushTags: string[] | null;
  jobs: JobDoc[];
  doc: Record<string, unknown>;
}

export interface CiFinding {
  file: string;
  code: string;
  severity: "blocker" | "warn";
  detail: string;
  fix?: string;
}

export interface WorkflowParse {
  doc: WorkflowDoc | null;
  findings: CiFinding[];
}

const WORKFLOW_EXTENSIONS = [".yml", ".yaml"];

/** Discover workflow files under .github/workflows (sorted, deterministic). */
export async function discoverWorkflows(root: string): Promise<string[]> {
  const dir = join(root, ".github", "workflows");
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => WORKFLOW_EXTENSIONS.some((ext) => n.endsWith(ext)))
    .sort()
    .map((n) => join(dir, n));
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asEnv(v: unknown): Record<string, string> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = typeof val === "string" ? val : JSON.stringify(val) ?? "";
  }
  return out;
}

function asStringArray(v: unknown): string[] | null {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") return [v];
  return null;
}

/** Parse one workflow file. Unparsable input is a finding, never a crash. */
export function parseWorkflow(file: string, text: string): WorkflowParse {
  const findings: CiFinding[] = [];
  let raw: unknown;
  try {
    raw = YAML.parse(text);
  } catch (err) {
    findings.push({
      file, code: "E2307", severity: "blocker",
      detail: `workflow does not parse as YAML: ${(err as Error).message.split("\n")[0]}`,
      fix: "fix the YAML syntax error; an unparsable pipeline cannot be validated or simulated",
    });
    return { doc: null, findings };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    findings.push({ file, code: "E2307", severity: "blocker", detail: "workflow is not a YAML mapping", fix: "the top level of a workflow must be a mapping (name/on/jobs)" });
    return { doc: null, findings };
  }
  const doc = raw as Record<string, unknown>;

  // `on` — YAML 1.2 keeps the string key; older parsers coerce to boolean true. Handle both honestly.
  const onRaw = doc["on"] ?? doc[true as unknown as string];
  const triggers: string[] = [];
  let pushBranches: string[] | null = null;
  let pushTags: string[] | null = null;
  if (typeof onRaw === "string") {
    triggers.push(onRaw);
  } else if (Array.isArray(onRaw)) {
    for (const t of onRaw) if (typeof t === "string") triggers.push(t);
  } else if (onRaw !== null && typeof onRaw === "object") {
    for (const [t, spec] of Object.entries(onRaw as Record<string, unknown>)) {
      triggers.push(t);
      if (t === "push" && spec !== null && typeof spec === "object" && !Array.isArray(spec)) {
        const push = spec as Record<string, unknown>;
        pushBranches = asStringArray(push["branches"]);
        pushTags = asStringArray(push["tags"]);
      }
    }
  }
  if (triggers.length === 0) {
    findings.push({ file, code: "E2304", severity: "blocker", detail: "workflow declares no triggers (`on:` missing or empty)", fix: "declare the events that should run this pipeline" });
  }

  const jobsRaw = doc["jobs"];
  const jobs: JobDoc[] = [];
  if (jobsRaw === null || typeof jobsRaw !== "object" || Array.isArray(jobsRaw) || Object.keys(jobsRaw as Record<string, unknown>).length === 0) {
    findings.push({ file, code: "E2304", severity: "blocker", detail: "workflow declares no jobs (`jobs:` missing or empty)", fix: "a pipeline without jobs cannot verify anything" });
  } else {
    for (const [id, jobRaw] of Object.entries(jobsRaw as Record<string, unknown>)) {
      const job = (jobRaw ?? {}) as Record<string, unknown>;
      const stepsRaw = Array.isArray(job["steps"]) ? job["steps"] : null;
      const steps: StepDoc[] = [];
      if (stepsRaw === null) {
        findings.push({ file, code: "E2304", severity: "blocker", detail: `job "${id}" has no steps array`, fix: "every job must declare steps" });
      } else if (stepsRaw.length === 0) {
        findings.push({ file, code: "E2304", severity: "blocker", detail: `job "${id}" has an empty steps array`, fix: "a job that runs nothing should not exist" });
      } else {
        for (const s of stepsRaw) {
          const step = (s ?? {}) as Record<string, unknown>;
          steps.push({
            name: asString(step["name"]),
            run: asString(step["run"]),
            uses: asString(step["uses"]),
            with: (step["with"] ?? {}) as Record<string, unknown>,
            env: asEnv(step["env"]),
            ifCond: asString(step["if"]),
          });
        }
      }
      jobs.push({
        id,
        name: asString(job["name"]),
        needs: asStringArray(job["needs"]) ?? [],
        ifCond: asString(job["if"]),
        timeoutMinutes: typeof job["timeout-minutes"] === "number" ? (job["timeout-minutes"] as number) : null,
        env: asEnv(job["env"]),
        steps,
      });
    }
  }

  return {
    doc: {
      file,
      name: asString(doc["name"]),
      triggers: triggers.sort(),
      pushBranches,
      pushTags,
      jobs,
      doc,
    },
    findings,
  };
}

const GATE_SIGNATURE = /\btsc\b|--noEmit|\bbun test\b|layerlint|constitutional-check|\beslint\b/;
const VERIFY_AUTHORITY = /tools[/\\](verify|dist-pack)\.ts/;

/**
 * Structural validation of one parsed workflow against the repository laws:
 * shape (E2304), the single verification authority (E2305, D-R), the
 * step-own-env-in-if drift class (E2306 — the measured GitHub Actions
 * semantic defect), supply-chain pins, and secret hygiene.
 */
export function validateWorkflowDoc(doc: WorkflowDoc): CiFinding[] {
  const findings: CiFinding[] = [];
  const file = doc.file;

  let verifyAuthority = false;
  let verificationIntent = false;

  for (const job of doc.jobs) {
    if (job.timeoutMinutes === null) {
      findings.push({ file, code: "E2304", severity: "warn", detail: `job "${job.id}" declares no timeout-minutes (GitHub defaults to 360)`, fix: "pin timeout-minutes so a hung runner fails instead of billing for an hour" });
    }
    for (const step of job.steps) {
      if (step.run !== null) {
        if (VERIFY_AUTHORITY.test(step.run)) verifyAuthority = true;
        if (GATE_SIGNATURE.test(step.run)) verificationIntent = true;
        if (/\becho\b/.test(step.run) && /\$\{\{\s*secrets\./.test(step.run)) {
          findings.push({ file, code: "E2304", severity: "warn", detail: `step "${step.name ?? job.id}" echoes secret material into a potential log surface`, fix: "pass secrets via `env:` indirection and never echo them (the environment is not the log)" });
        }
      }
      if (step.uses !== null && /oven-sh\/setup-bun/.test(step.uses)) {
        const pinned = typeof step.with["bun-version"] === "string" && (step.with["bun-version"] as string).length > 0;
        if (!pinned) {
          findings.push({ file, code: "E2304", severity: "warn", detail: `setup-bun in job "${job.id}" has no pinned bun-version`, fix: "pin the substrate version — the same version verified locally must verify remotely" });
        }
      }
      // E2306 — a step's own env is invisible to its own `if`.
      if (step.ifCond !== null) {
        for (const m of step.ifCond.matchAll(/\benv\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
          const varName = m[1] ?? "";
          if (Object.prototype.hasOwnProperty.call(step.env, varName)) {
            findings.push({
              file, code: "E2306", severity: "blocker",
              detail: `step "${step.name ?? job.id}" reads env.${varName} in its \`if:\`, but env.${varName} is defined in that same step's env — the condition cannot see it and is permanently false`,
              fix: `move the decision into the shell (if [ -n "\$${varName}" ]; then ... fi) or hoist the variable to job/workflow level`,
            });
          }
        }
      }
    }
    // Job-level `if` vs job-level env is legitimate (both are visible); step
    // `if` vs JOB-level env is also legitimate. Only the same-scope pairing drifts.
    if (job.ifCond !== null && job.steps.length > 0) {
      for (const m of job.ifCond.matchAll(/\benv\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        const varName = m[1] ?? "";
        if (Object.prototype.hasOwnProperty.call(job.env, varName)) {
          findings.push({
            file, code: "E2306", severity: "blocker",
            detail: `job "${job.id}" reads env.${varName} in its \`if:\`, but env.${varName} is defined in that same job's env — job-level if is evaluated before the job's env exists, so the condition is permanently false`,
            fix: `hoist the variable to workflow level, or make the decision inside a step's shell`,
          });
        }
      }
    }
  }

  if (verificationIntent && !verifyAuthority) {
    findings.push({
      file, code: "E2305", severity: "blocker",
      detail: "workflow runs gate logic (typecheck/tests/lint signatures) without invoking the single verification authority (tools/verify.ts)",
      fix: "make every verification surface run `bun run tools/verify.ts` — no surface may re-implement the verification gates (Constitution D-R)",
    });
  }
  return findings;
}

/** Validate every discovered workflow file. */
export async function validateWorkflows(root: string): Promise<{ files: string[]; docs: WorkflowDoc[]; findings: CiFinding[] }> {
  const files = await discoverWorkflows(root);
  const docs: WorkflowDoc[] = [];
  const findings: CiFinding[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const parsed = parseWorkflow(file, text);
    findings.push(...parsed.findings);
    if (parsed.doc !== null) {
      docs.push(parsed.doc);
      findings.push(...validateWorkflowDoc(parsed.doc));
    }
  }
  return { files, docs, findings };
}

/* ─────────────────────────────  simulation  ───────────────────────────── */

export type SimEvent = "push" | "pull_request" | "workflow_dispatch" | "tag";

export interface JobProjection {
  job: string;
  wouldRun: boolean;
  reason: string;
  steps: Array<{ kind: "run" | "uses"; detail: string; name: string | null }>;
}

export interface WorkflowProjection {
  file: string;
  triggered: boolean;
  reason: string;
  jobs: JobProjection[];
}

/** Compile a workflow glob like `v*` to an anchored regex (no shell). */
function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`);
}

function refMatches(patterns: string[] | null, value: string | null): boolean {
  if (patterns === null || value === null) return false;
  return patterns.some((p) => globToRegex(p).test(value));
}

/**
 * Evaluate a job-level `if:` against measured facts. Only a small whitelist
 * of expressions is recognized; anything else projects to NOT RUN with an
 * honest reason (fail-closed projection — we never guess a pipeline).
 */
function evaluateJobIf(cond: string, ctx: { event: SimEvent; tagRef: string | null; branch: string | null }): "run" | "skip" | "unknown" {
  const normalized = cond.trim().replace(/^\$\{\{/, "").replace(/\}\}$/, "").trim();
  if (/^startsWith\(\s*github\.ref\s*,\s*['"]refs\/tags\//.test(normalized)) {
    return ctx.tagRef !== null ? "run" : "skip";
  }
  const eventEq = /^github\.event_name\s*==\s*['"]([^'"]+)['"]$/.exec(normalized);
  if (eventEq) return eventEq[1] === ctx.event ? "run" : "skip";
  if (normalized === "success()" || normalized === "") return "run";
  return "unknown";
}

/**
 * Deterministic pipeline projection: which workflows trigger, which jobs
 * run, and why. Assumes every run job succeeds (stated in the output) —
 * this is a projection of trigger/condition structure, never an execution.
 */
export function simulateWorkflow(
  doc: WorkflowDoc,
  event: SimEvent,
  ctx: { tagRef: string | null; branch: string | null },
): WorkflowProjection {
  let triggered = false;
  let reason = "";
  if (event === "push" || event === "tag") {
    const pushTriggers = doc.triggers.includes("push");
    if (event === "tag") {
      // GitHub semantics: a tag push matches declared tag filters; a
      // branch-filtered push (no tags key) does NOT run for tags; a bare
      // `on: push` (no filters at all) runs for every ref.
      if (!pushTriggers) {
        triggered = false;
        reason = "workflow does not listen to push events";
      } else if (doc.pushTags !== null) {
        triggered = refMatches(doc.pushTags, ctx.tagRef);
        reason = triggered
          ? `push trigger tag pattern matches refs/tags/${ctx.tagRef ?? "(unmeasured)"}`
          : `push trigger tag patterns do not match refs/tags/${ctx.tagRef ?? "(unmeasured)"}`;
      } else if (doc.pushBranches !== null) {
        triggered = false;
        reason = "push trigger filters branches only — tag pushes do not trigger it";
      } else {
        triggered = true;
        reason = `bare push trigger — runs for every ref, including refs/tags/${ctx.tagRef ?? "(unmeasured)"}`;
      }
    } else {
      const unfiltered = doc.pushBranches === null && doc.pushTags === null;
      const branchOk = refMatches(doc.pushBranches, ctx.branch);
      const tagOk = ctx.tagRef !== null && refMatches(doc.pushTags, ctx.tagRef);
      triggered = pushTriggers && (unfiltered || branchOk || tagOk);
      reason = !pushTriggers
        ? "workflow does not listen to push events"
        : triggered
          ? tagOk
            ? `push trigger tag pattern matches refs/tags/${ctx.tagRef}`
            : unfiltered
              ? "bare push trigger — runs for every ref"
              : `push trigger branches match ${ctx.branch ?? "(unmeasured)"}`
          : `push trigger patterns do not match branch ${ctx.branch ?? "(unmeasured)"}${ctx.tagRef !== null ? ` or tag ${ctx.tagRef}` : ""}`;
    }
  } else {
    triggered = doc.triggers.includes(event);
    reason = triggered ? `workflow listens to ${event}` : `workflow does not listen to ${event}`;
  }

  const jobs: JobProjection[] = doc.jobs.map((job) => {
    let wouldRun = triggered;
    let why: string;
    if (!triggered) {
      why = "workflow not triggered by this event";
    } else {
      const needed = job.needs;
      const needsSat = needed.every((n) => doc.jobs.some((j) => j.id === n)); // structural only; result assumed success by projection
      if (needed.length > 0 && !needsSat) {
        wouldRun = false;
        why = `needs unknown job(s): ${needed.filter((n) => !doc.jobs.some((j) => j.id === n)).join(", ")}`;
      } else if (job.ifCond !== null) {
        const verdict = evaluateJobIf(job.ifCond, { event, tagRef: ctx.tagRef, branch: ctx.branch });
        if (verdict === "unknown") {
          wouldRun = false;
          why = `condition not in the simulation whitelist (fail-closed projection): ${job.ifCond}`;
        } else if (verdict === "skip") {
          wouldRun = false;
          why = `condition evaluated false for this event/ref: ${job.ifCond}`;
        } else {
          why = `condition evaluated true for this event/ref: ${job.ifCond}`;
        }
      } else {
        why = needed.length > 0 ? `needs ${needed.join(", ")} (projected success)` : "unconditional job of a triggered workflow";
      }
    }
    return {
      job: job.id,
      wouldRun,
      reason: why,
      steps: job.steps.map((s) =>
        s.run !== null
          ? { kind: "run" as const, detail: s.run.split("\n")[0] ?? "", name: s.name }
          : { kind: "uses" as const, detail: s.uses ?? "(empty step)", name: s.name },
      ),
    };
  });

  return { file: doc.file, triggered, reason, jobs };
}
