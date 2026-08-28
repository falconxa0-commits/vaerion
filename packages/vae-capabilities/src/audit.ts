/**
 * vae-capabilities — audit sink wiring (D10.7).
 *
 * Audit failure equals denial. The broker consults the audit sink
 * BEFORE an allow takes effect: if the audit write cannot proceed,
 * the decision is a refusal, never a silent allow. Every evaluate()
 * lands in the audit chain — allow or deny.
 */

import type { JournalWriter } from "vae-store";
import type { BrokerDecision, CapabilityRequest } from "./capability.ts";
import type { PrincipalRef, Cause } from "vae-foundation";

export interface AuditSink {
  record(entry: {
    type: "broker.decision" | "broker.denied" | "broker.parked";
    decision: BrokerDecision;
    request: CapabilityRequest;
  }): void;
  healthy(): boolean;
}

/** Audit sink that writes to the engine's audit chain (D12.2). */
export class JournalAuditSink implements AuditSink {
  constructor(private readonly audit: JournalWriter, private readonly actor: PrincipalRef, private readonly baseCause: Cause) {}

  record(entry: { type: "broker.decision" | "broker.denied" | "broker.parked"; decision: BrokerDecision; request: CapabilityRequest }): void {
    this.audit.append(
      {
        type: entry.type,
        actor: this.actor,
        cause: this.baseCause,
        payload: {
          outcome: entry.decision.outcome,
          reason_code: entry.decision.reasonCode,
          explanation: entry.decision.explanation,
          capability: `${entry.request.capability.domain}.${entry.request.capability.action}`,
          scope: entry.request.capability.scope,
          principal: `${entry.request.principal.kind}:${requestPrincipalId(entry.request)}`,
          cause: entry.request.cause,
        },
      },
    );
  }

  healthy(): boolean {
    return true;
  }
}

function requestPrincipalId(request: CapabilityRequest): string {
  return `${request.principal.kind}:${request.principal.id}`;
}

/** Test double that simulates an audit outage (D10.7 verification). */
export class FaultInjectedAuditSink implements AuditSink {
  public healthyState = true;
  public readonly recorded: unknown[] = [];

  record(entry: unknown): void {
    if (!this.healthyState) throw new Error("audit sink down");
    this.recorded.push(entry);
  }

  healthy(): boolean {
    return this.healthyState;
  }
}
