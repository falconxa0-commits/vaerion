/**
 * Vaerion — redacted journal export.
 *
 * A redacted export is a DERIVED artifact:
 *   - source records are deep-redacted (kernel/redact.ts) — deterministic;
 *   - the export carries its own meta header `note="export"` with derivation
 *     metadata (source run id + source head hash + record count);
 *   - the export's records are re-chained with fresh blake3 hashes over the
 *     redacted content, so the export is independently verifiable;
 *   - the source journal is never mutated.
 *
 * Replay compatibility: envelope shape and per-run seq are preserved
 * byte-for-byte except for redacted string/value substitutions.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { redactDeep } from "../kernel/redact.ts";
import { GENESIS_HASH, type HashHex } from "../kernel/hash.ts";
import { sealRecord } from "./hashchain.ts";
import { type JournalRecord, type RecordInput, type UnsealedRecord } from "./records.ts";
import { readJournal } from "./reader.ts";
import { verifyJournal } from "./verify.ts";
import { firstChainError, firstIndexError } from "./hashchain.ts";
import { VaerionError } from "../kernel/errors.ts";

export interface ExportOptions {
  sourceJournalPath: string;
  exportPath: string;
  runId: string;
  /** Fail the export when the source fails verification (default true). */
  requireVerifiedSource?: boolean;
}

export interface ExportReport {
  exportPath: string;
  sourceRecords: number;
  exportedRecords: number;
  sourceHeadHash: HashHex | null;
  exportHeadHash: HashHex;
  verified: boolean;
}

export async function exportRedacted(opts: ExportOptions): Promise<ExportReport> {
  const requireVerified = opts.requireVerifiedSource !== false;

  if (requireVerified) {
    const v = await verifyJournal(opts.sourceJournalPath);
    if (!v.ok) {
      throw new VaerionError("E1001", "source journal failed verification; export refused", {
        path: opts.sourceJournalPath,
        issues: v.issues,
      });
    }
  }

  const read = await readJournal(opts.sourceJournalPath);
  if (read.records.length === 0) {
    throw new VaerionError("E1006", "source journal has no records; export refused", { path: opts.sourceJournalPath });
  }
  const sourceHead = read.records[read.records.length - 1] as JournalRecord;

  await mkdir(dirname(opts.exportPath), { recursive: true });

  // Redact each record (structure preserved; redaction is deterministic).
  const redactedBodies: RecordInput[] = [];
  for (const rec of read.records) {
    if (rec.k === "meta" && rec.note === "header") {
      redactedBodies.push({
        k: "meta",
        note: "export",
        run_id: rec.run_id,
        opened_at: rec.opened_at,
        engine_version: rec.engine_version,
        config_fingerprint: rec.config_fingerprint,
        detail: {
          source_run_id: rec.run_id,
          source_head: sourceHead.hash,
          source_records: read.records.length,
          redaction: "v1",
        },
      });
      continue;
    }
    // Strip the source record's chain fields: the export re-chains from scratch.
    const redacted = redactDeep(rec) as unknown as Record<string, unknown>;
    delete redacted.hash;
    redactedBodies.push(redacted as RecordInput);
  }

  // Re-chain the redacted records.
  let prev: HashHex = GENESIS_HASH;
  const lines: string[] = [];
  for (let idx = 0; idx < redactedBodies.length; idx++) {
    const body = redactedBodies[idx] as typeof redactedBodies[number];
    const unsealed = { ...body, i: idx + 1, prev } as unknown as UnsealedRecord;
    const sealed = await sealRecord(unsealed);
    lines.push(JSON.stringify(sealed) + "\n");
    prev = sealed.hash;
  }

  await writeFile(opts.exportPath, lines.join(""), "utf8");

  // The export must verify under the same law as any journal.
  const vOut = await verifyJournal(opts.exportPath);
  if (!vOut.ok) {
    throw new VaerionError("E1009", "redacted export failed self-verification", { path: opts.exportPath, issues: vOut.issues });
  }

  return {
    exportPath: opts.exportPath,
    sourceRecords: read.records.length,
    exportedRecords: redactedBodies.length,
    sourceHeadHash: sourceHead.hash,
    exportHeadHash: prev,
    verified: true,
  };
}

/** Read back a chain-checked export (shape + linkage), for tests and audits. */
export async function readExportVerified(exportPath: string): Promise<JournalRecord[]> {
  const read = await readJournal(exportPath);
  const idxErr = firstIndexError(read.records);
  if (idxErr) throw new VaerionError("E1001", idxErr.reason, { i: idxErr.i });
  const chainErr = await firstChainError(read.records);
  if (chainErr) throw new VaerionError("E1001", chainErr.reason, { i: chainErr.i });
  return read.records;
}
