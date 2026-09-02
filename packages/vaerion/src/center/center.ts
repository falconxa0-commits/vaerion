/**
 * Vaerion — the command center fold (ASCENSION XVIII Phase 6; constitution
 * v1.3 A3; P7 honest surfaces, D-S measured-only).
 *
 * Law: ONE measured core for the operator cockpit. `vae center`, the web
 * face, and any future surface consume THIS fold — never a second
 * implementation. Every number is a measurement over this workspace's
 * artifacts (journals, audit ledger, refusal log, blob CAS, verification
 * record, release readiness) with an honesty label where a measurement is
 * impossible. No wall-clock enters the report; the same artifacts yield the
 * same bytes.
 */

import { verifyJournal } from "../journal/verify.ts";
import { listJournals } from "../journal/ls.ts";
import { readJournal } from "../journal/reader.ts";
import { collectBlobRefs } from "../receipts/receipt.ts";
import { verifyAuditLedger } from "../broker/contracts/audit.ts";
import { verifyRefusalLog } from "../broker/refusal-log.ts";
import { BlobStore } from "../store/blob-cas.ts";
import { meteringFromRecords, type GatewayMeteringRollup } from "../gateway/metering.ts";
import { evaluateReleaseReadiness, type ReadinessReport } from "../repo/release.ts";
import { isVaerionError } from "../kernel/errors.ts";

/** Structural input — the L2 core never imports the L4 workspace helper. */
export interface MeasureCenterInput {
  /** The workspace root (journals, blobs, audit, refusals live under it). */
  root: string;
  journalDir: string;
  blobsDir: string;
  auditPath: string;
  refusalsPath: string;
  /** Repository root for the release-readiness digest, or null when this
   *  workspace is not a repository checkout (honest absence, never a guess). */
  repoRoot: string | null;
}

export interface CenterRunEntry {
  run_id: string;
  records: number;
  events: number;
  verified: boolean;
  receipt: boolean;
}

export interface CenterReport {
  workspace: { root: string; runs: number };
  operations: {
    runs: CenterRunEntry[];
    journals_verified: boolean;
    receipts: number;
    metering: GatewayMeteringRollup;
    blob_refs: { checked: number; failed: number };
  };
  integrity: {
    audit_ledger: { ok: boolean; entries: number; detail: string };
    refusal_log: { ok: boolean; entries: number; detail: string };
  };
  release: {
    measured: boolean;
    note?: string;
    ready?: boolean;
    verdict?: string;
    passed?: number;
    total?: number;
    blockers?: Array<{ check: string; detail: string }>;
  };
  read_only: string;
}

/**
 * The operator cockpit fold: workspace operations (runs, receipts, gateway
 * metering), integrity (audit ledger + refusal log chains), and the release
 * readiness digest when a repository is measurable.
 */
export async function measureCenter(input: MeasureCenterInput): Promise<CenterReport> {
  const runs = await listJournals(input.journalDir);
  const blobStore = new BlobStore(input.blobsDir);
  const allRecords = [];
  const runEntries: CenterRunEntry[] = [];
  let blobRefsChecked = 0;
  let blobRefsFailed = 0;
  let receipts = 0;
  let journalsVerified = true;

  for (const run of runs) {
    const read = await readJournal(`${input.journalDir}/${run.run_id}.ndjson`).catch(() => null);
    if (!read) {
      journalsVerified = false;
      runEntries.push({ run_id: run.run_id, records: 0, events: 0, verified: false, receipt: false });
      continue;
    }
    allRecords.push(...read.records);
    const report = await verifyJournal(`${input.journalDir}/${run.run_id}.ndjson`);
    if (!report.ok) journalsVerified = false;
    const hasReceipt = read.records.some((r) => r.k === "receipt");
    if (hasReceipt) receipts++;
    runEntries.push({
      run_id: run.run_id,
      records: read.records.length,
      events: read.records.filter((r) => r.k === "evt").length,
      verified: report.ok,
      receipt: hasReceipt,
    });
    for (const ref of collectBlobRefs(read.records)) {
      blobRefsChecked++;
      if ((await blobStore.verify(ref)) !== null) blobRefsFailed++;
    }
  }

  const audit = await verifyAuditLedger(input.auditPath);
  const refusals = await verifyRefusalLog(input.refusalsPath);

  let release: CenterReport["release"];
  if (input.repoRoot === null) {
    release = { measured: false, note: "not a repository checkout — release readiness not measurable here" };
  } else {
    try {
      const report: ReadinessReport = await evaluateReleaseReadiness(input.repoRoot, { liveGates: false });
      release = {
        measured: true,
        ready: report.ready,
        verdict: report.verdict,
        passed: report.passed,
        total: report.total,
        blockers: report.blockers.map((b) => ({ check: b.check, detail: b.detail })),
      };
    } catch (err) {
      // Not a git repository / git unusable: an honest, measured absence.
      release = isVaerionError(err)
        ? { measured: false, note: `${err.code}: ${err.message}` }
        : { measured: false, note: "repository state could not be measured" };
    }
  }

  return {
    workspace: { root: input.root, runs: runs.length },
    operations: {
      runs: runEntries,
      journals_verified: journalsVerified,
      receipts,
      metering: meteringFromRecords(allRecords),
      blob_refs: { checked: blobRefsChecked, failed: blobRefsFailed },
    },
    integrity: {
      audit_ledger: { ok: audit.ok, entries: audit.entries, detail: audit.ok ? `chain intact, head ${audit.head?.slice(0, 12) ?? "—"}` : (audit.message ?? "audit chain broken") },
      refusal_log: { ok: refusals.ok, entries: refusals.entries, detail: refusals.ok ? `chain intact, head ${refusals.head?.slice(0, 12) ?? "—"}` : (refusals.message ?? "refusal log chain broken") },
    },
    release,
    read_only: "every value was measured from this workspace's artifacts — nothing was created, modified, or executed",
  };
}
