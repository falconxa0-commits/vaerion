/**
 * vae-capabilities — broker state view (D10.3, D10.4).
 *
 * The decision function sees state only through this snapshot view, so
 * determinism holds: same (request, policy, state) → same decision.
 */

import type { CapabilityRequest, PrincipalIdentity } from "./capability.ts";

export interface PendingGate {
  readonly gateId: string;
  readonly request: CapabilityRequest;
  readonly createdAtMs: number;
  readonly status: "pending" | "disposed";
}

export interface GateRequirement {
  readonly required: boolean;
  readonly gateId?: string;
}

export interface BrokerStateView {
  /** Is the capability declared in the principal's capability space? */
  isDeclared(principal: PrincipalIdentity, capabilityKey: string): boolean;
  /** Does this request need human disposition (irreversible effects)? */
  pendingGate(request: CapabilityRequest): GateRequirement;
}

/** Declarations shared by the engine principal (the core obeys the broker, D10.6). */
export const ENGINE_DECLARED_CAPABILITIES: readonly string[] = [
  "engine.selfcheck",
  "fs.read",
  "journal.append",
  "blob.put",
  "config.read",
];

export class SnapshotStateView implements BrokerStateView {
  constructor(
    private readonly declarations: ReadonlyMap<string, readonly string[]>,
    private readonly requireHumanApprovalFor: (request: CapabilityRequest) => boolean = () => false,
    private readonly gates: ReadonlyMap<string, PendingGate> = new Map(),
  ) {}

  isDeclared(principal: PrincipalIdentity, capabilityKey: string): boolean {
    const declared = this.declarations.get(`${principal.kind}:${principal.id}`) ?? principal.declared;
    const domain = capabilityKey.split(".")[0]!;
    return declared.includes(capabilityKey) || declared.includes(`${domain}.*`);
  }

  pendingGate(request: CapabilityRequest): GateRequirement {
    const existing = [...this.gates.values()].find(
      (g) => g.status === "pending" && g.request.capability === request.capability,
    );
    if (existing !== undefined) return { required: true, gateId: existing.gateId };
    if (!this.requireHumanApprovalFor(request)) return { required: false };
    return { required: true, gateId: `gate-${hashRequest(request)}` };
  }
}

function hashRequest(request: CapabilityRequest): string {
  // Stable gate id derived from the request identity (deterministic, D10.3).
  const key = `${request.principal.kind}:${request.principal.id}:${request.capability.domain}.${request.capability.action}:${request.capability.scope}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
