/**
 * gen-openapi — regenerate spec/openapi.json from the daemon route table
 * (ADR-0020 decision 6). Run: bun run tools/gen-openapi.ts
 * Constitutional check C4 verifies the committed file never drifts.
 */

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateOpenApi } from "../packages/vaerion/src/api/openapi.ts";

const ROOT = resolve(import.meta.dir, "..");
const out = generateOpenApi();
const path = join(ROOT, "spec", "openapi.json");
writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
console.log(`spec/openapi.json regenerated (${Object.keys((out.paths as Record<string, unknown>) ?? {}).length} paths)`);
