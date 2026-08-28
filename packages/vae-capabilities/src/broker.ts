/**
 * vae-capabilities — the PermissionBroker service (Stage 10, D10.6, D10.7).
 *
 * The broker is the sole privileged gate. Every request — from agent,
 * tool, extension, or the core itself — evaluates here. Order of law:
 * audit-health first (audit failure = denial), then the pure decision
 * function, then refusal recording. Fail-closed, always.
 */

import type { VaeError } from "vae-foundation";
import { refusalError, type Clock, systemClock } from "vae-foundation";
import type { BrokerDecision, CapabilityRequest } from "./capability.ts";
import { decide } from "./decide.ts";
import type { PolicyView } from "./policy.ts";
import type { BrokerStateView } from "./state.ts";
import type { AuditSink } from "./audit.ts";
import { GateQueue } from "./gates.ts";
import type { RefusalLog } from "./refusal-log.ts";

export interface EvaluateResult {
  readonly decision: BrokerDecision;
  /** Populated when outcome is "park" — the durable gate handle. */
  readonly parkedAt?: string;
}

export class PermissionBroker {
  constructor(
    private readonly policy: PolicyView,
    private readonly state: BrokerStateView,
    private readonly audit: AuditSink,
    private readonly refusals: RefusalLog,
    private readonly gates?: GateQueue,
    private readonly clock: Clock = systemClock,
  ) {}

  /**
   * Evaluate one privileged request. Denials and parks are refusals:
   * explained, next-stepped, and recorded (Article XI).
   */
  evaluate(request: CapabilityRequest, causeRef: { kind: string; ref: string }): EvaluateResult {
    // Audit failure = denial (D10.7): a broken audit path can never
    // become a silent allow. The sink is not written in this state;
    // the refusal log is the durable incident record (D21.6).
    if (!this.audit.healthy()) {
      const denied: BrokerDecision = {
        outcome: "deny",
        reasonCode: "E2011",
        explanation: "The audit sink is unavailable, so the privileged action is denied.",
        fix: "Restore the audit chain; audit failure equals denial (D10.7).",
      };
      this.refusals.record(request, denied, causeRef);
      return { decision: denied };
    }

    const decision = decide(request, this.policy, this.state);

    if (decision.outcome === "allow") {
      this.audit.record({ type: "broker.decision", decision, request });
      return { decision };
    }

    if (decision.outcome === "park") {
      const gateId = decision.gateId ?? `gate-${this.clock.nowMs()}`;
      this.gates?.park({
        gateId,
        request,
        createdAtMs: this.clock.nowMs(),
        status: "pending",
      });
      const parked: BrokerDecision = { ...decision, gateId };
      this.audit.record({ type: "broker.parked", decision: parked, request });
      this.refusals.record(request, parked, causeRef);
      return { decision: parked, parkedAt: gateId };
    }

    // Denial: journal, refusal log, and a refusal error for the caller.
    this.audit.record({ type: "broker.denied", decision, request });
    this.refusals.record(request, decision, causeRef);
    return { decision };
  }

  /** Evaluate and throw a VaeError on deny (fail-closed ergonomics). */
  requireAllowed(request: CapabilityRequest, causeRef: { kind: string; ref: string }): void {
    const { decision } = this.evaluate(request, causeRef);
    if (decision.outcome === "deny") {
      throw refusalError(decision.reasonCode, decision.explanation, decision.fix ?? "Request the capability through a reviewable grant (D3.5).");
    }
    if (decision.outcome === "park") {
      throw refusalError(
        "E2002",
        decision.explanation,
        decision.fix ?? "Dispose of the parked gate, then `vae resume` (D10.4).",
      );
    }
  }

  /** Bridge for callers that need the typed error without throwing. */
  static refusalErrorOf(decision: BrokerDecision): VaeError {
    return refusalError(decision.reasonCode, decision.explanation, decision.fix ?? "See the refusal explanation for the next step.");
  }
}
