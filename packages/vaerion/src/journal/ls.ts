/**
 * Vaerion — journal listing (read-only inventory of a workspace's runs).
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { readJournal } from "./reader.ts";

export interface JournalListItem {
  run_id: string;
  records: number;
  events: number;
  head_hash: string | null;
  bytes: number;
}

/** Full Crockford alphabet (0-9, ABCDEFGHJKMNPQRSTVWXYZ + lowercase) — U/L/I/O excluded. */
export const ULID_RE = "[0-9ABCDEFGHJKMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz]{26}";
export const RUN_ID_PATTERN = new RegExp(`^crn_run_${ULID_RE}\\.ndjson$`);
export const RUN_ID_RE = new RegExp(`^crn_run_${ULID_RE}$`);
const RUN_ID_RE_NDJSON = RUN_ID_PATTERN;

export async function listJournals(journalDir: string): Promise<JournalListItem[]> {
  const names = await readdir(journalDir).catch(() => [] as string[]);
  const out: JournalListItem[] = [];
  for (const name of names.sort()) {
    if (!RUN_ID_RE_NDJSON.test(name)) continue;
    const path = join(journalDir, name);
    const st = await stat(path).catch(() => null);
    if (!st) continue;
    const read = await readJournal(path).catch(() => null);
    if (!read) continue;
    let events = 0;
    for (const rec of read.records) if (rec.k === "evt") events++;
    const head = read.records[read.records.length - 1];
    out.push({
      run_id: name.replace(/\.ndjson$/, ""),
      records: read.records.length,
      events,
      head_hash: head ? head.hash : null,
      bytes: st.size,
    });
  }
  return out;
}
