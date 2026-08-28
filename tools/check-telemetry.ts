/**
 * check-telemetry — zero telemetry, permanently (D2.5, FR-3).
 *
 * The engine never phones home. This court scans the tree for
 * telemetry-shaped code: analytics endpoints, tracking SDKs, beacon
 * patterns. Telemetry is rejected permanently — this gate makes the
 * rejection mechanical.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = join(import.meta.dir, "..");

const FORBIDDEN: { name: string; re: RegExp }[] = [
  { name: "analytics endpoint", re: /google-analytics|googletagmanager|segment\.(io|com)|amplitude\.com|mixpanel|posthog\.com|plausible\.io|matomo/i },
  { name: "beacon/pixel pattern", re: /new\s+Image\(\)[\s\S]{0,40}\.src\s*=|navigator\.sendBeacon|sendBeacon\(/ },
  { name: "tracking SDK import", re: /from\s+["'](@segment|@amplitude|@mixpanel|@sentry|analytics-node|posthog-node|fullstory)/ },
  { name: "telemetry config key", re: /\b(telemetry|analytics)\s*[:=]\s*\{?\s*(enabled|optIn)\s*[:=]\s*true/i },
  { name: "error reporting service", re: /sentry\.io\/\d+|bugsnag|rollbar/i },
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".vaerion"]);
const SCAN_EXT = new Set([".ts", ".js", ".json", ".yaml", ".yml", ".md", ".mjs"]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (SCAN_EXT.has(extname(full))) {
      yield full;
    }
  }
}

function main(): number {
  const findings: string[] = [];
  for (const file of walk(ROOT)) {
    // The court does not flag its own fingerprints (this file holds the
    // forbidden patterns as regex literals, not as telemetry code).
    if (file.endsWith("check-telemetry.ts")) continue;
    const text = readFileSync(file, "utf8");
    for (const { name, re } of FORBIDDEN) {
      const lines = text.split("\n");
      for (const [i, line] of lines.entries()) {
        if (re.test(line)) {
          findings.push(`${relative(ROOT, file)}:${i + 1} — ${name}: ${line.trim().slice(0, 80)}`);
        }
      }
    }
  }

  if (findings.length > 0) {
    console.error(`check-telemetry: RED — ${findings.length} finding(s):`);
    for (const f of findings) console.error(`  ${f}`);
    console.error("\nZero telemetry is permanent law (D2.5, FR-3). Observability is exported by the operator, never harvested (Stage 21).");
    return 1;
  }
  console.log("check-telemetry: GREEN — 0 telemetry patterns (D2.5, FR-3: zero telemetry, permanently).");
  return 0;
}

process.exit(main());
