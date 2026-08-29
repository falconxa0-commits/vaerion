/**
 * Vaerion — research capability declarations.
 *
 * Law (ratified): research powers are granted, never ambient. A capability is
 * a first-class declaration naming its principal, its LOCAL sources, its
 * fencing posture, and its item ceiling. Network sources are forbidden
 * outright in this subsystem (E1402) — there is no code path that can declare
 * or use one; fetch/http/net are never imported anywhere under research/.
 */

import { VaerionError } from "../kernel/errors.ts";

/** The ONLY permitted source kind. Local paths, nothing else. */
export interface LocalSource {
  kind: "local";
  path: string;
}

export interface ResearchCapabilityDeclaration {
  name: string;
  principal: string;
  sources: LocalSource[];
  fencing: "untrusted" | "trusted";
  maxItems: number;
  rationale: string;
  declared_at: string;
}

export interface DeclareResearchCapabilityInput {
  name: string;
  principal: string;
  sources: LocalSource[];
  fencing?: "untrusted" | "trusted";
  maxItems?: number;
  rationale: string;
  declaredAt: string;
}

/**
 * Declare a research capability. Deterministic: the returned declaration is a
 * plain object built only from validated inputs (defaults applied explicitly).
 */
export function declareResearchCapability(input: DeclareResearchCapabilityInput): ResearchCapabilityDeclaration {
  if (!input || typeof input !== "object") {
    throw new VaerionError("E1600", "declareResearchCapability: input must be an object");
  }
  if (typeof input.name !== "string" || input.name.length === 0) {
    throw new VaerionError("E1600", "declareResearchCapability: name must be a non-empty string");
  }
  if (typeof input.principal !== "string" || input.principal.length === 0) {
    throw new VaerionError("E1600", `declareResearchCapability(${input.name}): principal must be a non-empty string`);
  }
  if (typeof input.rationale !== "string" || input.rationale.length === 0) {
    throw new VaerionError("E1600", `declareResearchCapability(${input.name}): rationale must be a non-empty string`);
  }
  if (typeof input.declaredAt !== "string" || input.declaredAt.length === 0) {
    throw new VaerionError("E1600", `declareResearchCapability(${input.name}): declaredAt must be a non-empty string`);
  }
  if (!Array.isArray(input.sources) || input.sources.length < 1) {
    throw new VaerionError("E1600", `declareResearchCapability(${input.name}): at least one source must be declared`);
  }
  for (const src of input.sources) {
    const s = src as Partial<LocalSource> | null;
    if (!s || typeof s !== "object") {
      throw new VaerionError("E1402", `declareResearchCapability(${input.name}): source is not an object`);
    }
    if (s.kind !== "local") {
      // E1402 research_network_forbidden: any non-local source kind is network
      // access by definition and cannot be declared, ever.
      throw new VaerionError(
        "E1402",
        `declareResearchCapability(${input.name}): source kind ${String(s.kind)} is forbidden — only {kind:"local"} sources are declarable`,
        { capability: input.name },
      );
    }
    if (typeof s.path !== "string" || s.path.length === 0) {
      throw new VaerionError("E1402", `declareResearchCapability(${input.name}): local source path must be a non-empty string`);
    }
  }
  const fencing = input.fencing ?? "untrusted";
  if (fencing !== "untrusted" && fencing !== "trusted") {
    throw new VaerionError("E1600", `declareResearchCapability(${input.name}): fencing must be "untrusted" or "trusted"`);
  }
  const maxItems = input.maxItems ?? 100;
  if (!Number.isInteger(maxItems) || maxItems < 1) {
    throw new VaerionError("E1600", `declareResearchCapability(${input.name}): maxItems must be a positive integer`);
  }
  return {
    name: input.name,
    principal: input.principal,
    sources: input.sources.map((s) => ({ kind: "local", path: (s as LocalSource).path })),
    fencing,
    maxItems,
    rationale: input.rationale,
    declared_at: input.declaredAt,
  };
}

/** Fail-closed lookup: an undeclared capability name is E1403, never a guess. */
export function assertCapabilityDeclared(caps: ResearchCapabilityDeclaration[], name: string): ResearchCapabilityDeclaration {
  const found = caps.find((c) => c.name === name);
  if (!found) {
    throw new VaerionError("E1403", `research capability not declared: ${name}`, { capability: name });
  }
  return found;
}

/**
 * Path is allowed iff it equals a declared source path or lies under it —
 * compared segment-wise ("/"-separated), never as a raw string prefix, so
 * "/ws/research" does not leak into "/ws/researchx".
 */
export function sourceAllowed(cap: ResearchCapabilityDeclaration, path: string): boolean {
  if (typeof path !== "string" || path.length === 0) return false;
  const segments = (p: string): string[] => p.split("/").filter((seg) => seg.length > 0 && seg !== ".");
  const target = segments(path);
  for (const src of cap.sources) {
    const base = segments(src.path);
    if (base.length === 0) return true; // declared root: everything is under it
    if (target.length < base.length) continue;
    let under = true;
    for (let i = 0; i < base.length; i++) {
      if (target[i] !== base[i]) {
        under = false;
        break;
      }
    }
    if (under) return true;
  }
  return false;
}
