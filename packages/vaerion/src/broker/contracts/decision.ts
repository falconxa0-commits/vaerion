/**
 * Vaerion — broker contracts: policies and decisions.
 *
 * Decision law (ratified):
 *   - fail-closed: un-evaluable ⇒ Deny (E1301), never Allow-by-default;
 *   - decide → journal → act: a privileged action fires only after its
 *     decision record is journaled (E1304 otherwise);
 *   - every decision, allow or deny, lands in the audit ledger.
 *
 * MS-2 will implement the broker engine itself; MS-1 freezes these contracts
 * so the engine lands against stable law rather than redesign.
 */

import type { Principal } from "./principal.ts";
import type { CapabilityDomain } from "./capability.ts";
import { scopeMatches } from "./capability.ts";

/** The request a principal makes when it wants to DO something privileged. */
export interface DecisionRequest {
  request_id: string; // ULID
  principal: Principal;
  domain: CapabilityDomain;
  scope: string;
  /** Action parameters (e.g. target path, host, tool name). Redacted on journal. */
  action: Record<string, unknown>;
  /** Why the action is needed — required; empty intent is not evaluable. */
  intent: string;
}

export type BrokerDecision =
  | { kind: "allow"; policy: string }
  | { kind: "deny"; reason_code: "E1300" | "E1301"; reason: string; policy: string }
  | { kind: "prompt"; gate_id: string; reason: string; policy: string };

/**
 * The journaled decision record. `action` payloads are redacted before
 * journaling (kernel/redact.ts) — decisions never carry secrets.
 */
export interface BrokerDecisionRecord {
  decision_id: string; // ULID
  request_id: string;
  run_id: string;
  trace_id: string;
  principal: Principal;
  domain: CapabilityDomain;
  scope: string;
  intent: string;
  /** The request's action parameters, redacted (never carries secrets). */
  action?: Record<string, unknown>;
  decision: BrokerDecision;
  /** Human-authority input when decision.kind === "prompt" and resolved. */
  resolved_by?: "human" | "policy";
  resolved_answer?: Record<string, unknown>;
  decided_at: string; // RFC3339
}

export function assertDecisionRecordShape(value: unknown): asserts value is BrokerDecisionRecord {
  const d = value as Partial<BrokerDecisionRecord> | null;
  const fail: (m: string) => never = (m) => {
    throw Object.assign(new Error(m), { code: "E1304" });
  };
  if (!d || typeof d !== "object") fail("decision record missing");
  if (typeof d.decision_id !== "string" || d.decision_id.length === 0) fail("decision_id missing");
  if (typeof d.request_id !== "string" || d.request_id.length === 0) fail("request_id missing");
  if (typeof d.run_id !== "string" || d.run_id.length === 0) fail("run_id missing");
  if (typeof d.trace_id !== "string" || d.trace_id.length === 0) fail("trace_id missing");
  if (!d.principal || typeof d.principal !== "object") fail("principal missing");
  if (typeof d.domain !== "string" || d.domain.length === 0) fail("domain missing");
  if (typeof d.scope !== "string" || d.scope.length === 0) fail("scope missing");
  if (typeof d.intent !== "string" || d.intent.length === 0) fail("intent missing — decisions require stated intent");
  if (!d.decision || typeof d.decision !== "object") fail("decision body missing");
  const dec = d.decision as Partial<BrokerDecision>;
  if (dec.kind !== "allow" && dec.kind !== "deny" && dec.kind !== "prompt") fail(`decision.kind invalid: ${String(dec.kind)}`);
  if (typeof (d.decided_at as unknown) !== "string") fail("decided_at missing");
}

/**
 * Policy contract: ordered rules; first match wins; NO match ⇒ fail-closed
 * deny. A policy that would evaluate to "allow" without any matching rule is
 * structurally impossible — the type system plus this evaluator enforce it.
 */
export interface PolicyRule {
  id: string;
  /** Principal kinds this rule applies to. Empty = all. */
  principalKinds: Array<Principal["kind"]> | "all";
  domain: CapabilityDomain | "*";
  /** Scope pattern (capability.ts matcher). */
  scope: string;
  effect: "allow" | "deny" | "prompt";
  /** Prompt rules name the gate label shown to the human. */
  gateLabel?: string;
  rationale: string;
}

export interface PolicyContract {
  policy_id: string;
  version: 1;
  rules: PolicyRule[];
}

export function evaluatePolicy(
  policy: PolicyContract,
  req: DecisionRequest,
): BrokerDecision {
  for (const rule of policy.rules) {
    if (rule.principalKinds !== "all" && !rule.principalKinds.includes(req.principal.kind)) continue;
    if (rule.domain !== "*" && rule.domain !== req.domain) continue;
    if (!scopeMatches(rule.scope, req.scope)) continue;
    if (rule.effect === "allow") return { kind: "allow", policy: rule.id };
    if (rule.effect === "deny") return { kind: "deny", reason_code: "E1300", reason: rule.rationale, policy: rule.id };
    return {
      kind: "prompt",
      gate_id: `${req.request_id}:${rule.id}`,
      reason: rule.gateLabel ?? rule.rationale,
      policy: rule.id,
    };
  }
  // Fail-closed: the only legal fall-through.
  return { kind: "deny", reason_code: "E1301", reason: "no policy rule matched — broker fails closed", policy: `${policy.policy_id}:default-deny` };
}
