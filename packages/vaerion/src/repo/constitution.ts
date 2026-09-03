/**
 * Vaerion constitution-of-record derivation (MASTER DIRECTIVE Phase 16;
 * constitution v1.7 A7 — D-U/D-V applied through D-B) — the ONE authority
 * for which constitution text governs this repository.
 *
 * History (the defect class this module kills): four CLI surfaces carried
 * hand-copied version literals; the tour and welcome surfaces taught
 * `VAERION_CONSTITUTION_v1.3.md` two generations after the law had moved on,
 * and the help/dev literals drifted at every amendment. The derivation was
 * already proven in `tools/status.ts` — it now lives in the engine and every
 * consumer converges on it (D-B: one authority per concept; D-V: the class
 * removed, not the instance patched).
 *
 * Fail-closed (P6): a repository with no ratified constitution under
 * `docs/constitution/` is a defect — the derivation refuses to guess.
 *
 * Determinism (C2): the result is a pure fold over the directory listing —
 * sorted by parsed version, no wall-clock, no ambient state.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

/** The law directory of record — stable since v1.0 and never versioned in taught paths. */
export const CONSTITUTION_DIR = "docs/constitution" as const;

const FILE_PATTERN = /^VAERION_CONSTITUTION_v(\d+)\.(\d+)\.md$/;

export interface ConstitutionOfRecord {
  /** Filename of the ratified constitution of record, e.g. `VAERION_CONSTITUTION_v1.7.md`. */
  readonly file: string;
  /** Repository-relative path of record, e.g. `docs/constitution/VAERION_CONSTITUTION_v1.7.md`. */
  readonly path: string;
  /** Version of record, e.g. `v1.7`. */
  readonly version: string;
}

/** One parsed D-T phase-ledger row (the constitution's completion ledger). */
export interface PhaseLedgerRow {
  readonly phase: string;
  readonly era: string;
  readonly status: string;
  readonly evidence: string;
}

/**
 * Derive the constitution of record: the HIGHEST ratified version present.
 * Consumers outside a repository checkout (an installed CLI teaching about
 * the project) catch the throw and teach the stable directory form instead —
 * an honest absence, never a stale guess.
 */
export function constitutionOfRecord(root: string): ConstitutionOfRecord {
  let entries: string[];
  try {
    entries = readdirSync(join(root, CONSTITUTION_DIR));
  } catch (cause) {
    throw new Error(
      `constitution: ${CONSTITUTION_DIR}/ is unreadable from ${root} — the law of record cannot be derived (fail-closed, P6)`,
      { cause },
    );
  }
  const versions = entries
    .map((f) => FILE_PATTERN.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ file: m[0], major: Number(m[1]), minor: Number(m[2]) }))
    .sort((a, b) => a.major - b.major || a.minor - b.minor);
  const record = versions.at(-1);
  if (!record) {
    throw new Error(`constitution: no ratified constitution found under ${CONSTITUTION_DIR}/ (fail-closed, P6)`);
  }
  return {
    file: record.file,
    path: `${CONSTITUTION_DIR}/${record.file}`,
    version: `v${record.major}.${record.minor}`,
  };
}

const LEDGER_ROW_PATTERN =
  /^\| ([^|]+) \| ([^|]+) \| (✅ complete|▶ in flight|❌ NOT complete) \| (.+?) \|$/;

/**
 * Parse the D-T phase ledger (§11) from the constitution text — the ONE
 * parser for the completion ledger (status.ts's web face and `dev`'s
 * program-of-record statement consume the same rows; never two parsers).
 * Tolerant of any era column value — the ledger gains rows at every phase
 * boundary and the parser must never need an amendment to keep parsing.
 */
export function parsePhaseLedger(constitutionText: string): PhaseLedgerRow[] {
  const rows: PhaseLedgerRow[] = [];
  for (const m of constitutionText.matchAll(new RegExp(LEDGER_ROW_PATTERN.source, "gm"))) {
    rows.push({
      phase: m[1]!.trim(),
      era: m[2]!.trim(),
      status: m[3]!.trim(),
      evidence: m[4]!.trim(),
    });
  }
  return rows;
}
