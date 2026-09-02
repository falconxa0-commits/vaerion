/**
 * Vaerion — gate output discipline (ASCENSION XIX Phase 11; constitution v1.6 A6,
 * the CI truth law): a red gate NAMES its failure.
 *
 * verify.ts (D-R, the ONE verification entrypoint) persists every gate's full
 * output under `.vaerion-logs/<gate>.log` and prints, for a red gate, the
 * failure-naming excerpt instead of a trailing window. History: the old
 * last-40-lines window was structurally blind — bun's coverage table alone
 * exceeds 40 lines, so the actual failing-test block was truncated away and CI
 * reported "1 fail" with no name. That is a P7 violation (honest surfaces) and
 * this module is its root fix.
 *
 * Pure module: no engine imports, no side effects, deterministic output for the
 * same input (pinned by tests/integration/ci-truth.test.ts).
 */

/** Directory (relative to the repository root) holding per-gate full logs. */
export const GATE_LOG_DIR = ".vaerion-logs";

/** Deterministic log file name for a gate. */
export function gateLogName(gate: string): string {
  return `${gate}.log`;
}

/**
 * The failure-naming excerpt of a gate's combined output: every line that
 * NAMES a failure (bun's `(fail)` markers at line start, `error:` lines,
 * non-zero fail-count summary lines, perf breaches, RED headers) plus a
 * small deterministic context window, in original order, gaps marked.
 * Deliberately LINE-ANCHORED: passing tests whose names contain the word
 * "error" must never fill the excerpt before a real failure does.
 * Deterministic for the same input.
 */
export function failureExcerpt(output: string, maxLines = 120): string {
  const lines = output.split("\n");
  const names = (line: string): boolean =>
    /^\(fail\)/.test(line) ||
    /^✗/.test(line) ||
    /^error[:\s]/.test(line) ||
    /^\s*[1-9]\d* fail$/.test(line) ||
    /FAILED —/.test(line) ||
    /ms > budget/.test(line) ||
    /GATE FAILURES/.test(line) ||
    /exit code [1-9]/.test(line) ||
    /=== .*: RED/.test(line);
  const keep = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (names(lines[i]!)) {
      for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 6); j++) keep.add(j);
    }
  }
  if (keep.size === 0) {
    // No explicit failure marker found — surface the tail honestly and say so.
    return ["(no explicit failure marker found — tail of the gate output)", ...lines.slice(-15)].join("\n");
  }
  const ordered = [...keep].sort((a, b) => a - b);
  const out: string[] = [];
  let prev = -2;
  for (const i of ordered) {
    if (out.length >= maxLines) break;
    if (i !== prev + 1 && out.length > 0) out.push("    ⋮");
    out.push(lines[i]!);
    prev = i;
  }
  return out.join("\n");
}
