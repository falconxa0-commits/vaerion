/**
 * vae-capabilities — the pure decision function (D10.3, D10.1, D10.2).
 *
 * A decision is a deterministic pure function of (request, policy,
 * state): no inherited context, no discretionary overrides, no
 * environment reads. The function is exported separately from the
 * broker service so property tests can hammer it (D20.5).
 */

import type { BrokerDecision, CapabilityRequest } from "./capability.ts";
import type { PolicyView } from "./policy.ts";
import type { BrokerStateView } from "./state.ts";

export function decide(request: CapabilityRequest, policy: PolicyView, state: BrokerStateView): BrokerDecision {
  const key = `${request.capability.domain}.${request.capability.action}`;

  // 1. Fail-closed: the principal must declare the capability space (D2.7, D15.1).
  if (!state.isDeclared(request.principal, key)) {
    return {
      outcome: "deny",
      reasonCode: "E2001",
      explanation: `Capability '${key}' is not declared for principal '${request.principal.id}'.`,
      fix: "Declare the capability in the principal's capability space, or change policy through a reviewable config diff (D3.5).",
    };
  }

  // 2. Deny beats allow (D10.2): evaluate explicit denies first.
  const deny = policy.matchDeny(request);
  if (deny.matched) {
    return {
      outcome: "deny",
      reasonCode: "E2001",
      explanation: `Policy denies '${key}'${deny.rule ? ` by rule '${deny.rule}'` : ""}.`,
      fix: "Adjust the request to the declared capability space, or change policy through a reviewable config diff (D3.5).",
    };
  }

  // 3. Human-gate posture: requests marked for disposition park (D10.4).
  const gate = state.pendingGate(request);
  if (gate.required) {
    return {
      outcome: "park",
      reasonCode: "E2002",
      explanation: `The request requires human disposition and has been parked (gate ${gate.gateId}).`,
      fix: "Run `vae resume` after disposing of the parked gate; parked work is durable (D10.4).",
      gateId: gate.gateId,
    };
  }

  // 4. Allow only on an explicit, scoped grant.
  const allow = policy.matchAllow(request);
  if (allow.matched && policy.scopeMatches(request.capability)) {
    return { outcome: "allow", reasonCode: "OK", explanation: `Allowed by ${allow.rule ?? "declared scope"}.` };
  }

  // 5. Everything else fails closed (D10.1).
  return {
    outcome: "deny",
    reasonCode: "E2001",
    explanation: `No explicit grant covers '${key}' with scope '${request.capability.scope}'.`,
    fix: "Grant the capability through a reviewable config diff (D3.5); the engine does not improvise privilege.",
  };
}
