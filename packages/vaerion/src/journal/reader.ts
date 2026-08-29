/**
 * Vaerion — journal reader.
 *
 * Parses an NDJSON journal line by line. Distinguishes:
 *   - complete records (shape-valid),
 *   - a torn tail (last line incomplete/corrupt — crash signature),
 *   - mid-file corruption (shape/JSON failure before the last line — never a
 *     crash signature; refuses with E1003).
 *
 * The reader performs NO hash verification — that is verify.ts's job — but it
 * does guarantee every returned record is shape-valid.
 */

import { readFile, stat } from "node:fs/promises";
import { assertRecordShape, type JournalRecord } from "./records.ts";

export interface ReadResult {
  records: JournalRecord[];
  /** Byte offset just past the last complete record (end of its newline). */
  completeByteLength: number;
  torn: boolean;
  /** Present only when torn: the raw bytes of the incomplete tail. */
  tornTailBytes?: Uint8Array;
  tornTailMessage?: string;
}

export async function readJournal(journalPath: string): Promise<ReadResult> {
  const st = await stat(journalPath).catch(() => null);
  if (!st) throw Object.assign(new Error(`journal not found: ${journalPath}`), { code: "E1502" });
  const buf = await readFile(journalPath);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);

  const records: JournalRecord[] = [];
  let offset = 0;
  let torn = false;
  let tornTailBytes: Uint8Array | undefined;
  let tornTailMessage: string | undefined;

  // Iterate over newline-delimited lines, tracking byte offsets by encoding each line.
  let lineStart = 0;
  while (lineStart < text.length) {
    let nl = text.indexOf("\n", lineStart);
    const isLastBoundary = nl === -1;
    const line = isLastBoundary ? text.slice(lineStart) : text.slice(lineStart, nl);
    const lineEndByte = isLastBoundary ? buf.byteLength : offset + Buffer.byteLength(line, "utf8") + 1;

    const rawLine = line.trim();
    if (rawLine.length === 0) {
      if (isLastBoundary) {
        // trailing whitespace with no content: not a torn record
        lineStart = text.length;
        continue;
      }
      offset = lineEndByte;
      lineStart = nl + 1;
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(rawLine);
      assertRecordShape(parsed);
      records.push(parsed as JournalRecord);
      offset = lineEndByte;
      if (isLastBoundary) {
        lineStart = text.length;
        continue;
      }
      lineStart = nl + 1;
    } catch (err) {
      if (isLastBoundary) {
        torn = true;
        tornTailBytes = buf.subarray(offset);
        tornTailMessage = (err as Error).message;
        lineStart = text.length;
        continue;
      }
      // mid-file corruption is never a crash signature
      throw Object.assign(new Error(`journal record invalid at line before offset ${offset}: ${(err as Error).message}`), { code: "E1003" });
    }
  }

  return {
    records,
    completeByteLength: offset,
    torn,
    tornTailBytes,
    tornTailMessage,
  };
}

/** Convenience: an async iterable of envelopes with seq >= fromSeq. */
export async function* envelopesFrom(
  records: JournalRecord[],
  fromSeq: number,
): AsyncGenerator<import("../spine/envelope.ts").Envelope> {
  for (const rec of records) {
    if (rec.k === "evt" && rec.env.seq >= fromSeq) {
      yield rec.env;
    }
  }
}
