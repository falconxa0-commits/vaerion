/**
 * Vaerion — the Permission Broker ENGINE (MS-2).
 *
 * The first-class subsystem the contracts anticipated (ADR-0004). Evaluation
 * law, unchanged and now enforced in one place:
 *
 *   1. A request must state WHO (principal), WHAT (domain), OVER WHAT
 *      (scope), and WHY (intent). Missing any ⇒ fail-closed deny (E1301).
 *   2. The permission graph is a CEILING: when a graph is supplied, the
 *      principal's grants must cover the request BEFORE policy is consulted.
 *      A policy allow can never exceed the ceiling (monotonic narrowing,
 *      enforced here at evaluation time; graph evolution narrows by
 *      construction per contracts/permission-graph.ts).
 *   3. Policy rules evaluate first-match-wins; NO match ⇒ fail-closed deny
 *      (E1301). This evaluator does not widen contracts/decision.ts — it
 *      delegates to it.
 *
 * The engine is PURE with respect to I/O: it evaluates and RETURNS; the run
 * harness sequences journaling (decide → journal → act) and the refusal log
 * records what was refused. That keeps the broker inside L1 (no runtime,
 * no journal knowledge) while every caller gets identical law.
 */

import type { Principal } from "./contracts/principal.ts";
import { assertPrincipalShape } from "./contracts/principal.ts";
import type { CapabilityDomain, CapabilityScope } from "./contracts/capability.ts";
import { scopeMatches } from "./contracts/capability.ts";
import type { DecisionRequest, BrokerDecision, PolicyContract } from "./contracts/decision.ts";
import { evaluatePolicy } from "./contracts/decision.ts";
import type { PermissionGraph } from "./contracts/permission-graph.ts";
import { grantsFor } from "./contracts/permission-graph.ts";
import type { VaerionConfig } from "../config/config.ts";

export interface BrokerEvaluation {
  decision: BrokerDecision;
  /** Why the ceiling layer passed or refused (null when no graph was supplied). */
  ceiling: { enforced: boolean; ok: boolean; reason: string | null };
  /** Rule/ceiling id that produced the final decision (audit + review aid). */
  authority: string;
}

/** Does the graph grant `principalId` the domain+scope anywhere? */
export function graphCovers(graph: PermissionGraph, principalId: string, domain: CapabilityDomain, scope: CapabilityScope): { ok: boolean; reason: string } {
  const grants = grantsFor(graph, principalId);
  if (grants.length === 0) {
    return { ok: false, reason: `no capability granted to principal "${principalId}" in the permission graph` };
  }
  for (const grant of grants) {
    if (grant.domain !== domain) continue;
    for (const s of grant.scopes) {
      if (scopeMatches(s, scope)) {
        return { ok: true, reason: `granted by ${grant.domain} over ${s}` };
      }
    }
  }
  return { ok: false, reason: `grants for "${principalId}" do not cover ${domain} over "${scope}"` };
}

export interface BrokerEngineInput {
  policy: PolicyContract;
  /** Permission-graph ceiling; null/omitted = policy-only (config ceilings unenforced). */
  graph?: PermissionGraph | null;
}

export class BrokerEngine {
  private readonly policy: PolicyContract;
  private readonly graph: PermissionGraph | null;

  constructor(input: BrokerEngineInput) {
    if (!input || typeof input !== "object") {
      throw Object.assign(new Error("BrokerEngine: input required"), { code: "E1600" });
    }
    if (!input.policy || typeof input.policy !== "object" || !Array.isArray(input.policy.rules)) {
      throw Object.assign(new Error("BrokerEngine: policy contract required"), { code: "E1600" });
    }
    this.policy = input.policy;
    this.graph = input.graph ?? null;
  }

  get policyId(): string {
    return this.policy.policy_id;
  }

  get graphId(): string | null {
    return this.graph?.graph_id ?? null;
  }

  /**
   * Evaluate a request. Fail-closed at every layer: shape → ceiling → policy.
   * Never throws for a policy answer; throws only for programmer error
   * (malformed engine input), which is E1600 territory.
   */
  evaluate(req: DecisionRequest): BrokerEvaluation {
    // Layer 0 — request shape. Un-evaluable ⇒ deny (E1301), never guess.
    const shapeProblem = requestShapeProblem(req);
    if (shapeProblem !== null) {
      return {
        decision: { kind: "deny", reason_code: "E1301", reason: `request is not evaluable: ${shapeProblem}`, policy: `${this.policy.policy_id}:fail-closed` },
        ceiling: { enforced: false, ok: false, reason: shapeProblem },
        authority: `${this.policy.policy_id}:fail-closed`,
      };
    }
    const principal = req.principal;
    assertPrincipalShape(principal);

    // Layer 1 — permission-graph ceiling (when enforced).
    if (this.graph !== null) {
      const cover = graphCovers(this.graph, principal.id, req.domain, req.scope);
      if (!cover.ok) {
        return {
          decision: { kind: "deny", reason_code: "E1300", reason: `permission ceiling refuses: ${cover.reason}`, policy: `${this.graph.graph_id}:ceiling` },
          ceiling: { enforced: true, ok: false, reason: cover.reason },
          authority: `${this.graph.graph_id}:ceiling`,
        };
      }
    }

    // Layer 2 — policy contract (first match wins; fall-through fails closed).
    const decision = evaluatePolicy(this.policy, req);
    const authority = decision.policy;
    return {
      decision,
      ceiling: this.graph !== null
        ? { enforced: true, ok: true, reason: `within ceiling for ${req.domain} over "${req.scope}"` }
        : { enforced: false, ok: true, reason: null },
      authority,
    };
  }
}

function requestShapeProblem(req: DecisionRequest): string | null {
  if (!req || typeof req !== "object") return "request must be an object";
  if (typeof req.request_id !== "string" || req.request_id.length === 0) return "request_id missing";
  if (!req.principal || typeof req.principal !== "object") return "principal missing";
  if (typeof req.domain !== "string" || req.domain.length === 0) return "domain missing";
  if (typeof req.scope !== "string" || req.scope.length === 0) return "scope missing";
  if (!req.action || typeof req.action !== "object") return "action missing";
  if (typeof req.intent !== "string" || req.intent.trim().length === 0) return "intent missing — decisions require stated intent";
  return null;
}

/* ───────────────────  config → broker inputs (MS-2 wiring)  ─────────────────── */

export interface ConfigGrantInput {
  principalId: string;
  domain: CapabilityDomain;
  scopes: CapabilityScope[];
}

/**
 * Build the permission-graph ceiling from vaerion.yaml plus explicit human
 * declarations (e.g. a run's journaled capability declaration).
 *
 * Law (authority precedence):
 *   - The human principal holds every DECLARED ceiling (fs.read anywhere
 *     locally, net hosts, exec commands, research sources).
 *   - An extra grant for a domain the config DOES declare must live INSIDE
 *     that ceiling — exceeding it is refused loudly (E1300); grants only
 *     ever narrow.
 *   - An extra grant for a domain the config does NOT declare originates in
 *     the human's own explicit declaration (the human typed it) — the human
 *     principal is extended with it and the grant is issued. There is no
 *     standing law to violate; the declaration moment IS the authority.
 */
export function graphFromConfig(config: VaerionConfig, graphId: string, extraGrants: ConfigGrantInput[] = []): PermissionGraph {
  const fail: (why: string) => never = (why) => {
    throw Object.assign(new Error(`permission ceiling: ${why}`), { code: "E1300" });
  };
  const capabilities: PermissionGraph["capabilities"] = {};
  const edges: PermissionGraph["edges"] = [];
  let capSeq = 0;
  const addGrant = (from: string, domain: CapabilityDomain, scopes: CapabilityScope[]): void => {
    if (scopes.length === 0) return;
    const id = `cap_${domain.replace(/\./g, "_")}_${capSeq++}`;
    capabilities[id] = { domain, scopes: [...scopes] };
    edges.push({ from, to: id });
  };

  addGrant("human", "fs.read", ["*"]);
  addGrant("human", "net.connect", [...(config.permissions?.net?.allowHosts ?? [])]);
  addGrant("human", "exec.run", [...(config.permissions?.exec?.allowCommands ?? [])]);
  for (const cap of config.research?.capabilities ?? []) {
    addGrant("human", "research.index", cap.sources.map((s) => s.path));
  }

  // Extra grants (journaled run declarations) must live INSIDE declared ceilings.
  const humanCeilings = new Map<CapabilityDomain, CapabilityScope[]>();
  for (const e of edges) {
    if (e.from !== "human") continue;
    const cap = capabilities[e.to];
    if (!cap) continue;
    humanCeilings.set(cap.domain, [...(humanCeilings.get(cap.domain) ?? []), ...cap.scopes]);
  }
  for (const grant of extraGrants) {
    const ceilings = humanCeilings.get(grant.domain);
    if (ceilings === undefined) {
      // No standing ceiling for this domain: the human's explicit declaration
      // creates it (and the human holds it too — they declared it).
      addGrant("human", grant.domain, grant.scopes);
      addGrant(grant.principalId, grant.domain, grant.scopes);
      continue;
    }
    for (const scope of grant.scopes) {
      const covered = ceilings.some((s) => scopeMatches(s, scope));
      if (!covered) {
        fail(`grant ${grant.domain} over "${scope}" to "${grant.principalId}" exceeds the config ceiling`);
      }
    }
    addGrant(grant.principalId, grant.domain, grant.scopes);
  }

  return {
    graph_id: graphId,
    version: 1,
    narrows: null,
    nodes: [
      { id: "human", kind: "human" },
      ...extraGrants.map((g) => ({ id: g.principalId, kind: g.principalId.startsWith("research") ? ("research" as const) : ("agent" as const) })),
    ],
    edges,
    capabilities,
  };
}
