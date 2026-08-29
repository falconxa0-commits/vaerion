/**
 * Vaerion — broker contracts: capabilities.
 *
 * A capability is DECLARED before it can be requested (no ambient powers).
 * Declarations come from vaerion.yaml (humans) or capability manifests
 * (extensions). Grants are ceilings that only ever narrow (monotonic
 * narrowing, §12.3 property).
 */

export type CapabilityDomain =
  | "fs.read" | "fs.write"
  | "net.connect"
  | "exec.run"
  | "model.invoke"
  | "secret.read"
  | "tool.call"
  | "intel.query"
  | "research.index"
  | "research.fetch"
  | "journal.append"
  | "journal.read";

/** Glob-ish scope. `*` alone = all; otherwise prefix/path/host patterns. */
export type CapabilityScope = string;

export interface CapabilityDefinition {
  domain: CapabilityDomain;
  scopes: CapabilityScope[];
}

/** What a principal is ALLOWED to ask for — never a guarantee of yes. */
export interface CapabilityDeclaration {
  principal: string; // principal id
  capabilities: CapabilityDefinition[];
  /** Human-visible rationale (audit + review). */
  rationale: string;
}

export interface CapabilitySet {
  principal: string;
  capabilities: ReadonlyArray<CapabilityDefinition>;
}

export function assertCapabilityDeclarationShape(value: unknown): asserts value is CapabilityDeclaration {
  const d = value as Partial<CapabilityDeclaration> | null;
  const fail: (m: string) => never = (m) => {
    throw Object.assign(new Error(m), { code: "E1301" });
  };
  if (!d || typeof d !== "object") fail("capability declaration missing");
  if (typeof d.principal !== "string" || d.principal.length === 0) fail("declaration.principal missing");
  if (!Array.isArray(d.capabilities)) fail("declaration.capabilities must be an array");
  for (const c of d.capabilities) {
    const cap = c as Partial<CapabilityDefinition> | null;
    if (!cap || typeof cap.domain !== "string") fail("capability.domain missing");
    if (!Array.isArray(cap.scopes) || cap.scopes.length === 0) fail("capability.scopes must be non-empty");
  }
  if (typeof d.rationale !== "string" || d.rationale.length === 0) fail("declaration.rationale missing");
}

/**
 * Narrow `requested` into `declared` scope lists (pure).
 * Fail-closed: an undeclared domain or unmatched scope yields NO match.
 */
export function scopeMatches(declared: CapabilityScope, requested: CapabilityScope): boolean {
  if (declared === "*") return true;
  if (declared === requested) return true;
  if (declared.endsWith("/**")) {
    const prefix = declared.slice(0, -2); // keep one '/'
    return requested.startsWith(prefix) || requested === prefix.slice(0, -1);
  }
  if (declared.endsWith("/*")) {
    const prefix = declared.slice(0, -1);
    return requested.startsWith(prefix) && !requested.slice(prefix.length).includes("/");
  }
  return false;
}

export function capabilityCovers(set: CapabilitySet, domain: CapabilityDomain, scope: string): boolean {
  return set.capabilities.some(
    (c) => c.domain === domain && c.scopes.some((s) => scopeMatches(s, scope)),
  );
}
