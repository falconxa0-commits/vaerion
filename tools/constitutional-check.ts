/**
 * Vaerion Constitutional Check — invariant verification over source law.
 *
 * Checks (each maps to a constitutional article):
 *  C1  Zero telemetry / no undeclared network (P10, D-K): no fetch/http/net
 *      anywhere in engine or SDK source.
 *  C2  Determinism (P2): no Date.now/Math.random outside the sanctioned
 *      port implementations (kernel/clock.ts, kernel/ids.ts) and operational
 *      lock metadata (journal/lock.ts).
 *  C3  No placeholder debt: no TODO/FIXME/XXX/HACK markers anywhere in
 *      engine, spec, or ADRs.
 *  C4  Contract sync: spec/errors.yaml ⇄ ERROR_CATALOG; spec/events/
 *      registry.json ⇄ EVENT_TYPES (drift is a defect).
 *  C5  No secret material in the repository (test vectors are allow-listed).
 *  C6  Zero-telemetry config guard present (telemetry.enabled must be false).
 *  C7  The daemon listener surface never egresses (api/ has no HTTP client
 *      primitives); the SDK wire client is confined to its single sanctioned
 *      site (ADR-0020), symmetric to the gateway egress site (ADR-0019).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import YAML from "yaml";

const ROOT = resolve(import.meta.dir, "..");
const ENGINE = join(ROOT, "packages", "vaerion", "src");
const SDK = join(ROOT, "sdks", "typescript", "src");
const SPEC = join(ROOT, "spec");
const ADR = join(ROOT, "docs", "adr");

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules") continue; // never descend into vendored/link-copied trees
      walk(p, out);
    } else if (/\.(ts|yaml|yml|json|md)$/.test(name)) out.push(p);
  }
  return out;
}

interface Finding {
  check: string;
  file: string;
  line: number | null;
  detail: string;
}

const findings: Finding[] = [];

function scanFiles(dir: string, check: string, patterns: RegExp[], allow: (rel: string) => boolean): void {
  for (const file of walk(dir)) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (allow(rel)) continue;
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const re of patterns) {
        if (re.test(lines[i] as string)) {
          findings.push({ check, file: rel, line: i + 1, detail: (lines[i] as string).trim().slice(0, 120) });
        }
      }
    }
  }
}

// C1 — network ban (engine + SDK). Allow: the SINGLE sanctioned egress site
// (MS-3, constitution D-J/C1 amendment): gateway/transport.ts carries the
// provider endpoint map and is reachable ONLY behind journaled broker
// decisions (model.invoke/secret.read, decide→journal→act). Everywhere else
// the ban is absolute. (CLI doctor text mentions "network" in prose only.)
// MS-5 (ADR-0020): the SDK gains ONE sanctioned CLIENT site —
// sdks/typescript/src/daemon-transport.ts — loopback-enforced in code (E2006),
// so SDKs can attach to the local daemon per R-S1. It is a client to the
// local daemon only, never a second gateway.
const C1_ALLOW = (rel: string): boolean =>
  rel.endsWith("packages/vaerion/src/gateway/transport.ts");
scanFiles(ENGINE, "C1-network", [/\bfetch\(/, /node:http/, /node:https/, /node:net\b/, /axios/, /\bhttps?:\/\//], C1_ALLOW);
scanFiles(SDK, "C1-network", [/\bfetch\(/, /node:http/, /node:https/, /node:net\b/, /axios/], (rel) =>
  rel.endsWith("sdks/typescript/src/daemon-transport.ts"));

// C7 — listener egress-freedom (MS-5, ADR-0020). The daemon surface listens;
// it must never call out. No allow entries: if api/ ever contains an HTTP
// CLIENT primitive, that is a violation by definition.
scanFiles(join(ENGINE, "api"), "C7-listener-egress", [/\bfetch\(/, /node:http/, /node:https/, /axios/], () => false);

// C2 — determinism ports. Allow: the port implementations themselves.
const C2_ALLOW = (rel: string): boolean =>
  rel.endsWith("packages/vaerion/src/kernel/clock.ts") ||
  rel.endsWith("packages/vaerion/src/kernel/ids.ts") ||
  rel.endsWith("packages/vaerion/src/journal/lock.ts");
scanFiles(ENGINE, "C2-determinism", [/\bDate\.now\(/, /\bMath\.random\(/, /\bnew Date\(/], C2_ALLOW);
scanFiles(SDK, "C2-determinism", [/\bDate\.now\(/, /\bMath\.random\(/], () => false);

// C3 — placeholder debt (engine, spec, ADRs).
scanFiles(ENGINE, "C3-placeholders", [/\bTODO\b/, /\bFIXME\b/, /\bXXX\b/, /\bHACK\b/, /\bplaceholder\b/i, /not implemented/i], (rel) => rel.endsWith(".test.ts") || rel.includes("tests/"));
scanFiles(SPEC, "C3-placeholders", [/\bTODO\b/, /\bFIXME\b/, /\bXXX\b/, /\bHACK\b/, /\bplaceholder\b/i, /lorem ipsum/i], () => false);
scanFiles(ADR, "C3-placeholders", [/\bTODO\b/, /\bFIXME\b/, /\bXXX\b/, /\bHACK\b/, /lorem ipsum/i], () => false);

// C5 — secret material scan (allow redaction test vectors + the redactor itself).
const SECRET_RE = /\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bAKIA[0-9A-Z]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bxox[bpors]-[A-Za-z0-9-]{10,}\b/;
scanFiles(ROOT, "C5-secrets", [SECRET_RE], (rel) =>
  rel.startsWith("packages/vaerion/tests/") ||
  rel.startsWith("packages/vaerion/fixtures/") ||
  rel.endsWith("packages/vaerion/src/kernel/redact.ts") ||
  rel.includes("/node_modules/") ||
  rel.startsWith(".next") ||
  rel.startsWith("bun.lock"));

// C6 — zero-telemetry guard present in config validator.
const configSrc = readFileSync(join(ENGINE, "config", "config.ts"), "utf8");
if (!configSrc.includes("telemetry.enabled must be false")) {
  findings.push({ check: "C6-zero-telemetry-guard", file: "packages/vaerion/src/config/config.ts", line: null, detail: "config validator lacks the zero-telemetry structural guard" });
}

// C4 — contract sync (errors.yaml ⇄ catalog; registry.json ⇄ EVENT_TYPES).
let catalogCodes: string[] = [];
let specCodes: string[] = [];
try {
  // Extract codes from the runtime catalog without importing (regex on exported keys).
  const errSrc = readFileSync(join(ENGINE, "kernel", "errors.ts"), "utf8");
  catalogCodes = [...errSrc.matchAll(/^\s{2}(E\d{4}):/gm)].map((m) => m[1] as string);
  const errYaml = YAML.parse(readFileSync(join(SPEC, "errors.yaml"), "utf8")) as { errors?: Record<string, unknown> };
  specCodes = Object.keys(errYaml.errors ?? {});
} catch (err) {
  findings.push({ check: "C4-contract-sync", file: "spec/errors.yaml", line: null, detail: `failed to parse: ${(err as Error).message}` });
}
const catalogOnly = catalogCodes.filter((c) => !specCodes.includes(c));
const specOnly = specCodes.filter((c) => !catalogCodes.includes(c));
if (catalogOnly.length || specOnly.length) {
  findings.push({ check: "C4-contract-sync", file: "spec/errors.yaml", line: null, detail: `catalog-only: [${catalogOnly}] spec-only: [${specOnly}]` });
}

try {
  const spineSrc = readFileSync(join(ENGINE, "spine", "event-types.ts"), "utf8");
  const catalogEvents = [...spineSrc.matchAll(/^\s{2}"([a-z]+\.[a-z.]+)",?$/gm)].map((m) => m[1] as string);
  const registry = JSON.parse(readFileSync(join(SPEC, "events", "registry.json"), "utf8")) as { events?: Array<{ type: string }> };
  const specEvents = (registry.events ?? []).map((e) => e.type);
  const evOnly = catalogEvents.filter((t) => !specEvents.includes(t));
  const spOnly = specEvents.filter((t) => !catalogEvents.includes(t));
  if (evOnly.length || spOnly.length) {
    findings.push({ check: "C4-contract-sync", file: "spec/events/registry.json", line: null, detail: `code-only: [${evOnly}] spec-only: [${spOnly}]` });
  }
} catch (err) {
  findings.push({ check: "C4-contract-sync", file: "spec/events/registry.json", line: null, detail: `failed to parse: ${(err as Error).message}` });
}

// C4 (MS-5, ADR-0020) — openapi sync: spec/openapi.json must equal the
// description generated from the route table (an "API gap" is impossible by
// construction; drift between generator and committed contract is a defect).
try {
  const { generateOpenApi } = await import(join(ENGINE, "api", "openapi.ts"));
  const committed = JSON.parse(readFileSync(join(SPEC, "openapi.json"), "utf8")) as unknown;
  const generated = generateOpenApi();
  if (JSON.stringify(committed) !== JSON.stringify(generated)) {
    findings.push({ check: "C4-contract-sync", file: "spec/openapi.json", line: null, detail: "committed openapi.json differs from the generated route-table description (regenerate with: bun run tools/gen-openapi.ts)" });
  }
} catch (err) {
  findings.push({ check: "C4-contract-sync", file: "spec/openapi.json", line: null, detail: `openapi sync failed: ${(err as Error).message}` });
}

const result = {
  gate: "constitutional-check",
  checks: ["C1-network", "C2-determinism", "C3-placeholders", "C4-contract-sync", "C5-secrets", "C6-zero-telemetry-guard", "C7-listener-egress"],
  catalogCodes: catalogCodes.length,
  findings,
  ok: findings.length === 0,
};

if (process.env.VAE_VERIFY_JSON) {
  process.stdout.write(JSON.stringify(result, null, 2));
} else {
  console.log(`constitutional-check: ${result.checks.length} invariant checks, catalog ${catalogCodes.length} codes`);
  if (result.ok) {
    console.log("constitutional-check: OK — no invariant violations");
  } else {
    for (const f of findings) {
      console.error(`VIOLATION [${f.check}] ${f.file}${f.line ? ":" + f.line : ""}: ${f.detail}`);
    }
    console.error(`constitutional-check: FAILED — ${findings.length} finding(s)`);
  }
}
process.exit(result.ok ? 0 : 1);
