/**
 * Vaerion — research principal.
 *
 * Law: research is a DECLARED capability, never an ambient power. The research
 * principal is the actor identity stamped on every research event (attribution
 * law: actor.kind === "research") and is the subject named by a
 * ResearchCapabilityDeclaration. No principal, no research action.
 */

import { VaerionError } from "../kernel/errors.ts";

export interface ResearchPrincipal {
  kind: "research";
  id: string;
  runId?: string;
  capability: string;
}

/** Mint a research principal. `capability` must already be a declared name. */
export function researchPrincipal(id: string, capability: string, runId?: string): ResearchPrincipal {
  if (typeof id !== "string" || id.length === 0) {
    throw new VaerionError("E1600", "research principal: id must be a non-empty string");
  }
  if (typeof capability !== "string" || capability.length === 0) {
    throw new VaerionError("E1403", "research principal: capability must be a declared (non-empty) capability name");
  }
  if (runId !== undefined && (typeof runId !== "string" || runId.length === 0)) {
    throw new VaerionError("E1600", "research principal: runId must be a non-empty string when present");
  }
  return runId === undefined
    ? { kind: "research", id, capability }
    : { kind: "research", id, runId, capability };
}

/** Structural validation. E1403 when the capability name is missing/empty. */
export function assertResearchPrincipalShape(value: unknown): asserts value is ResearchPrincipal {
  const p = value as Partial<ResearchPrincipal> | null;
  if (!p || typeof p !== "object") {
    throw new VaerionError("E1600", "research principal shape: not an object");
  }
  if (p.kind !== "research") {
    throw new VaerionError("E1600", `research principal shape: kind must be "research", got ${String(p.kind)}`);
  }
  if (typeof p.id !== "string" || p.id.length === 0) {
    throw new VaerionError("E1600", "research principal shape: id must be a non-empty string");
  }
  if (typeof p.capability !== "string" || p.capability.length === 0) {
    throw new VaerionError("E1403", "research principal shape: capability not declared (empty or missing)");
  }
  if (p.runId !== undefined && (typeof p.runId !== "string" || p.runId.length === 0)) {
    throw new VaerionError("E1600", "research principal shape: runId must be a non-empty string when present");
  }
}
