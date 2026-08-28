/**
 * vae-cli — envelope rendering: one envelope, three renderings (D3.7).
 *
 * Human rendering prioritizes comprehension — verb first, consequence
 * second, next step third (D18.8). Plain rendering is pipe-safe with
 * no color or tabulation. `--json` emits the envelope itself as NDJSON
 * on stdout with diagnostics on stderr (D18.7).
 */

import type { Envelope } from "vae-foundation";
import { EXIT_CODE_NAMES, EXIT_CODES, isVaeError, type Receipt } from "vae-foundation";

export type RenderMode = "human" | "plain" | "json";

export interface RenderContext {
  readonly mode: RenderMode;
  readonly color: boolean;
}

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

function paint(ctx: RenderContext, code: string, text: string): string {
  return ctx.color ? `${code}${text}${RESET}` : text;
}

/** Render one envelope for human/plain consumption. */
export function renderEnvelope(ctx: RenderContext, env: Envelope): string {
  const p = env.payload as Record<string, unknown>;
  switch (env.type) {
    case "workspace.initialized":
      return `${paint(ctx, BOLD, "Initialized")} a Vaerion workspace: ${String(p["project"])} (engine ${String(p["engineVersion"])})`;
    case "run.started":
      return `${paint(ctx, BOLD, "Run started")} — plan ${String(p["plan"])}`;
    case "run.step.decision":
      return `${paint(ctx, DIM, "  decision")} ${String(p["step"])}: ${String(p["outcome"])} (${String(p["reason_code"])})`;
    case "run.step.completed":
      return `${paint(ctx, GREEN, "  ✓")} ${String(p["step"])} — ${String(p["tool"])}`;
    case "run.step.failed":
      return `${paint(ctx, RED, "  ✗")} ${String(p["step"])} — ${String(p["message"] ?? "")}`;
    case "run.completed": {
      const done = String(p["steps_completed"] ?? "?");
      const total = p["steps_total"] !== undefined ? `/${String(p["steps_total"])}` : "";
      return `${paint(ctx, GREEN, "Run completed")} — ${done}${total} steps${p["dry_run"] === true ? " (dry-run)" : ""}`;
    }
    case "run.failed":
      return `${paint(ctx, RED, "Run failed")} — ${String(p["message"] ?? "")}`;
    case "run.resumed":
      return `${paint(ctx, BOLD, "Resumed")} from journal truth — remaining: ${JSON.stringify(p["remaining_steps"] ?? [])}`;
    case "doctor.check":
      return `${paint(ctx, BOLD, "Doctor")}: ${JSON.stringify(p)}`;
    case "journal.entry.appended":
      return `seq ${String(env.seq)} ${env.type}`;
    default:
      return `${env.type}`;
  }
}

/** Render the receipt block — what changed · cost · undo · record (D18.9). */
export function renderReceipt(ctx: RenderContext, receipt: Receipt, dryRun: boolean): string[] {
  const title = dryRun ? paint(ctx, YELLOW, "Receipt (prospective — dry-run, no effect)") : paint(ctx, BOLD, "Receipt");
  const lines: string[] = ["", title, "  what changed:"];
  if (receipt.what_changed.length === 0) {
    lines.push("    (nothing changed)");
  }
  for (const change of receipt.what_changed) {
    lines.push(`    - [${change.action}] ${change.subject}${change.detail !== undefined ? ` — ${change.detail}` : ""}`);
  }
  const cost = Object.entries(receipt.cost)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`);
  lines.push(`  cost: ${cost.length > 0 ? cost.join(" · ") : "none"}`);
  lines.push(`  undo: ${receipt.undo.length > 0 ? receipt.undo.join(" ; ") : "(journals are permanent — no undo, D12.5)"}`);
  const record = Object.entries(receipt.record)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${String(v)}`);
  lines.push(`  record: ${record.length > 0 ? record.join(" · ") : "(none)"}`);
  return lines;
}

/** Render a refusal/error with its Fix line (D18.2: code, one line, Fix). */
export function renderError(ctx: RenderContext, error: unknown): string[] {
  if (isVaeError(error)) {
    return [
      paint(ctx, RED, `${error.code} ${error.message}`),
      paint(ctx, YELLOW, `Fix: ${error.fix}`),
    ];
  }
  const message = error instanceof Error ? error.message : String(error);
  return [paint(ctx, RED, `E5004 ${message}`), paint(ctx, YELLOW, "Fix: This is an engine bug: report it with the journal reference.")];
}

export function renderExitHint(ctx: RenderContext, exitCode: number): string {
  if (exitCode === EXIT_CODES.OK) return "";
  return paint(ctx, DIM, `exit ${exitCode} (${EXIT_CODE_NAMES[exitCode as never] ?? "unknown"})`);
}
