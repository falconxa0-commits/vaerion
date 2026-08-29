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
  // 19xx — internal invariants (never user-caused; always a bug)
  | "E1900" // internal_unreachable
  | "E1901"; // canonical_json_rejected_value

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
  E1900: { code: "E1900", name: "internal_unreachable", summary: "An internal invariant was violated (engine bug).", fix: "File a bug with the trace id; this is never user-caused." },
  E1901: { code: "E1901", name: "canonical_json_rejected_value", summary: "Value cannot be canonically serialized (float/undefined/symbol).", fix: "Encode the value as an integer or string before journaling; hashed content must be byte-stable." },
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
