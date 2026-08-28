/**
 * vae-foundation — Principals and causes (D9.3, Article II).
 *
 * Every event names who acted and why. Agents act under human
 * authority, never instead of it (Sacred Invariant IX).
 */

export type PrincipalKind = "human" | "agent" | "engine" | "extension";

/** Attribution reference carried on every envelope and journal entry. */
export interface PrincipalRef {
  readonly kind: PrincipalKind;
  readonly id: string;
  readonly display?: string;
}

/** Why the act happened: the declaring intent behind it. */
export interface Cause {
  /** e.g. "command", "plan", "policy", "human-gate", "research-request" */
  readonly kind: string;
  /** Reference the cause resolves against (plan id, command line, gate id, …). */
  readonly ref: string;
}

export function principal(kind: PrincipalKind, id: string, display?: string): PrincipalRef {
  return display === undefined ? { kind, id } : { kind, id, display };
}

export const ENGINE_PRINCIPAL: PrincipalRef = { kind: "engine", id: "vae-core" };
export const HUMAN_OPERATOR: PrincipalRef = { kind: "human", id: "operator" };

export function cause(kind: string, ref: string): Cause {
  return { kind, ref };
}
