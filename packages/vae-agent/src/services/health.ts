/**
 * vae-agent — HealthService (`vae doctor`, D3.2) and JournalService
 * (`vae journal`) and ExplainService (`vae explain`, D1.3 North Star).
 *
 * Doctor diagnoses environment, configuration, and health with
 * provenance-inspectable output (D19.1). Journal inspection is
 * redacted by default (D12.3). Explain reconstructs the causal story
 * of a run from journal truth — the post-hoc explanation is the
 * North Star (D1.3).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_VERSION, iso, redactPayload, type Json } from "vae-foundation";
import { parseVaerYaml } from "vae-config";
import { readEntries, verifyJournal, type JournalEntry } from "vae-store";
import type { EngineContext } from "../context.ts";
import { auditJournalFile, listBlobRefs, resolveJournalName, runJournalFile } from "../context.ts";
import { runStatus } from "./run.ts";

export interface DoctorCheck {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly fix?: string;
}

export class HealthService {
  constructor(private readonly ctx: EngineContext) {}

  /** Run every check; the envelope carries them all (D17.7). */
  doctor(): { ok: boolean; checks: DoctorCheck[] } {
    const checks: DoctorCheck[] = [];
    const { paths, resolved } = this.ctx;

    checks.push({
      id: "engine.version",
      ok: true,
      detail: `vae ${ENGINE_VERSION} (envelope contract v1, journal format v1)`,
    });

    checks.push({
      id: "workspace.root",
      ok: true,
      detail: paths.root,
    });

    checks.push({
      id: "config.schema",
      ok: true,
      detail: `schemaVersion ${resolved.config.schemaVersion}; project '${resolved.config.project.name}'; fingerprint ${resolved.fingerprint.slice(0, 16)}`,
    });

    // Lock fingerprint must match the live resolution (drift is refused, D12.4 posture).
    if (existsSync(paths.lockFile)) {
      try {
        const lock = JSON.parse(readFileSync(paths.lockFile, "utf8")) as { configFingerprint?: string; engineVersion?: string };
        const match = lock.configFingerprint === resolved.fingerprint;
        checks.push({
          id: "config.lock",
          ok: match,
          detail: match ? `lock fingerprint matches (${resolved.fingerprint.slice(0, 16)})` : `lock fingerprint ${String(lock.configFingerprint).slice(0, 16)} != current ${resolved.fingerprint.slice(0, 16)}`,
          fix: match ? undefined : "Re-pin the lock by re-running `vae init` in a fresh directory or restoring vaerion.yaml; drifted state is refused, never silently accepted (D12.4).",
        });
      } catch {
        checks.push({ id: "config.lock", ok: false, detail: "vaerion.lock is not valid JSON", fix: "Restore or regenerate the lockfile." });
      }
    } else {
      checks.push({ id: "config.lock", ok: false, detail: "vaerion.lock is missing", fix: "Regenerate the lockfile by re-initializing the workspace." });
    }

    // Configuration provenance (D19.1 — inspectable, never silent).
    const provenance = Object.entries(resolved.provenance)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    checks.push({ id: "config.provenance", ok: true, detail: provenance });

    // Audit chain verification (D12.1).
    const auditReport = verifyJournal(auditJournalFile(paths));
    checks.push({
      id: "journal.audit",
      ok: auditReport.ok,
      detail: auditReport.ok ? `audit chain verified (${auditReport.entries} entries, head ${auditReport.head?.slice(0, 16) ?? "empty"})` : `audit chain broken at line ${auditReport.brokenAt?.line}: ${auditReport.brokenAt?.why}`,
      fix: auditReport.ok ? undefined : "Inspect the reported entry; the journal is append-only truth (D12.1).",
    });

    // Run journals.
    const runFiles = existsSync(paths.journalDir) ? readdirSync(paths.journalDir).filter((f) => f.endsWith(".ndjson")) : [];
    let runJournalsOk = true;
    let runDetail = `${runFiles.length} run journal(s)`;
    for (const file of runFiles) {
      const report = verifyJournal(join(paths.journalDir, file));
      if (!report.ok) {
        runJournalsOk = false;
        runDetail = `${file}: ${report.brokenAt?.why}`;
        break;
      }
    }
    checks.push({
      id: "journal.runs",
      ok: runJournalsOk,
      detail: runDetail,
      fix: runJournalsOk ? undefined : "Repair or investigate the corrupted run journal; tampering is detectable by design (D12.1).",
    });

    // Blob references resolve (D9.5).
    const refs = [...listBlobRefs(auditJournalFile(paths)), ...runFiles.flatMap((f) => listBlobRefs(join(paths.journalDir, f)))];
    const missing = refs.filter((ref) => !this.ctx.blobs.exists(ref));
    checks.push({
      id: "blobs.references",
      ok: missing.length === 0,
      detail: missing.length === 0 ? `${refs.length} blob reference(s) resolve` : `missing: ${missing.slice(0, 3).join(", ")}`,
      fix: missing.length === 0 ? undefined : "Restore the blobs or remove references through explicit GC (D9.5, D12.5).",
    });

    // Pairing token hygiene (D17.9 posture, verified early).
    if (existsSync(paths.tokenFile)) {
      const mode = (statSync(paths.tokenFile).mode & 0o777).toString(8);
      const tight = mode === "600";
      checks.push({
        id: "daemon.token",
        ok: tight,
        detail: `pairing token present, mode ${mode}`,
        fix: tight ? undefined : "Tighten the token file permissions to 0600; it authenticates local clients only.",
      });
    } else {
      checks.push({ id: "daemon.token", ok: true, detail: "no pairing token (daemon not started)" });
    }

    // Refusal log readability (the honesty ledger, D2.6).
    const refusals = this.ctx.refusals.all();
    checks.push({ id: "refusals.log", ok: true, detail: `${refusals.length} refusal(s) recorded` });

    return { ok: checks.every((c) => c.ok), checks };
  }
}

export interface RunSummary {
  readonly runId: string;
  readonly status: "completed" | "failed" | "running";
  readonly entries: number;
  readonly head?: string;
  readonly startedAt?: string;
  readonly plan?: string;
}

export class JournalService {
  constructor(private readonly ctx: EngineContext) {}

  /** List all runs with their journal status (redacted summaries, D12.3). */
  listRuns(): RunSummary[] {
    const files = existsSync(this.ctx.paths.journalDir) ? readdirSync(this.ctx.paths.journalDir).filter((f) => f.endsWith(".ndjson")).sort() : [];
    const out: RunSummary[] = [];
    for (const file of files) {
      const runId = file.replace(/\.ndjson$/, "");
      const file2 = runJournalFile(this.ctx.paths, runId);
      const entries = readEntries(file2);
      const started = entries.find((e) => e.type === "run.started");
      out.push({
        runId,
        status: runStatus(entries),
        entries: entries.length,
        head: entries.at(-1)?.hash,
        startedAt: started?.ts,
        plan: started !== undefined ? (started.payload as { plan?: string }).plan : undefined,
      });
    }
    return out;
  }

  /** Journal entries, redacted for rendering (D12.3; the store keeps full truth). */
  entries(selector: string, limit?: number): JournalEntry[] {
    const file = resolveJournalName(this.ctx.paths, selector);
    const entries = readEntries(file);
    const sliced = limit === undefined ? entries : entries.slice(-limit);
    return sliced.map((e) => ({ ...e, payload: redactPayload(e.payload as Json) })) as JournalEntry[];
  }

  /** Verify a journal by selector ("audit" | run id). */
  verify(selector: string): { ok: boolean; entries: number; head?: string; brokenAt?: { seq: number; line: number; why: string } } {
    const file = selector === "audit" ? auditJournalFile(this.ctx.paths) : runJournalFile(this.ctx.paths, selector);
    return verifyJournal(file);
  }
}

export interface Explanation {
  readonly runId: string;
  readonly verdict: string;
  readonly plan?: string;
  readonly timeline: { readonly seq: number; readonly type: string; readonly ts: string; readonly actor: string; readonly cause: string; readonly summary: string }[];
  readonly steps: { readonly step: string; readonly tool?: string; readonly outcome: string }[];
  readonly budget?: Json;
  readonly failure?: Json;
}

export class ExplainService {
  constructor(private readonly ctx: EngineContext) {}

  /**
   * Post-hoc causal explanation of a run (D1.3): the reconstruction is
   * built ONLY from journal truth — the journal is the log (D9.1).
   */
  explain(runId: string): Explanation {
    const file = runJournalFile(this.ctx.paths, runId);
    if (!existsSync(file)) {
      throw Object.assign(new Error(`run '${runId}' not found in this workspace`), { code: "E1006" });
    }
    const entries = readEntries(file);
    const started = entries.find((e) => e.type === "run.started");
    const plan = started !== undefined ? (started.payload as { plan?: string }).plan : undefined;
    const finished = entries.find((e) => e.type === "run.completed" || e.type === "run.failed");

    const timeline = entries.map((e) => ({
      seq: e.seq,
      type: e.type,
      ts: e.ts,
      actor: `${e.actor.kind}:${e.actor.id}`,
      cause: `${e.cause.kind}:${e.cause.ref}`,
      summary: summarize(e),
    }));

    const stepDecisions = entries.filter((e) => e.type === "run.step.decision");
    const steps = stepDecisions.map((e) => {
      const p = e.payload as { step: string; tool?: string; outcome: string };
      const completed = entries.some((c) => c.type === "run.step.completed" && (c.payload as { step: string }).step === p.step);
      return { step: p.step, tool: p.tool, outcome: completed ? "completed" : p.outcome };
    });

    const finishedPayload = finished?.payload as { budget?: Json; failure?: Json } | undefined;

    return {
      runId,
      verdict:
        finished === undefined
          ? "run is in progress or was interrupted; resume it with `vae resume`"
          : finished.type === "run.completed"
            ? "run completed; every journaled step succeeded"
            : "run failed; see the failure entry for the typed reason and next step",
      ...(plan !== undefined ? { plan } : {}),
      timeline,
      steps,
      ...(finishedPayload?.budget !== undefined ? { budget: finishedPayload.budget } : {}),
      ...(finishedPayload?.failure !== undefined ? { failure: finishedPayload.failure } : {}),
    };
  }
}

function summarize(entry: JournalEntry): string {
  const payload = entry.payload as Record<string, unknown>;
  switch (entry.type) {
    case "run.started":
      return `plan '${String(payload["plan"])}' declared with ${JSON.stringify(payload["steps"])}`;
    case "run.step.decision":
      return `broker decision for step '${String(payload["step"])}': ${String(payload["outcome"])} (${String(payload["reason_code"])})`;
    case "run.step.completed":
      return `step '${String(payload["step"])}' completed via tool '${String(payload["tool"])}'`;
    case "run.step.failed":
      return `step '${String(payload["step"])}' failed: ${String(payload["message"] ?? payload["code"] ?? "unknown")}`;
    case "run.completed":
      return `run completed (${String(payload["steps_completed"])} step(s) done)`;
    case "run.failed":
      return `run failed: ${String(payload["message"] ?? payload["code"] ?? "unknown")}`;
    case "run.resumed":
      return `run resumed with remaining steps ${JSON.stringify(payload["remaining_steps"] ?? [])}`;
    default:
      return iso(0).slice(0, 0) + JSON.stringify(redactPayload(entry.payload as Json)).slice(0, 80);
  }
}

/** Parse helper reused by services (kept local to avoid layer skips). */
export function parseYamlText(text: string): ReturnType<typeof parseVaerYaml> {
  return parseVaerYaml(text);
}
