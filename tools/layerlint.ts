/**
 * layerlint — constitutional enforcement of the L0–L4 layer law
 * (D6.4, D20.9). This tool is one of the standing courts of the
 * constitution (Article XIV): a red gate blocks the merge.
 *
 * Matrix (blueprint §5.1, ratified through D6.4):
 *   L0 (foundation, config)          → may import L0 only
 *   L1 (store, capabilities, tools, gateway) → L0 + L1
 *   L2 (intel, context, ext-host, workflow, agent, package) → L0 + L1 + L2
 *   L3 (api)                        → L0 + L2 value imports; L1 type-only
 *   L4 (cli)                        → L0 value imports + L3
 *   sdks/* (porcelain)              → L0 + L3, type-leaning
 *
 * Rules are code and reviewed like code (Stage 6). Skipped: tools/
 * (the courts themselves) and test files (they may import anything to
 * interrogate the law).
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PACKAGES = join(ROOT, "packages");
const SDKS = join(ROOT, "sdks");

interface LayerRule {
  readonly layer: string;
  readonly valueImports: ReadonlySet<string>; // layers this unit may import values from
  readonly typeOnlyLayers: ReadonlySet<string>; // layers importable as `import type` only
}

const LAYERS: Record<string, string[]> = {
  L0: ["vae-foundation", "vae-config"],
  L1: ["vae-store", "vae-capabilities", "vae-tools", "vae-gateway"],
  L2: ["vae-intel", "vae-context", "vae-ext-host", "vae-workflow", "vae-agent", "vae-package"],
  L3: ["vae-api"],
  L4: ["vae-cli"],
};

function layerOf(pkg: string): string | undefined {
  for (const [layer, pkgs] of Object.entries(LAYERS)) {
    if (pkgs.includes(pkg)) return layer;
  }
  return undefined;
}

function ruleFor(layer: string): LayerRule | undefined {
  switch (layer) {
    case "L0":
      return { layer, valueImports: new Set(["L0"]), typeOnlyLayers: new Set() };
    case "L1":
      return { layer, valueImports: new Set(["L0", "L1"]), typeOnlyLayers: new Set() };
    case "L2":
      return { layer, valueImports: new Set(["L0", "L1", "L2"]), typeOnlyLayers: new Set() };
    case "L3":
      // The API layer maps onto L2 services; L1 contracts appear as types only.
      return { layer, valueImports: new Set(["L0", "L2", "L3"]), typeOnlyLayers: new Set(["L1"]) };
    case "L4":
      // Porcelain consumes L3 (the public surface) and L0; L1/L2 are forbidden —
      // an API gap is impossible by construction (blueprint §5.1).
      return { layer, valueImports: new Set(["L0", "L3", "L4"]), typeOnlyLayers: new Set() };
    default:
      return undefined;
  }
}

const INTERNAL_RE = /from\s+["'](vae-[a-z-]+)(?:\/[^"']+)?["']/g;
const TYPE_ONLY_RE = /^\s*import\s+type\s+/;
const MIXED_TYPE_RE = /^\s*import\s+\{[^}]*\btype\s+/;

function* walkFiles(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      yield* walkFiles(full);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      yield full;
    }
  }
}

interface Violation {
  readonly file: string;
  readonly why: string;
}

function lintUnit(unitDir: string, unitName: string, ownLayer: string, violations: Violation[]): void {
  const rule = ruleFor(ownLayer);
  if (rule === undefined) return;
  for (const file of walkFiles(unitDir)) {
    const rel = relative(ROOT, file);
    // Only src/ is linted: tests are the courts' instruments.
    if (!rel.includes(`${unitName}/src/`)) continue;
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (const [i, line] of lines.entries()) {
      INTERNAL_RE.lastIndex = 0;
      const match = INTERNAL_RE.exec(line);
      if (match === null) continue;
      const imported = match[1]!;
      const importedLayer = layerOf(imported);
      if (importedLayer === undefined) continue;
      const isTypeImport = TYPE_ONLY_RE.test(line) || MIXED_TYPE_RE.test(line);
      if (rule.valueImports.has(importedLayer)) continue;
      if (rule.typeOnlyLayers.has(importedLayer) && isTypeImport) continue;
      violations.push({
        file: `${rel}:${i + 1}`,
        why: `${ownLayer} (${unitName}) imports ${importedLayer} (${imported})${rule.typeOnlyLayers.has(importedLayer) ? " as a value — only type imports are allowed" : ""} — forbidden by the layer matrix (D6.4)`,
      });
    }
  }
}

function main(): number {
  const violations: Violation[] = [];
  let units = 0;

  for (const base of [PACKAGES, SDKS]) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const unitDir = join(base, entry);
      if (!statSync(unitDir).isDirectory()) continue;
      if (!existsSync(join(unitDir, "package.json"))) continue;
      units++;
      const layer = base === SDKS ? "L4" : layerOf(entry);
      if (layer === undefined) {
        violations.push({ file: `packages/${entry}`, why: "package is not assigned to a layer — new units enter via the crate map (Stage 6)" });
        continue;
      }
      lintUnit(unitDir, entry, layer, violations);
    }
  }

  if (violations.length > 0) {
    console.error(`layerlint: RED — ${violations.length} boundary violation(s):\n`);
    for (const v of violations) console.error(`  ${v.file}\n    ${v.why}`);
    console.error("\nLayer matrix (D6.4): L0→L0 · L1→L0,L1 · L2→L0..L2 · L3→L0,L2(types-only L1) · L4→L0,L3");
    return 1;
  }
  console.log(`layerlint: GREEN — ${units} units checked, 0 boundary violations (L0–L4 law, D6.4).`);
  return 0;
}

process.exit(main());
