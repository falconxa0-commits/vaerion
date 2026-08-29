/**
 * Vaerion — broker contracts: principals.
 *
 * The broker mediates EVERY privileged operation identically regardless of
 * caller (ADR-0004). Principals are the who; capabilities are the what;
 * decisions are the record.
 */

export type PrincipalKind = "human" | "agent" | "tool" | "extension" | "research" | "system";

export interface Principal {
  kind: PrincipalKind;
  /** CRN or stable id, e.g. crn_run_01J…, crn_ext_<ulid>, "local-user". */
  id: string;
  /** For agent/research principals: the run that owns them (transient trust). */
  runId?: string;
  /** For extension principals: the digest pinned in vaerion.lock. */
  digest?: string;
}

export const HUMAN_PRINCIPAL: Principal = { kind: "human", id: "local-user" };
export const SYSTEM_PRINCIPAL: Principal = { kind: "human", id: "system" };

export function assertPrincipalShape(value: unknown): asserts value is Principal {
  const p = value as Partial<Principal> | null;
  const fail: (m: string) => never = (m) => {
    throw Object.assign(new Error(m), { code: "E1300" });
  };
  if (!p || typeof p !== "object") fail("principal missing");
  if (typeof p.kind !== "string" || !["human", "agent", "tool", "extension", "research", "system"].includes(p.kind)) {
    fail(`principal.kind invalid: ${String(p?.kind)}`);
  }
  if (typeof p.id !== "string" || p.id.length === 0) fail("principal.id missing");
}
