/**
 * Vaerion — the performance budget GATE (ASCENSION XVIII Phase 7; v1.4 A4).
 *
 * D-R: tools/verify.ts is the ONE verification entrypoint; this script is a
 * gate STEP it invokes — never a second entrypoint, never re-implemented
 * elsewhere. It runs the deterministic perf harness (src/perf/perf.ts) over a
 * temp scratch root, prints the rich-plain-JSON report, and fails closed on
 * any budget breach (exit 1). The repository tree is never written.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measureEnginePerf, evaluatePerfReport } from "../packages/vaerion/src/perf/perf.ts";

const scratch = await mkdtemp(join(tmpdir(), "vae-perf-gate-"));
try {
  const report = await measureEnginePerf({ scratchRoot: scratch });
  console.log(JSON.stringify(report, null, 2));
  const verdict = evaluatePerfReport(report);
  if (!verdict.passed) {
    console.error(`perf-budget: FAILED — ${verdict.breaches.length} breach(es)`);
    for (const b of verdict.breaches) console.error(`  - ${b}`);
    process.exit(1);
  }
  console.log("perf-budget: OK — every engine-critical operation within its budget");
  process.exit(0);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
