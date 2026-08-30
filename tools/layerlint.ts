/**
 * Vaerion LayerLint — architecture boundary verification (Stage 6 law).
 *
 * Runtime dependency matrix (type-only imports are exempt: they are erased at
 * runtime, and the layer law governs runtime edges):
 *
 *   L0 (kernel, config)      → L0
 *   L1 (spine, journal, store, receipts, broker) → L0, L1
 *   L2 (runtime, research)   → L0, L1, L2
 *   L4 (cli, api)            → L0, L1, L2, L4
 *
 * L2 also holds the MS-4 intelligence modules (agents, workflow, evals) —
 * they compose the runtime spine and may not be imported by it.
 *
 * Additional hard edges:
 *   - journal must not import runtime (would invert the dependency the run
 *     harness owns);
 *   - broker must not import runtime;
 *   - spine must not import journal (persistence bridges live above);
 *   - api must not import cli (two sibling surfaces over the same contracts);
 *   - nothing in packages/vaerion/src imports sdks/ or tools/.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname, posix } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SRC = join(ROOT, "packages", "vaerion", "src");

type Layer = "L0" | "L1" | "L2" | "L4";

function layerOf(relPath: string): Layer | null {
  const p = relPath.replaceAll("\\", "/");
  if (p.startsWith("kernel/") || p.startsWith("config/")) return "L0";
  if (p.startsWith("spine/") || p.startsWith("journal/") || p.startsWith("store/") || p.startsWith("receipts/") || p.startsWith("broker/")) return "L1";
  if (p.startsWith("runtime/") || p.startsWith("research/") || p.startsWith("agents/") || p.startsWith("workflow/") || p.startsWith("evals/")) return "L2";
  if (p.startsWith("cli/") || p.startsWith("api/")) return "L4";
  return null;
}

const ALLOWED: Record<Layer, Set<Layer>> = {
  L0: new Set(["L0"]),
  L1: new Set(["L0", "L1"]),
  L2: new Set(["L0", "L1", "L2"]),
  L4: new Set(["L0", "L1", "L2", "L4"]),
};

const FORBIDDEN_PAIRS: Array<{ from: RegExp; to: RegExp; why: string }> = [
  { from: /^journal\//, to: /^runtime\//, why: "journal must not know the run harness (inversion)" },
  { from: /^broker\//, to: /^runtime\//, why: "broker contracts must not know the run harness" },
  { from: /^spine\//, to: /^journal\//, why: "spine is storage-agnostic; persistence bridges live above (type-only exempt)" },
  { from: /^api\//, to: /^cli\//, why: "the daemon is a sibling surface over the same contracts, never a CLI wrapper" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const IMPORT_RE = /^\s*(?:import|export)\s+(?:type\s+)?[^;'"]*?from\s+["']([^"']+)["']/gm;

interface Violation {
  file: string;
  spec: string;
  resolved: string;
  why: string;
}

const violations: Violation[] = [];
const files = walk(SRC);
let edgesChecked = 0;
let typeOnlyExemptions = 0;

for (const file of files) {
  const rel = relative(SRC, file).replaceAll("\\", "/");
  const layer = layerOf(rel);
  if (!layer) continue;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(IMPORT_RE)) {
    const statement = m[0] ?? "";
    const spec = m[1] as string;
    const isTypeOnly = /^\s*import\s+type\s/.test(statement) || /^\s*export\s+type\s/.test(statement);
    // Resolve relative specifiers only; bare specifiers (hash-wasm, yaml, ajv) are external.
    if (!spec.startsWith(".")) continue;
    const abs = resolve(dirname(file), spec);
    const resolvedRel = relative(SRC, abs).replaceAll("\\", "/");
    const targetRel = resolvedRel.endsWith(".ts") ? resolvedRel : resolvedRel + ".ts";
    const targetLayer = layerOf(targetRel);
    edgesChecked++;
    if (isTypeOnly) {
      typeOnlyExemptions++;
      continue;
    }
    if (!targetLayer) continue;
    if (!ALLOWED[layer]!.has(targetLayer)) {
      violations.push({ file: rel, spec, resolved: targetRel, why: `runtime edge ${layer} → ${targetLayer} is outside the allowed matrix` });
      continue;
    }
    for (const rule of FORBIDDEN_PAIRS) {
      if (rule.from.test(rel) && rule.to.test(targetRel)) {
        violations.push({ file: rel, spec, resolved: targetRel, why: rule.why });
      }
    }
  }
  // hard ban: engine importing sdk/tools space
  if (src.includes('from "../../sdks') || src.includes('from "../../../tools') || src.includes("../../../tools/")) {
    violations.push({ file: rel, spec: "(scan)", resolved: "sdks|tools", why: "engine must not import porcelain/tooling upward" });
  }
}

const result = {
  gate: "layerlint",
  files: files.length,
  edgesChecked,
  typeOnlyExemptions,
  violations,
  ok: violations.length === 0,
};

if (process.env.VAE_VERIFY_JSON) {
  process.stdout.write(JSON.stringify(result, null, 2));
} else {
  console.log(`layerlint: ${files.length} files, ${edgesChecked} runtime edges (${typeOnlyExemptions} type-only exempt)`);
  if (result.ok) {
    console.log("layerlint: OK — architecture boundaries hold");
  } else {
    for (const v of violations) {
      console.error(`VIOLATION ${v.file} → ${v.resolved}: ${v.why}`);
    }
    console.error(`layerlint: FAILED — ${violations.length} violation(s)`);
  }
}
process.exit(result.ok ? 0 : 1);
