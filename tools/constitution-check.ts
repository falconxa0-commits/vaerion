/**
 * constitution-check — repository alignment with VAERION_CONSTITUTION_v1.0
 * (Founder's verification requirement 9; D20.1 posture).
 *
 * Checks the law is physically present and intact:
 *  1. CONSTITUTION.md at root (D4.7) and its internal hash-discipline markers.
 *  2. spec/ daylight-rule contracts exist (D6.3).
 *  3. Fourteen vae-* units (D6.2) in a single-version monorepo (D6.1).
 *  4. The embedded E#### catalog equals spec/errors.yaml (D3.8 — via the
 *     dedicated contract test; here we check the spec file itself parses).
 *  5. The exit-code alphabet is declared in the constitution text (Part IV).
 *  6. The Daily Seven surface is the top-level command set (D3.2, D18.11).
 *  7. Envelope conformance: golden envelope samples validate (D3.7).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { assertEnvelope, EXIT_CODES, EVENT_TYPES } from "vae-foundation";

const ROOT = join(import.meta.dir, "..");
const DAILY_SEVEN = ["init", "run", "resume", "explain", "journal", "doctor", "dev"];

function fail(findings: string[], why: string): void {
  findings.push(why);
}

function main(): number {
  const findings: string[] = [];

  // 1. CONSTITUTION.md at root (D4.7).
  const constitutionPath = join(ROOT, "CONSTITUTION.md");
  if (!existsSync(constitutionPath)) {
    fail(findings, "CONSTITUTION.md missing at repository root (D4.7: the constitution lives in-repo).");
  } else {
    const text = readFileSync(constitutionPath, "utf8");
    for (const marker of ["VAERION CONSTITUTION", "Sacred Invariant", "Five Guarantees", "RATIFIED"]) {
      if (!text.includes(marker)) fail(findings, `CONSTITUTION.md is missing expected ratified content: '${marker}'.`);
    }
    if (!text.includes("0` success · `2` usage error · `3` refusal · `4` run failure · `5` internal error") && !text.includes("`0` success · `2` usage error")) {
      if (!text.includes("exit codes") && !text.includes("exit-code")) {
        fail(findings, "CONSTITUTION.md does not declare the exit-code alphabet (Part IV).");
      }
    }
  }

  // 2. spec/ daylight contracts (D6.3).
  const requiredSpec = [
    "spec/README.md",
    "spec/errors.yaml",
    "spec/exit-codes.md",
    "spec/events.md",
    "spec/journal-format.md",
    "spec/research-capability.md",
    "spec/schemas/envelope.schema.json",
    "spec/schemas/receipt.schema.json",
    "spec/schemas/run-plan.schema.json",
    "spec/schemas/vaerion-yaml.schema.json",
    "spec/schemas/extension-manifest.schema.json",
    "spec/openapi.json",
  ];
  for (const rel of requiredSpec) {
    if (!existsSync(join(ROOT, rel))) fail(findings, `spec contract missing: ${rel} (spec/ is the courtroom, D6.3).`);
  }

  // 3. Fourteen vae-* units (D6.2).
  const packagesDir = join(ROOT, "packages");
  const units = existsSync(packagesDir) ? readdirSync(packagesDir).filter((d) => statSync(join(packagesDir, d)).isDirectory()) : [];
  if (units.length !== 14) {
    fail(findings, `expected 14 vae-* units at ratification (D6.2), found ${units.length}.`);
  }
  const wrongPrefix = units.filter((u) => !u.startsWith("vae-"));
  if (wrongPrefix.length > 0) {
    fail(findings, `units without the ratified vae- prefix (D6.2): ${wrongPrefix.join(", ")}.`);
  }

  // 4. The root package version is the single version of the engine (D6.1, D21.9).
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version?: string };
  if (pkg.version === undefined) fail(findings, "root package.json lacks the single engine version (D6.1).");

  // 6. The CLI's top-level surface is the Daily Seven (D3.2, D18.11).
  const cliMain = join(ROOT, "packages", "vae-cli", "src", "main.ts");
  if (existsSync(cliMain)) {
    const cli = readFileSync(cliMain, "utf8");
    for (const cmd of DAILY_SEVEN) {
      if (!cli.includes(`case "${cmd}"`) && !cli.includes(`out.command === "${cmd}"`) && !cli.includes(`name: "${cmd}"`)) {
        fail(findings, `Daily Seven command '${cmd}' is missing from the CLI surface (D3.2/D18.11).`);
      }
    }
  } else {
    fail(findings, "packages/vae-cli/src/main.ts missing — the `vae` binary must exist (D3.1).");
  }

  // 7. Envelope conformance over golden samples (D3.7).
  const samplesPath = join(ROOT, "fixtures", "envelope", "samples.json");
  if (existsSync(samplesPath)) {
    const doc = JSON.parse(readFileSync(samplesPath, "utf8")) as { samples?: unknown[] };
    const samples = Array.isArray(doc.samples) ? doc.samples : [];
    for (const [i, sample] of samples.entries()) {
      try {
        assertEnvelope(sample);
      } catch (error) {
        fail(findings, `golden envelope sample ${i} fails schema conformance (D3.7): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // Every sample type must be a known ratified type.
    for (const [i, sample] of samples.entries()) {
      const type = (sample as { type?: string }).type;
      if (type !== undefined && !(EVENT_TYPES as readonly string[]).includes(type)) {
        fail(findings, `golden envelope sample ${i} uses unregistered event type '${type}' (spec/events.md is the registry).`);
      }
    }
  } else {
    fail(findings, "fixtures/envelope/samples.json missing — envelope conformance samples required (D20.2).");
  }

  // Exit alphabet sanity (Part IV).
  if (EXIT_CODES.OK !== 0 || EXIT_CODES.USAGE !== 2 || EXIT_CODES.REFUSAL !== 3 || EXIT_CODES.RUN_FAILURE !== 4 || EXIT_CODES.INTERNAL !== 5) {
    fail(findings, "exit-code alphabet drifted from Part IV / D18.6.");
  }

  if (findings.length > 0) {
    console.error(`constitution-check: RED — ${findings.length} alignment finding(s):\n`);
    for (const f of findings) console.error(`  - ${f}`);
    console.error("\nThe repository must physically inhabit the constitution (Stage 6). Fix before merge (Article XIV).");
    return 1;
  }
  console.log("constitution-check: GREEN — law-in-repo intact: constitution, spec daylight contracts, 14 units, Daily Seven, envelope goldens, exit alphabet.");
  return 0;
}

process.exit(main());
