/**
 * vae-capabilities — capability vocabulary (Stage 10).
 *
 * A capability names a privileged effect and its scope. There is no
 * capability except by declaration and grant; everything else fails
 * closed (D10.1).
 */

export type CapabilityDomain = "fs" | "net" | "exec" | "secrets" | "engine" | "research" | "extension";

export interface Capability {
  readonly domain: CapabilityDomain;
  /** e.g. "read", "write", "fetch", "run", "selfcheck" */
  readonly action: string;
  /** Scope expression, e.g. "$PROJECT/src/**" or a host pattern. */
  readonly scope: string;
}

export interface PrincipalIdentity {
  readonly kind: "human" | "agent" | "engine" | "extension";
  readonly id: string;
  /** Capability space declared for this principal (D2.7, D15.1). */
  readonly declared: readonly string[];
}

export interface CapabilityRequest {
  readonly capability: Capability;
  readonly principal: PrincipalIdentity;
  /** Why the request exists (journaled with the decision, D9.3). */
  readonly cause: { readonly kind: string; readonly ref: string };
}

export type DecisionOutcome = "allow" | "deny" | "park";

export interface BrokerDecision {
  readonly outcome: DecisionOutcome;
  /** Stable reason code (feeds the refusal contract, Article XI). */
  readonly reasonCode: string;
  readonly explanation: string;
  /** Next legitimate step — every refusal offers one (Article XI). */
  readonly fix?: string;
  /** Present when outcome === "park": the durable gate id (D10.4). */
  readonly gateId?: string;
}
