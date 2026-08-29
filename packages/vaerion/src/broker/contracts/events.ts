/**
 * Vaerion — broker event definitions.
 *
 * Typed payload contracts for broker.* events on the spine. MS-2's broker
 * implementation emits exactly these; the journal persists them; every
 * surface renders them. Payloads are redacted before emission.
 */

import type { BrokerDecisionRecord } from "./decision.ts";
import type { GateRecord } from "./gate.ts";
import type { Principal } from "./principal.ts";

export interface BrokerDecisionRecordedPayload {
  decision_id: string;
  request_id: string;
  domain: string;
  scope: string;
  kind: "allow" | "deny" | "prompt";
  policy: string;
  principal: Principal;
  intent: string;
}

export interface BrokerGateOpenedPayload {
  gate_id: string;
  run_id: string;
  question: string;
  options: Array<{ id: string; label: string }>;
}

export interface BrokerGateResolvedPayload {
  gate_id: string;
  run_id: string;
  resolution: "approved" | "denied" | "cancelled";
  answer_present: boolean;
}

export interface BrokerElevationRecordedPayload {
  decision_id: string;
  gate_id: string;
  run_id: string;
  /** The human's authority moment, journaled; the payload is redacted upstream. */
  approved: boolean;
}

export interface BrokerAuditAppendedPayload {
  audit_index: number;
  entry_kind: "decision" | "elevation" | "extension_load" | "lock_change";
  ref: string; // decision_id / gate_id / digest
}

export const brokerEvents = {
  decisionRecorded(rec: BrokerDecisionRecord): BrokerDecisionRecordedPayload {
    return {
      decision_id: rec.decision_id,
      request_id: rec.request_id,
      domain: rec.domain,
      scope: rec.scope,
      kind: rec.decision.kind,
      policy: rec.decision.policy,
      principal: rec.principal,
      intent: rec.intent,
    };
  },
  gateOpened(gate: GateRecord): BrokerGateOpenedPayload {
    return {
      gate_id: gate.gate_id,
      run_id: gate.run_id,
      question: gate.question,
      options: [...gate.options],
    };
  },
  gateResolved(gate: GateRecord, resolution: "approved" | "denied" | "cancelled"): BrokerGateResolvedPayload {
    return {
      gate_id: gate.gate_id,
      run_id: gate.run_id,
      resolution,
      answer_present: gate.answer !== undefined && gate.answer !== null,
    };
  },
  elevationRecorded(decisionId: string, gate: GateRecord, approved: boolean): BrokerElevationRecordedPayload {
    return {
      decision_id: decisionId,
      gate_id: gate.gate_id,
      run_id: gate.run_id,
      approved,
    };
  },
  auditAppended(auditIndex: number, entryKind: BrokerAuditAppendedPayload["entry_kind"], ref: string): BrokerAuditAppendedPayload {
    return { audit_index: auditIndex, entry_kind: entryKind, ref };
  },
};
