/**
 * @vaerion/sdk — TypeScript SDK (MS-1 preparation surface).
 *
 * Machine parity law (Sacred Invariant #7): the SDK exercises the SAME
 * contracts the CLI does — same engine calls, same envelopes, same receipts.
 * It is a projection of the engine, never a second implementation.
 *
 * Transport note: in MS-1 the client binds in-process. The daemon transport
 * (loopback HTTP/SSE, ADR-0010) lands with MS-5 and will implement the same
 * interface, so consumers do not change.
 */

import {
  runCli,
  RunHarness,
  verifyJournal,
  readJournal,
  listJournals,
  exportRedacted,
  BlobStore,
  initialRunState,
  runStateReducer,
  replayRecords,
  verifyRefusalLog,
  readRefusals,
  verifyEvidenceSet,
  verifyAuditLedger,
  type RunState,
  type JournalRecord,
  type VerifyReport,
  type JournalListItem,
  type ExportReport,
  type BlobRef,
  type RefusalEntry,
  type RefusalVerifyReport,
  type EvidenceVerificationReport,
  type EvidenceRecord,
  type AuditVerifyReport,
} from "@vaerion/engine";

export interface VaeClientOptions {
  /** Workspace root (default: process cwd). */
  cwd?: string;
}

export interface RunResearchInput {
  sources: string[];
  query: string;
  maxDocs?: number;
}

export interface RunResearchResult {
  runId: string;
  traceId: string;
  documents: number;
  hits: Array<{ doc_id: string; score: number }>;
  receipt: unknown;
  journalVerified: boolean;
}

export interface ResumeInput {
  runId: string;
  answer?: Record<string, unknown>;
}

export class VaeClient {
  private readonly cwd: string;

  constructor(opts: VaeClientOptions = {}) {
    this.cwd = opts.cwd ?? process.cwd();
  }

  /** Stability check that mirrors `--json` machine mode (parity anchor). */
  async raw(args: string[]): Promise<{ code: number; lines: Array<Record<string, unknown>> }> {
    const lines: Array<Record<string, unknown>> = [];
    const io = {
      out: (l: string) => {
        try {
          lines.push(JSON.parse(l) as Record<string, unknown>);
        } catch {
          lines.push({ raw: l });
        }
      },
      err: (l: string) => {
        try {
          lines.push(JSON.parse(l) as Record<string, unknown>);
        } catch {
          lines.push({ raw: l });
        }
      },
    };
    const result = await runCli([...args, "--json"], io, this.cwd);
    return { code: result.code, lines };
  }

  async init(name: string): Promise<{ code: number; lines: Array<Record<string, unknown>> }> {
    return this.raw(["init", "--name", name]);
  }

  /**
   * Execute a local research run through the full constitutional pipeline —
   * the same path `vae run research` takes, in-process.
   */
  async runResearch(input: RunResearchInput): Promise<RunResearchResult> {
    const { runCli } = await import("@vaerion/engine");
    const lines: Array<Record<string, unknown>> = [];
    const result = await runCli(
      ["run", "research", "--sources", input.sources.join(","), "--query", input.query, "--max-docs", String(input.maxDocs ?? 8), "--json"],
      { out: (l) => lines.push(JSON.parse(l) as Record<string, unknown>), err: () => undefined },
      this.cwd,
    );
    const payload = lines[lines.length - 1] as
      | { run_id?: string; trace_id?: string; documents?: number; hits_detail?: Array<{ doc_id: string; score: number }>; receipt?: unknown; journal_verified?: boolean }
      | undefined;
    if (result.code !== 0 || !payload?.run_id) {
      throw Object.assign(new Error(`run failed with exit code ${result.code}`), { code: result.code, lines });
    }
    return {
      runId: payload.run_id as string,
      traceId: payload.trace_id as string,
      documents: payload.documents as number,
      hits: payload.hits_detail ?? [],
      receipt: payload.receipt,
      journalVerified: payload.journal_verified === true,
    };
  }

  async journalList(): Promise<JournalListItem[]> {
    return listJournals(`${this.cwd}/.vaerion/journal`);
  }

  async journalVerify(runId: string): Promise<VerifyReport> {
    return verifyJournal(`${this.cwd}/.vaerion/journal/${runId}.ndjson`);
  }

  async journalRecords(runId: string): Promise<JournalRecord[]> {
    return (await readJournal(`${this.cwd}/.vaerion/journal/${runId}.ndjson`)).records;
  }

  async journalExport(runId: string, out?: string): Promise<ExportReport> {
    return exportRedacted({
      sourceJournalPath: `${this.cwd}/.vaerion/journal/${runId}.ndjson`,
      exportPath: out ?? `${this.cwd}/.vaerion/exports/${runId}.redacted.ndjson`,
      runId,
    });
  }

  /** Deterministic restoration of a run's state (no locks held). */
  async restoreState(runId: string, traceId: string): Promise<RunState> {
    const read = await readJournal(`${this.cwd}/.vaerion/journal/${runId}.ndjson`);
    return replayRecords<RunState>({ records: read.records, reducer: runStateReducer, initial: initialRunState(runId, traceId) }).state;
  }

  /** Content-addressed blob access behind blob_refs found in journals. */
  blobs(): BlobStore {
    return new BlobStore(`${this.cwd}/.vaerion/blobs`);
  }

  /** Fetch one blob by ref (typed convenience over the CAS). */
  async openBlob(ref: BlobRef): Promise<Uint8Array> {
    return this.blobs().open(ref);
  }

  /** Machine parity with `vae resume`: pending-gate resolution. */
  async resume(input: ResumeInput): Promise<{ code: number; lines: Array<Record<string, unknown>> }> {
    const args = ["resume", input.runId];
    if (input.answer !== undefined) args.push("--answer", JSON.stringify(input.answer));
    return this.raw(args);
  }

  /* ── MS-2 broker surface (machine parity with explain/doctor) ── */

  /** The workspace's durable Refusal Log, optionally filtered to one run. */
  async refusals(runId?: string): Promise<RefusalEntry[]> {
    return readRefusals(`${this.cwd}/.vaerion/refusals.log`, runId ? { runId } : {});
  }

  /** Refusal-log chain verification (same chain law as journals). */
  async verifyRefusals(): Promise<RefusalVerifyReport> {
    return verifyRefusalLog(`${this.cwd}/.vaerion/refusals.log`);
  }

  /**
   * Evidence triangulation for one run: evidence ↔ blob bytes ↔ fingerprint.
   * Full evidence records only (summary payloads are skipped, never guessed).
   */
  async verifyRunEvidence(runId: string): Promise<EvidenceVerificationReport> {
    const records = await this.journalRecords(runId);
    const evidence: EvidenceRecord[] = [];
    for (const rec of records) {
      if (rec.k !== "evt" || rec.env.type !== "research.evidence.recorded") continue;
      const candidate = (rec.env.payload as Record<string, unknown>).evidence;
      if (candidate && typeof candidate === "object") evidence.push(candidate as EvidenceRecord);
    }
    return verifyEvidenceSet(evidence, this.blobs());
  }

  /** Audit-ledger verification for the workspace (machine parity with doctor). */
  async verifyAudit(): Promise<AuditVerifyReport> {
    return verifyAuditLedger(`${this.cwd}/.vaerion/audit.log`);
  }
}

export { RunHarness } from "@vaerion/engine";
export default VaeClient;
