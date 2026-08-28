/**
 * emit-openapi — regenerate spec/openapi.json from the runtime emitter
 * (D17.1: the specification is the contract; D20.2: fixture changes are
 * contract changes). Verification regenerates and diffs — drift blocks
 * the merge.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openapiDocument } from "../packages/vae-api/src/index.ts";

const ROOT = join(import.meta.dir, "..");
const TARGET = join(ROOT, "spec", "openapi.json");

const doc = openapiDocument("127.0.0.1", 7897);
const text = `${JSON.stringify(doc, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const existing = readFileSync(TARGET, "utf8");
  if (existing !== text) {
    console.error("emit-openapi: RED — spec/openapi.json drifted from the runtime contract (D17.1).");
    console.error("Fix: run `bun tools/emit-openapi.ts` and review the diff as a CONTRACT change (D20.2).");
    process.exit(1);
  }
  console.log("emit-openapi: GREEN — spec/openapi.json matches the runtime contract.");
  process.exit(0);
}

writeFileSync(TARGET, text, "utf8");
console.log(`emit-openapi: wrote ${TARGET} (review as contract change, D20.2).`);
