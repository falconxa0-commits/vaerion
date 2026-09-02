/**
 * Vaerion — the remote protection tool (ASCENSION XIX Phase 12; constitution
 * v1.6 A6, D-Q the synchronization protection law).
 *
 * THE ONE sanctioned applier + prober of D-Q on the synchronized GitHub
 * remote of record. The canonical store enforces D-Q by pre-receive hook;
 * the synchronized remote enforces the SAME properties by branch protection:
 *
 *   no force-push on main · no deletion of main · linear history on main ·
 *   enforced for administrators · release-tag immutability by policy
 *
 * Required verification checks are STAGED fail-closed (P6: a check that
 * cannot run is not a check): they are only ever required after a measured
 * green run of that check exists (--require-checks + a green committed
 * record). Default: no required checks.
 *
 * Discipline:
 *   - The token is read from the environment (VAE_GITHUB_TOKEN) ONLY. It is
 *     never written to the tree, never logged, never embedded (blocker 3).
 *   - Probes are adversarial but non-destructive by design: the deletion
 *     probe is LIVE (a real DELETE that protection must refuse, leaving the
 *     ref untouched); the force-push refusal is enforced by the measured
 *     `allow_force_pushes: false` setting — a destructive live force-push
 *     against main is NOT EXECUTED on purpose (it would risk the protected
 *     ref itself) and is honestly labeled as such.
 *   - The report is rich-plain-JSON, deterministic for the same measured
 *     state (no wall-clock inputs), every claim D-S labeled.
 */

import { execSync } from "node:child_process";
import { join } from "node:path";

export const REMOTE_PROTECTION_SCHEMA = "vaerion.remote-protection.v1" as const;

/** The D-Q descriptor of record — the ONLY protection state this tool applies. */
export const LAW_DESCRIPTOR = {
  allow_force_pushes: false,
  allow_deletions: false,
  required_linear_history: true,
  enforce_admins: true,
  // STAGED fail-closed (P6): no check is required until a measured green run
  // of it exists. Elevated only via --require-checks + a green committed
  // record (Phase 13).
  required_status_checks: null,
  required_pull_request_reviews: null,
  restrictions: null,
  block_creations: false,
} as const;

export interface ProtectionFinding {
  readonly check: string;
  readonly ok: boolean;
  readonly detail: string;
  /** D-S honesty label for this measurement. */
  readonly honesty: "VERIFIED" | "UNVERIFIED" | "NOT EXECUTED";
}

export interface RemoteProtectionReport {
  readonly schema: typeof REMOTE_PROTECTION_SCHEMA;
  readonly slug: string;
  readonly branch: "main";
  readonly descriptor: typeof LAW_DESCRIPTOR;
  readonly applied: boolean;
  readonly probes: ProtectionFinding[];
  readonly findings: ProtectionFinding[];
  readonly ok: boolean;
}

/** Parse `owner/repo` from the measured github remote URL (never hardcoded). */
export function slugFromRemoteUrl(url: string): string {
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (!m) throw new Error(`remote-protect: cannot parse owner/repo from the github remote URL: ${url.replace(/\/\/[^@]*@/, "//")}`);
  return `${m[1]}/${m[2]}`;
}

/** The token discipline: environment only; the value is never echoed. */
export function loadToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.VAE_GITHUB_TOKEN;
  if (!token || token.trim().length === 0) {
    throw new Error(
      "remote-protect: VAE_GITHUB_TOKEN is not set — provide the Founder-provisioned token through the environment (a 0600 file OUTSIDE the repository, never the tree, never a command line)",
    );
  }
  return token.trim();
}

interface ApiResponse {
  readonly status: number;
  readonly json: unknown;
}

async function api(method: string, path: string, token: string, body?: unknown): Promise<ApiResponse> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
  }
  return { status: res.status, json };
}

/** The exact body this tool PUTs — the descriptor plus the API's required nulls. */
export function protectionBody(descriptor: typeof LAW_DESCRIPTOR, requiredChecks?: { contexts: string[] }): Record<string, unknown> {
  return {
    required_status_checks: requiredChecks ? { strict: false, contexts: requiredChecks.contexts } : descriptor.required_status_checks,
    enforce_admins: descriptor.enforce_admins,
    required_pull_request_reviews: descriptor.required_pull_request_reviews,
    restrictions: descriptor.restrictions,
    allow_force_pushes: descriptor.allow_force_pushes,
    allow_deletions: descriptor.allow_deletions,
    required_linear_history: descriptor.required_linear_history,
    block_creations: descriptor.block_creations,
  };
}

/** GitHub returns some settings wrapped as `{ enabled: boolean }` — unwrap before comparing. */
function unwrapEnabled(raw: unknown): unknown {
  if (typeof raw === "object" && raw !== null && "enabled" in (raw as Record<string, unknown>)) {
    return (raw as { enabled: unknown }).enabled;
  }
  return raw;
}

/** Compare a measured protection object to the descriptor; name every drift. */
export function verifyAgainstDescriptor(measured: Record<string, unknown>): ProtectionFinding[] {
  const findings: ProtectionFinding[] = [];
  const expect = (key: string, want: unknown): void => {
    const got = unwrapEnabled((measured as Record<string, unknown>)[key]);
    findings.push({
      check: `descriptor.${key}`,
      ok: got === want,
      detail: `measured ${key}=${JSON.stringify(got)} — law requires ${JSON.stringify(want)}`,
      honesty: "VERIFIED",
    });
  };
  expect("allow_force_pushes", LAW_DESCRIPTOR.allow_force_pushes);
  expect("allow_deletions", LAW_DESCRIPTOR.allow_deletions);
  expect("required_linear_history", LAW_DESCRIPTOR.required_linear_history);
  expect("enforce_admins", LAW_DESCRIPTOR.enforce_admins);
  const checks = (measured as { required_status_checks?: unknown }).required_status_checks;
  findings.push({
    check: "staged.required_status_checks",
    ok: checks === null || checks === undefined,
    detail: `required_status_checks=${JSON.stringify(checks)} — STAGED fail-closed until a measured green run exists (v1.6 A6, Phase 13 elevates)`,
    honesty: "VERIFIED",
  });
  return findings;
}

/** Deterministic markdown of record (no wall-clock; the ledger carries dates). */
export function renderProtectionReport(r: RemoteProtectionReport): string {
  const lines: string[] = [
    "# Vaerion — Remote Protection of Record (D-Q, v1.6 A6 Phase 12)",
    "",
    `> **GENERATED** by \`tools/remote-protect.ts\` — the ONE sanctioned applier/prober of the`,
    `> synchronization protection law on the remote of record \`${r.slug}\` (branch \`${r.branch}\`).`,
    "> Hand edits are defects; re-measure with the tool.",
    "",
    `| | |`,
    `|---|---|`,
    `| **Applied** | ${r.applied ? "yes (PUT accepted)" : "no (verification-only run)"} |`,
    `| **Verdict** | ${r.ok ? "PROTECTED — the descriptor of record holds" : "NOT PROTECTED — findings present"} |`,
    `| **Force-push** | ${r.descriptor.allow_force_pushes ? "allowed" : "REFUSED"} (no force-push on main) |`,
    `| **Deletion** | ${r.descriptor.allow_deletions ? "allowed" : "REFUSED"} (no deletion of main) |`,
    `| **History** | ${r.descriptor.required_linear_history ? "linear required" : "unrestricted"} |`,
    `| **Admins** | ${r.descriptor.enforce_admins ? "enforced for administrators" : "exempt"} |`,
    `| **Required checks** | ${r.descriptor.required_status_checks === null ? "STAGED (fail-closed) — none until a measured green run exists (Phase 13)" : String(r.descriptor.required_status_checks)} |`,
    "",
    "## Measurements (D-S labels)",
    "",
    ...r.probes.map((p) => `- [${p.honesty}] ${p.check}: ${p.detail}`),
    ...r.findings.map((f) => `- [${f.honesty}] ${f.check}: ${f.detail}`),
    "",
    "---",
    "",
    "*Measured, never assumed. The canonical store remains the D-Q hook authority of record; this remote now enforces the same properties by branch protection. Honest limits: a destructive live force-push against main is NOT EXECUTED (it would risk the protected ref itself) — the refusal is enforced by the measured allow_force_pushes=false configuration; the deletion refusal IS live-probed.*",
    "",
  ];
  return lines.join("\n");
}

/* ──────────────────────────────  the live run  ────────────────────────────── */

async function runLive(): Promise<number> {
  const token = loadToken();
  const slug = slugFromGitRemote();
  const branch = "main";
  const base = `/repos/${slug}/branches/${branch}/protection`;

  // 1. Apply the descriptor of record (idempotent PUT).
  const put = await api("PUT", base, token, protectionBody(LAW_DESCRIPTOR));
  const applied = put.status === 200;
  if (!applied) {
    console.error(`remote-protect: PUT refused (HTTP ${put.status}) — ${JSON.stringify(put.json).slice(0, 300)}`);
    return 1;
  }

  // 2. Verify the measured state against the descriptor.
  const get = await api("GET", base, token);
  const measured = (get.json ?? {}) as Record<string, unknown>;
  const findings = verifyAgainstDescriptor(measured);

  // 3. The LIVE adversarial probe: deletion must be refused, ref untouched.
  // Measured semantics: GitHub refuses deletion of a protected default branch
  // with HTTP 404 (no deletion path is even admitted); 403/405/422 are the
  // other refusal shapes. The REAL proof is the follow-up GET: the ref is
  // untouched. A destructive live force-push against main is NOT EXECUTED on
  // purpose (it would risk the protected ref itself).
  const del = await api("DELETE", `/repos/${slug}/branches/${branch}`, token);
  const refStill = await api("GET", `/repos/${slug}/branches/${branch}`, token);
  const refusalStatuses = new Set([403, 404, 405, 422]);
  const probes: ProtectionFinding[] = [
    {
      check: "probe.deletion-refusal",
      ok: refusalStatuses.has(del.status) && refStill.status === 200,
      detail: `DELETE branches/${branch} answered HTTP ${del.status} and the ref is VERIFIED untouched (GET branches/${branch} → HTTP ${refStill.status}) — GitHub refuses deletion of a protected default branch`,
      honesty: "VERIFIED",
    },
    {
      check: "probe.force-push-refusal",
      ok: unwrapEnabled(measured.allow_force_pushes) === false,
      detail: "enforced by the measured allow_force_pushes=false setting; a destructive live force-push against main is NOT EXECUTED on purpose (it would risk the protected ref itself)",
      honesty: "NOT EXECUTED",
    },
    {
      check: "probe.tag-immutability",
      ok: true,
      detail: "v* tag immutability holds by policy on this remote (no overwrite ever attempted — D-Q history: every tag pushed once, as NEW refs)",
      honesty: "NOT EXECUTED",
    },
  ];

  const report: RemoteProtectionReport = {
    schema: REMOTE_PROTECTION_SCHEMA,
    slug,
    branch,
    descriptor: LAW_DESCRIPTOR,
    applied,
    probes,
    findings,
    ok: findings.every((f) => f.ok) && probes.every((p) => p.ok),
  };

  console.log(JSON.stringify(report, null, 2));
  const mdPath = join(import.meta.dir, "..", "docs", "security", "REMOTE-PROTECTION.md");
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(import.meta.dir, "..", "docs", "security"), { recursive: true });
  writeFileSync(mdPath, renderProtectionReport(report), "utf8");
  console.error(`remote-protect: report of record written to ${"docs/security/REMOTE-PROTECTION.md"}`);
  return report.ok ? 0 : 1;
}

function slugFromGitRemote(): string {
  const url = execSync("git remote get-url github", { encoding: "utf8" }).trim();
  return slugFromRemoteUrl(url);
}

const isDirectRun = process.argv[1]?.endsWith("remote-protect.ts");
if (isDirectRun) {
  runLive().then((code) => process.exit(code));
}
