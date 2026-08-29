/**
 * Vaerion — broker contracts: review diff models.
 *
 * When a privileged action mutates anything, the human-facing review artifact
 * is a structured diff — never a raw blob. These models fix the review
 * surface MS-2's broker will emit (and gates will show).
 */

export type DiffOp = "create" | "modify" | "delete" | "rename";

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: ReadonlyArray<{ tag: " " | "+" | "-"; text: string }>;
}

export interface ReviewDiff {
  diff_id: string; // ULID
  run_id: string;
  trace_id: string;
  op: DiffOp;
  target: string; // path or resource id
  before_blob?: { alg: "blake3"; hash: string; size: number };
  after_blob?: { alg: "blake3"; hash: string; size: number };
  hunks: ReadonlyArray<DiffHunk>;
  /** Decision that authorized this mutation (journal link). */
  decision_id?: string;
}

export function assertReviewDiffShape(value: unknown): asserts value is ReviewDiff {
  const d = value as Partial<ReviewDiff> | null;
  const fail: (m: string) => never = (m) => {
    throw Object.assign(new Error(m), { code: "E1304" });
  };
  if (!d || typeof d !== "object") fail("review diff missing");
  if (typeof d.diff_id !== "string" || d.diff_id.length === 0) fail("diff_id missing");
  if (typeof d.run_id !== "string" || d.run_id.length === 0) fail("run_id missing");
  if (!["create", "modify", "delete", "rename"].includes(d.op as string)) fail(`diff.op invalid: ${String(d.op)}`);
  if (typeof d.target !== "string" || d.target.length === 0) fail("diff.target missing");
  if (!Array.isArray(d.hunks)) fail("diff.hunks must be an array");
}

/** Render a unified-diff-style string (deterministic; used by CLI review). */
export function renderUnified(diff: ReviewDiff): string {
  const head = `--- ${diff.op === "create" ? "/dev/null" : diff.target}\n+++ ${diff.op === "delete" ? "/dev/null" : diff.target}`;
  const body = diff.hunks
    .map((h) => {
      const range = `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
      return [range, ...h.lines.map((l) => l.tag + l.text)].join("\n");
    })
    .join("\n");
  return `${head}\n${body}\n`;
}
