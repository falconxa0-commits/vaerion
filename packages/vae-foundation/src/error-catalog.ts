/**
 * vae-foundation — Embedded E#### catalog (D3.8, D17.6, Appendix A).
 *
 * Source of truth: `spec/errors.yaml`. This module is the engine-side
 * embedding of that catalog; `test/catalog-contract.test.ts` fails on
 * drift between the two. Codes are additive-only and stable forever
 * (Article IX) — never rename, never renumber.
 */

import type { ErrorClass } from "./errors.ts";

export interface CatalogEntry {
  readonly code: string;
  readonly name: string;
  readonly class: ErrorClass;
  readonly message: string;
  readonly fix: string;
}

export const ERROR_CATALOG: Readonly<Record<string, CatalogEntry>> = Object.freeze({
  E1001: { code: "E1001", name: "SCHEMA_VERSION_UNSUPPORTED", class: "usage", message: "Configuration schema version is outside the supported range.", fix: "Set schemaVersion to a supported version (see spec/schemas) or upgrade the engine." },
  E1002: { code: "E1002", name: "CONFIG_UNKNOWN_KEY", class: "usage", message: "Configuration contains a key that is not in the schema.", fix: "Remove or rename the unknown key; unknown keys are refused, never ignored (D19.2)." },
  E1003: { code: "E1003", name: "CONFIG_TYPE_MISMATCH", class: "usage", message: "A configuration value has the wrong type for its key.", fix: "Correct the value type to match the schema; run `vae doctor` for provenance." },
  E1004: { code: "E1004", name: "CONFIG_PARSE_FAILED", class: "usage", message: "The configuration document is not valid VaerYaml.", fix: "Repair the syntax reported by the parser; VaerYaml is a strict subset of YAML (no anchors, aliases, tags, or multi-doc)." },
  E1005: { code: "E1005", name: "WORKSPACE_MISSING", class: "usage", message: "This directory is not a Vaerion workspace.", fix: "Run `vae init` to scaffold a workspace, or cd into an initialized project." },
  E1006: { code: "E1006", name: "ARGUMENT_INVALID", class: "usage", message: "A command argument is malformed.", fix: "Re-run with `--help` to see the accepted argument grammar." },
  E1007: { code: "E1007", name: "FLAG_UNKNOWN", class: "usage", message: "An unknown flag was supplied.", fix: "Run `--help` on the command; machine flags are limited to the guaranteed set." },
  E1008: { code: "E1008", name: "PLAN_INVALID", class: "usage", message: "The declared run plan failed structural validation.", fix: "Repair the plan file against spec/schemas/run-plan.schema.json (acyclic DAG, known step tools)." },
  E1009: { code: "E1009", name: "PLAN_MISSING", class: "usage", message: "The declared run plan was not found in the workspace.", fix: "Reference a plan that exists under `runs/`, or scaffold one with `vae init`." },
  E2001: { code: "E2001", name: "BROKER_DENIED", class: "refusal", message: "The Capability Broker denied the request.", fix: "Adjust the request to the declared capability space, or change policy through a reviewable config diff (D3.5)." },
  E2002: { code: "E2002", name: "BROKER_PARKED", class: "refusal", message: "The decision was parked for human disposition.", fix: "Run `vae resume` after disposing of the parked gate; parked work is durable (D10.4)." },
  E2003: { code: "E2003", name: "NON_INTERACTIVE_PROMPT", class: "refusal", message: "The command would prompt, but no TTY is attached.", fix: "Supply the missing input by flag or environment variable; the engine does not guess (D18.5)." },
  E2004: { code: "E2004", name: "WORKSPACE_EXISTS", class: "refusal", message: "A Vaerion workspace is already initialized in this directory.", fix: "Operate on the existing workspace, or initialize in an empty directory." },
  E2005: { code: "E2005", name: "UNREGISTERED_TOOL", class: "refusal", message: "The requested tool is not present in the versioned tool registry.", fix: "Register the tool with a declared spec (inputs, outputs, effect class, capabilities) before invocation (D16.1)." },
  E2006: { code: "E2006", name: "COMPATIBILITY_REFUSED", class: "refusal", message: "The declared compatibility range excludes this engine's contract version.", fix: "Publish or select an extension version whose compatibility range includes the running contract set (D15.4)." },
  E2007: { code: "E2007", name: "RESEARCH_CONNECTOR_ABSENT", class: "refusal", message: "Research was requested but no source connector is registered.", fix: "Register a connector behind a broker-granted capability; the engine performs no uncontrolled network access." },
  E2008: { code: "E2008", name: "RESEARCH_CAPABILITY_UNDECLARED", class: "refusal", message: "The principal has not declared the research capability.", fix: "Declare `research.fetch` in the principal's capability space and request it through the broker." },
  E2009: { code: "E2009", name: "PROVIDER_CHAIN_ABSENT", class: "refusal", message: "A model call was attempted without an explicit, visible fallback chain.", fix: "Declare the chain in configuration; implicit or improvised fallback is forbidden (D13.1)." },
  E2010: { code: "E2010", name: "DRIFT_DETECTED", class: "refusal", message: "Pinned state has drifted from its fingerprint.", fix: "Resolve the drift explicitly; reversion and resumption refuse on drift (D12.4)." },
  E2011: { code: "E2011", name: "AUDIT_SINK_DOWN", class: "refusal", message: "The audit sink is unavailable, so the privileged action is denied.", fix: "Restore the audit chain; audit failure equals denial (D10.7)." },
  E2012: { code: "E2012", name: "WRITER_ACTIVE", class: "refusal", message: "Another writer currently owns this run.", fix: "Wait for the active writer to finish; runs are single-writer (D11.1)." },
  E2013: { code: "E2013", name: "AUTH_TOKEN_INVALID", class: "refusal", message: "The pairing token is missing or invalid.", fix: "Present the workspace token (.vaerion/token) as a Bearer header; the daemon binds loopback only (D17.9)." },
  E3001: { code: "E3001", name: "JOURNAL_CHAIN_BROKEN", class: "run_failure", message: "Journal hash-chain verification failed.", fix: "Inspect the reported entry; the journal is append-only truth and tampering is detectable (D12.1)." },
  E3002: { code: "E3002", name: "BLOB_REF_MISSING", class: "run_failure", message: "A referenced blob is missing from the blob store.", fix: "Restore the blob or remove the reference through the explicit, reference-aware GC (D9.5, D12.5)." },
  E3003: { code: "E3003", name: "STEP_FAILED", class: "run_failure", message: "A declared step failed during execution.", fix: "Read the typed failure in the receipt (retryable/fatal/refusal) and re-run or repair accordingly." },
  E3004: { code: "E3004", name: "BUDGET_EXHAUSTED", class: "run_failure", message: "The budget was exhausted mid-run.", fix: "Raise the budget via a reviewable config change, or resume the parked remainder (D11.5)." },
  E3005: { code: "E3005", name: "HEALTH_CHECK_FAILED", class: "run_failure", message: "One or more doctor health checks failed.", fix: "Address each failed check's Fix line; re-run `vae doctor` until clean." },
  E5001: { code: "E5001", name: "INVARIANT_VIOLATION", class: "internal", message: "A sacred invariant guard fired inside the engine.", fix: "This is a C1-class engine bug: revert the offending change and report it (Article XII)." },
  E5002: { code: "E5002", name: "ENVELOPE_INVALID", class: "internal", message: "An envelope failed schema conformance before publication.", fix: "This is an engine bug: the envelope contract is machine-checked (D3.7); report it." },
  E5003: { code: "E5003", name: "RECEIPT_INVALID", class: "internal", message: "A receipt failed schema conformance.", fix: "This is an engine bug: receipts are constitutional evidence (Sacred Invariant V); report it." },
  E5004: { code: "E5004", name: "UNREACHABLE", class: "internal", message: "A path declared unreachable was executed.", fix: "This is an engine bug: report it with the journal reference." },
} satisfies Record<string, CatalogEntry>);

/** Look up a catalog entry; unknown codes throw (internal error). */
export function catalogEntry(code: string): CatalogEntry {
  const entry = ERROR_CATALOG[code];
  if (!entry) {
    throw new Error(`unknown error code ${code} — the catalog is the law (spec/errors.yaml)`);
  }
  return entry;
}

export const CATALOG_SIZE = Object.keys(ERROR_CATALOG).length;
