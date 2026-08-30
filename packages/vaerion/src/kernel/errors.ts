/**
 * Vaerion kernel — stable diagnostic catalog (E####) + VaerionError.
 *
 * Law: spec/errors.yaml is the single source of truth for codes. This module is the
 * L0 runtime mirror of that catalog; `tools/verify.ts` asserts both stay in sync.
 *
 * Error culture (Master Blueprint §11.3): stable code + what failed + why likely
 * + `Fix:` actionable next step. Causes are never buried.
 */

/** Stable diagnostic code. Format: E#### (see spec/errors.yaml). */
export type ErrorCode =
  // 1xxx — journal & persistence
  | "E1000" // journal_lock_held
  | "E1001" // journal_chain_broken
  | "E1002" // journal_torn_tail
  | "E1003" // journal_record_invalid
  | "E1004" // journal_append_after_close
  | "E1005" // journal_seq_gap
  | "E1006" // journal_empty
  | "E1007" // blob_not_found
  | "E1008" // blob_digest_mismatch
  | "E1009" // journal_export_derivation_invalid
  // 11xx — event spine
  | "E1100" // envelope_invalid
  | "E1101" // event_type_unknown
  | "E1102" // envelope_seq_regression
  | "E1103" // subscription_cursor_unknown
  // 12xx — configuration
  | "E1200" // config_missing
  | "E1201" // config_unknown_key
  | "E1202" // config_schema_invalid
  // 13xx — permission broker contracts
  | "E1300" // broker_denied
  | "E1301" // broker_fail_closed
  | "E1302" // gate_pending
  | "E1303" // gate_already_resolved
  | "E1304" // broker_decision_unjournaled
  // 14xx — research subsystem
  | "E1400" // research_source_untrusted
  | "E1401" // research_fencing_violation
  | "E1402" // research_network_forbidden
  | "E1403" // research_capability_not_declared
  // 15xx — runtime / restoration
  | "E1500" // state_restore_failed
  | "E1501" // snapshot_mismatch
  | "E1502" // run_not_found
  // 16xx — surface / usage
  | "E1600" // usage_error
  | "E1601" // provider_unavailable
  | "E1602" // partial_with_repair_hint
  // 17xx — model gateway
  | "E1700" // gateway_model_unknown
  | "E1701" // gateway_op_unsupported
  | "E1702" // gateway_stream_invalid
  | "E1703" // gateway_budget_exceeded
  | "E1704" // gateway_secret_unresolved
  | "E1705" // gateway_breaker_open
  | "E1706" // gateway_transport_refused
  // 18xx — agents, workflow, evals (MS-4)
  | "E1800" // agent_plan_invalid
  | "E1801" // agent_tool_unknown
  | "E1802" // agent_tool_args_invalid
  | "E1803" // workflow_dag_invalid
  | "E1804" // agent_step_limit_exceeded
  | "E1805" // eval_golden_mismatch
  | "E1806" // citation_enforcement_violation
  // 19xx — internal invariants (never user-caused; always a bug)
  | "E1900" // internal_unreachable
  | "E1901" // canonical_json_rejected_value
  | "E2000" // daemon_auth_required
  | "E2001" // daemon_bind_refused
  | "E2002" // daemon_route_unknown
  | "E2003" // daemon_run_unknown
  | "E2004" // daemon_shutdown_echo_mismatch
  | "E2005" // daemon_cancel_unavailable
  | "E2006" // daemon_nonloopback_refused
  | "E2100" // extension_artifact_digest_mismatch
  | "E2101" // extension_not_declared
  | "E2102" // extension_protocol_violation
  | "E2103" // extension_timeout
  | "E2104"; // extension_spawn_failed

export interface ErrorDescriptor {
  readonly code: ErrorCode;
  readonly name: string;
  readonly summary: string;
  readonly fix: string;
}

/**
 * The runtime-visible slice of spec/errors.yaml. Keep aligned; verify.ts checks.
 */
export const ERROR_CATALOG: Readonly<Record<ErrorCode, ErrorDescriptor>> = {
  E1000: { code: "E1000", name: "journal_lock_held", summary: "Journal is locked by another writer.", fix: "Wait for the current writer to finish, or remove the stale lock via `vae journal recover <run>` after confirming no writer is alive." },
  E1001: { code: "E1001", name: "journal_chain_broken", summary: "Journal hash chain does not link at the reported record.", fix: "Run `vae journal verify <run>` for the first broken index; if the damage follows a crash, run `vae journal recover <run>`." },
  E1002: { code: "E1002", name: "journal_torn_tail", summary: "Journal ends with an incomplete record (torn write).", fix: "Run `vae journal recover <run>` to truncate the torn tail and re-seal the chain." },
  E1003: { code: "E1003", name: "journal_record_invalid", summary: "A journal record failed schema validation.", fix: "Inspect the reported line; restore from backup or quarantine the journal. Never hand-edit records." },
  E1004: { code: "E1004", name: "journal_append_after_close", summary: "Attempted to append to a closed journal.", fix: "Reopen the run with `vae resume <run>` before appending." },
  E1005: { code: "E1005", name: "journal_seq_gap", summary: "Journal envelope sequence numbers are not contiguous.", fix: "Run `vae journal verify <run>`; gaps indicate loss that must be investigated, never papered over." },
  E1006: { code: "E1006", name: "journal_empty", summary: "Journal contains no records.", fix: "Delete the empty journal or re-create the run." },
  E1007: { code: "E1007", name: "blob_not_found", summary: "Referenced blob is missing from the content-addressed store.", fix: "Run `vae doctor` to scan blob integrity; re-produce the blob from its originating step." },
  E1008: { code: "E1008", name: "blob_digest_mismatch", summary: "Blob content does not match its digest.", fix: "The store is corrupt at this ref; restore from backup or re-run the producing step." },
  E1009: { code: "E1009", name: "journal_export_derivation_invalid", summary: "Redacted export derivation metadata does not match its records.", fix: "Re-export from the source journal; never mutate exported files." },
  E1100: { code: "E1100", name: "envelope_invalid", summary: "Event envelope failed validation.", fix: "Check the envelope against spec/schemas/envelope.schema.json; fix the emitting site." },
  E1101: { code: "E1101", name: "event_type_unknown", summary: "Event type is not in the registry.", fix: "Register the type in spec/events/registry.json (additive-only) or fix the emitting site." },
  E1102: { code: "E1102", name: "envelope_seq_regression", summary: "Envelope seq went backwards or repeated within a run.", fix: "Emit through the journal writer, which allocates seq; never allocate seq at call sites." },
  E1103: { code: "E1103", name: "subscription_cursor_unknown", summary: "Subscription cursor does not exist in the journal.", fix: "Resubscribe with a cursor from `vae journal show <run>` or start from `--from-start`." },
  E1200: { code: "E1200", name: "config_missing", summary: "vaerion.yaml was not found.", fix: "Run `vae init` to scaffold a valid project configuration." },
  E1201: { code: "E1201", name: "config_unknown_key", summary: "vaerion.yaml contains a key outside the strict schema.", fix: "Remove the unknown key; Vaerion rejects drift instead of guessing intent." },
  E1202: { code: "E1202", name: "config_schema_invalid", summary: "vaerion.yaml violates the v0.1 schema.", fix: "See spec/schemas/vaerion-yaml.schema.json for the accepted shape." },
  E1300: { code: "E1300", name: "broker_denied", summary: "Permission broker denied the requested capability.", fix: "Inspect the recorded decision (`vae explain <trace>`); request the narrowest needed grant in vaerion.yaml." },
  E1301: { code: "E1301", name: "broker_fail_closed", summary: "Broker could not evaluate the request and failed closed.", fix: "Resolve the underlying broker error; un-evaluable requests are never allowed by law." },
  E1302: { code: "E1302", name: "gate_pending", summary: "A durable gate is awaiting human authority.", fix: "Answer with `vae resume <run> --answer '{...}'`." },
  E1303: { code: "E1303", name: "gate_already_resolved", summary: "Gate was already resolved; duplicate resolution refused.", fix: "Continue the run; the existing resolution is authoritative and journaled." },
  E1304: { code: "E1304", name: "broker_decision_unjournaled", summary: "A privileged action lacks a journaled decision.", fix: "Route the action through the broker contract so decide→journal→act is enforced." },
  E1400: { code: "E1400", name: "research_source_untrusted", summary: "Research content is untrusted and was not fenced.", fix: "Wrap external content with the fencing module before it enters any context." },
  E1401: { code: "E1401", name: "research_fencing_violation", summary: "Untrusted content escaped its fence into a trusted channel.", fix: "Keep untrusted content inside fenced blocks; instructions never mint authority." },
  E1402: { code: "E1402", name: "research_network_forbidden", summary: "Research attempted undeclared network access.", fix: "Declare sources in the research capability; network is a broker-mediated capability, never ambient." },
  E1403: { code: "E1403", name: "research_capability_not_declared", summary: "Research action used a capability that was not declared.", fix: "Declare the capability (and its scope) in the research capability declaration first." },
  E1500: { code: "E1500", name: "state_restore_failed", summary: "Run state could not be restored from its journal.", fix: "Run `vae journal verify <run>`; if the chain is green, report this as a reducer bug." },
  E1501: { code: "E1501", name: "snapshot_mismatch", summary: "Checkpoint snapshot does not match journal state at its seq.", fix: "Discard the snapshot and restore by full replay; snapshots are accelerators, never truth." },
  E1502: { code: "E1502", name: "run_not_found", summary: "Run id does not exist in this workspace.", fix: "List runs with `vae journal ls`." },
  E1600: { code: "E1600", name: "usage_error", summary: "Command was invoked incorrectly.", fix: "Re-run with `--help`; help always teaches and never executes." },
  E1601: { code: "E1601", name: "provider_unavailable", summary: "A required provider is unreachable.", fix: "Check connectivity and provider status, then retry; run `vae doctor` for diagnostics." },
  E1602: { code: "E1602", name: "partial_with_repair_hint", summary: "Operation completed partially; a repair path exists.", fix: "Follow the repair hint in the output, then re-run the failed part." },
  E1700: { code: "E1700", name: "gateway_model_unknown", summary: "The requested model is not resolvable to a provider adapter.", fix: "Use the canonical form provider/model-id (e.g. mockbrain/mock-1) and declare the model under gateway.providers in vaerion.yaml; `vae doctor` lists the capability matrix." },
  E1701: { code: "E1701", name: "gateway_op_unsupported", summary: "The provider does not implement the requested operation.", fix: "Pick a provider whose declared capability matrix covers the op (chat/embed/rerank); the matrix is listed by `vae dev` and `vae doctor`." },
  E1702: { code: "E1702", name: "gateway_stream_invalid", summary: "A provider stream violated the normalized stream contract.", fix: "Compare the response against the recorded cassette for this request; re-record the cassette if the provider drifted, and report the drift." },
  E1703: { code: "E1703", name: "gateway_budget_exceeded", summary: "The run budget (tokens or micro-USD) was exceeded.", fix: "Raise gateway.budgets in vaerion.yaml deliberately or start a new run; spend already journaled is real and is never hidden." },
  E1704: { code: "E1704", name: "gateway_secret_unresolved", summary: "A declared secret resolved to nothing at call time (keychain and environment both empty).", fix: "Store the value in the OS keychain (service \"vae\", account = the secret name) or export it as an environment variable, then retry; names live in config, values never do." },
  E1705: { code: "E1705", name: "gateway_breaker_open", summary: "The provider's circuit breaker is open after repeated failures.", fix: "Wait for the cooldown and probe again with `vae doctor`; the failures that opened it are journaled and must be investigated, not papered over." },
  E1706: { code: "E1706", name: "gateway_transport_refused", summary: "The transport refused the provider call (unreachable, DNS, aborted).", fix: "Check connectivity and provider status; the call was broker-authorized, so a repeated refusal is environmental. `vae doctor` reports the breaker state." },
  E1800: { code: "E1800", name: "agent_plan_invalid", summary: "The planner produced a plan that does not satisfy the plan contract.", fix: "Check the planner model's output against the plan JSON shape (steps with kind model|tool|note|context); scripted planners must declare valid steps." },
  E1801: { code: "E1801", name: "agent_tool_unknown", summary: "The requested tool is not declared in this workspace.", fix: "Declare the tool under tools: in vaerion.yaml; undeclared tools are refused fail-closed by the broker pipeline." },
  E1802: { code: "E1802", name: "agent_tool_args_invalid", summary: "Tool arguments failed the declared argument shape.", fix: "Match the tool's declared args schema (JSON object with the expected keys and types); see the tool's declaration in vaerion.yaml." },
  E1803: { code: "E1803", name: "workflow_dag_invalid", summary: "The workflow DAG is invalid (cycle, missing dependency, or duplicate node id).", fix: "Repair the DAG definition so every dependency references an existing node and the graph is acyclic; `vae run workflow --dag FILE` validates before executing." },
  E1804: { code: "E1804", name: "agent_step_limit_exceeded", summary: "The agent reached its step ceiling before completing the goal.", fix: "Raise agents.maxSteps in vaerion.yaml deliberately, narrow the goal, or resume the run; the steps already journaled are real work and are never hidden." },
  E1805: { code: "E1805", name: "eval_golden_mismatch", summary: "An evaluation report or transcript differs from its blessed golden fixture.", fix: "Re-run the scenario suite; if the change is intended, re-bless with VAE_BLESS=1 and review the diff — golden drift is a contract change, never noise." },
  E1806: { code: "E1806", name: "citation_enforcement_violation", summary: "An answer used research context without referencing its citations.", fix: "Answer with explicit citation references (cit_NNNN from the prepared context pack); unattributed claims over research content are refused by law." },
  E1900: { code: "E1900", name: "internal_unreachable", summary: "An internal invariant was violated (engine bug).", fix: "File a bug with the trace id; this is never user-caused." },
  E1901: { code: "E1901", name: "canonical_json_rejected_value", summary: "Value cannot be canonically serialized (float/undefined/symbol).", fix: "Encode the value as an integer or string before journaling; hashed content must be byte-stable." },
  E2000: { code: "E2000", name: "daemon_auth_required", summary: "The daemon request lacks the pairing token (or it does not match).", fix: "Pass the pairing token printed once at daemon start as 'Authorization: Bearer <token>'; /health, /version and /openapi.json are the only unauthenticated routes." },
  E2001: { code: "E2001", name: "daemon_bind_refused", summary: "The daemon refused a non-loopback bind.", fix: "Bind the daemon to 127.0.0.1 (default), the user runtime unix socket, or a Windows named pipe; remote exposure requires a ratified transport-security ADR, never a flag." },
  E2002: { code: "E2002", name: "daemon_route_unknown", summary: "No daemon route matches the method and path.", fix: "Fetch /openapi.json from the same daemon for the generated route surface; only implemented routes are described." },
  E2003: { code: "E2003", name: "daemon_run_unknown", summary: "The requested run id is not known to this daemon workspace.", fix: "List known runs from the journal directory; run ids are crn_run_* journal names under .vaerion/journal/." },
  E2004: { code: "E2004", name: "daemon_shutdown_echo_mismatch", summary: "The shutdown body did not echo the pairing token.", fix: "POST /shutdown with {\"token\":\"<pairing token>\"} — the echo guard prevents accidental shutdowns; authenticated callers still must echo the token in the body." },
  E2005: { code: "E2005", name: "daemon_cancel_unavailable", summary: "The run cannot be cancelled in its current state.", fix: "Cancellation is defined for runs awaiting a durable gate (the open gate is denied) or for open runs with no live executor; in-flight runs finish their journaled step first." },
  E2006: { code: "E2006", name: "daemon_nonloopback_refused", summary: "The wire client refused a non-loopback daemon address.", fix: "Attach the SDK client to 127.0.0.1, localhost or [::1] only; remote daemon attachment requires a ratified transport-security ADR." },
  E2100: { code: "E2100", name: "extension_artifact_digest_mismatch", summary: "The extension artifact does not match its pinned digest.", fix: "Re-pin the digest in vaerion.yaml only after verifying the artifact's provenance; a mismatched artifact is NEVER executed." },
  E2101: { code: "E2101", name: "extension_not_declared", summary: "The extension is not declared in this workspace.", fix: "Declare the extension under vaerion.yaml extensions: (name, artifact, digest) — declaring it grants nothing; the broker still decides every call." },
  E2102: { code: "E2102", name: "extension_protocol_violation", summary: "The extension broke the host protocol (bad handshake, unknown frame, oversized line, or unsolicited response).", fix: "Fix the extension to speak the published world (spec/wit/); the host kills the process fail-closed on the first violation." },
  E2103: { code: "E2103", name: "extension_timeout", summary: "The extension exceeded its time budget (handshake or call).", fix: "Raise extensions.timeoutMs deliberately, or fix the extension's latency; the process is killed and the call fails closed." },
  E2104: { code: "E2104", name: "extension_spawn_failed", summary: "The extension artifact could not be spawned (missing, not executable, or crash at exec).", fix: "Check the artifact path is an executable file and matches the pinned digest; the R-2 host executes exactly the declared artifact with an empty environment." },
};

export class VaerionError extends Error {
  readonly code: ErrorCode;
  readonly fix: string;
  readonly detail?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, detail?: Record<string, unknown>, cause?: unknown) {
    const d = ERROR_CATALOG[code];
    super(message ?? d.summary, cause === undefined ? undefined : { cause });
    this.name = "VaerionError";
    this.code = code;
    this.fix = d.fix;
    this.detail = detail;
  }

  /** Machine-parseable one-line form (`Fix:` contract, Blueprint §11.3). */
  toLine(): string {
    const detail = this.detail ? " " + JSON.stringify(this.detail) : "";
    return `${this.code} ${this.message}${detail} Fix: ${this.fix}`;
  }

  toJSON(): Record<string, unknown> {
    return { error: { code: this.code, name: ERROR_CATALOG[this.code].name, message: this.message, fix: this.fix, detail: this.detail ?? null } };
  }
}

export function isVaerionError(e: unknown): e is VaerionError {
  return e instanceof VaerionError;
}
