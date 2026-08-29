/**
 * Vaerion — broker contracts: permission graph.
 *
 * The permission graph models WHO may hold WHICH capability over WHAT scope,
 * and enforces the monotonic-narrowing property: an evolved graph may only
 * REMOVE or NARROW grants relative to its ancestor, never widen (checked
 * purely here; CI property test pins it).
 */

import type { CapabilityDefinition, CapabilityScope } from "./capability.ts";
import { scopeMatches } from "./capability.ts";
import type { PrincipalKind } from "./principal.ts";

export interface GraphNode {
  id: string;
  kind: PrincipalKind | "capability";
}

export interface GrantEdge {
  /** Principal node id. */
  from: string;
  /** Capability node id (`domain` or `domain#scope`). */
  to: string;
}

export interface PermissionGraph {
  graph_id: string;
  version: 1;
  /** Ancestor graph this one narrows (null for roots). */
  narrows: string | null;
  nodes: GraphNode[];
  edges: GrantEdge[];
  /** Capability definitions keyed by node id. */
  capabilities: Record<string, CapabilityDefinition>;
}

export function buildGraph(input: Omit<PermissionGraph, "version"> & { version?: 1 }): PermissionGraph {
  return { version: 1, ...input };
}

/**
 * Narrowing check: every grant in `evolved` must be covered by a grant in
 * `ancestor` (same from, domain covered, scope equal or narrower).
 * Returns the list of violations; empty = legal evolution.
 */
export function narrowingViolations(ancestor: PermissionGraph, evolved: PermissionGraph): string[] {
  const violations: string[] = [];
  const ancByEdge = new Map<string, GrantEdge[]>();
  for (const e of ancestor.edges) {
    const list = ancByEdge.get(e.from) ?? [];
    list.push(e);
    ancByEdge.set(e.from, list);
  }
  for (const edge of evolved.edges) {
    const candidates = ancByEdge.get(edge.from) ?? [];
    const cap = evolved.capabilities[edge.to];
    if (!cap) {
      violations.push(`edge ${edge.from}->${edge.to}: capability definition missing`);
      continue;
    }
    const covered = candidates.some((c) => {
      const ancCap = ancestor.capabilities[c.to];
      if (!ancCap || ancCap.domain !== cap.domain) return false;
      return cap.scopes.every((req: CapabilityScope) => ancCap.scopes.some((s) => scopeMatches(s, req)));
    });
    if (!covered) {
      violations.push(`edge ${edge.from}->${edge.to} (${cap.domain}) widens beyond ancestor`);
    }
  }
  return violations;
}

/** All capability definitions granted to a principal, transitively deduped. */
export function grantsFor(graph: PermissionGraph, principalId: string): CapabilityDefinition[] {
  const out = new Map<string, CapabilityDefinition>();
  for (const e of graph.edges) {
    if (e.from !== principalId) continue;
    const cap = graph.capabilities[e.to];
    if (cap) out.set(e.to, cap);
  }
  return Array.from(out.values());
}
