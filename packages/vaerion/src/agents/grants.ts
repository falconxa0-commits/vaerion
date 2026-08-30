/**
 * Vaerion — agent permission grants (MS-4 wiring).
 *
 * The agent principal acts inside the permission-graph ceiling like every
 * other principal. Its grants are DERIVED from human declarations only:
 *
 *   - tool.call: one grant over every DECLARED tool scope (config.tools) —
 *     declaring a tool in vaerion.yaml is the human's statement that this
 *     tool exists; the broker policy still decides allow/deny/prompt.
 *   - model.invoke: the DECLARED model scopes (enabled gateway providers'
 *     concrete `provider/model` ceilings) that a declared policy rule admits
 *     for agents — the human typed both the models and the rules; nothing
 *     is invented here.
 *
 * Fail-closed: declare nothing, grant nothing. Derived grants are concrete
 * scope strings that sit INSIDE the standing ceilings (graphFromConfig
 * enforces coverage), so grants only ever narrow.
 */

import type { VaerionConfig } from "../config/config.ts";
import type { PolicyContract } from "../broker/contracts/decision.ts";
import type { ConfigGrantInput } from "../broker/engine.ts";
import type { Principal } from "../broker/contracts/principal.ts";
import { scopeMatches } from "../broker/contracts/capability.ts";

/** Does any declared rule admit `agentKind` for `domain` over `scope`? */
function policyAdmits(policy: PolicyContract, domain: string, scope: string, agentKind: Principal["kind"]): boolean {
  return policy.rules.some((rule) => {
    if (rule.domain !== domain && rule.domain !== "*") return false;
    if (rule.effect === "deny") return false;
    if (rule.principalKinds !== "all" && !rule.principalKinds.some((k) => k === agentKind)) return false;
    return scopeMatches(rule.scope, scope);
  });
}

/** Derive the agent's ceiling-internal grants from config + policy. */
export function agentGrants(config: VaerionConfig, policy: PolicyContract, agent: Principal): ConfigGrantInput[] {
  const grants: ConfigGrantInput[] = [];
  // Tool ceilings: declared tools + declared extensions only (declared-before-used
  // law; an extension is reachable as a tool, so its name is its scope).
  const toolScopes = [
    ...(config.tools ?? []).map((t) => t.scope ?? t.name),
    ...(config.extensions ?? []).map((e) => e.name),
  ];
  if (toolScopes.length > 0) grants.push({ principalId: agent.id, domain: "tool.call", scopes: toolScopes });
  // Model ceilings: concrete declared models admitted by declared policy.
  const modelScopes: string[] = [];
  for (const [provider, p] of Object.entries(config.gateway?.providers ?? {})) {
    if (!p.enabled) continue;
    for (const model of p.models ?? []) {
      const scope = `${provider}/${model}`;
      if (policyAdmits(policy, "model.invoke", scope, agent.kind)) modelScopes.push(scope);
    }
  }
  if (modelScopes.length > 0) grants.push({ principalId: agent.id, domain: "model.invoke", scopes: modelScopes });
  return grants;
}

/** The builtin scopes the R-2 host bridge exposes to extensions. */
export const BRIDGEABLE_BUILTIN_SCOPES: ReadonlyArray<string> = ["echo", "clock.read"];

/**
 * Derive the EXTENSION principal's ceiling-internal grants (MS-5, ADR-0009):
 * an extension may bridge only to the declared builtins, and only where a
 * declared policy rule admits `extension` for that scope. Declaring an
 * extension grants nothing by itself — this mirrors agentGrants.
 */
export function extensionGrants(config: VaerionConfig, policy: PolicyContract): ConfigGrantInput[] {
  if ((config.extensions ?? []).length === 0) return [];
  const scopes = BRIDGEABLE_BUILTIN_SCOPES.filter((scope) => policyAdmits(policy, "tool.call", scope, "extension"));
  if (scopes.length === 0) return [];
  return (config.extensions ?? []).map((ext) => ({ principalId: `extension:${ext.name}`, domain: "tool.call", scopes: [...scopes] }));
}
