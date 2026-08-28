/**
 * vae-capabilities — the Refusal Log (D2.6, FR-4, Article XI).
 *
 * Every refusal — broker denial, park, non-interactive refusal — is a
 * first-class, honored outcome: explained, next-stepped, and recorded
 * in the standing honesty ledger.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { iso, redactPayload, type Json } from "vae-foundation";
import type { BrokerDecision, CapabilityRequest } from "./capability.ts";

export interface RefusalEntry {
  readonly v: 1;
  readonly ts: string;
  readonly capability: string;
  readonly scope: string;
  readonly principal: string;
  readonly outcome: BrokerDecision["outcome"];
  readonly reason_code: string;
  readonly explanation: string;
  readonly fix?: string;
  readonly cause: { readonly kind: string; readonly ref: string };
}

export class RefusalLog {
  constructor(private readonly file: string) {}

  record(request: CapabilityRequest, decision: BrokerDecision, causeRef: { kind: string; ref: string }): RefusalEntry {
    const entry: RefusalEntry = {
      v: 1,
      ts: iso(Date.now()),
      capability: `${request.capability.domain}.${request.capability.action}`,
      scope: request.capability.scope,
      principal: `${request.principal.kind}:${request.principal.id}`,
      outcome: decision.outcome,
      reason_code: decision.reasonCode,
      explanation: decision.explanation,
      ...(decision.fix !== undefined ? { fix: decision.fix } : {}),
      cause: causeRef,
    };
    this.append((entry as unknown) as Json);
    return entry;
  }

  /** Record an engine-level refusal that is not broker-mediated. */
  recordEngineRefusal(code: string, explanation: string, fix: string, causeRef: { kind: string; ref: string }): RefusalEntry {
    const entry: RefusalEntry = {
      v: 1,
      ts: iso(Date.now()),
      capability: "engine.command",
      scope: "core",
      principal: "engine:vae-core",
      outcome: "deny",
      reason_code: code,
      explanation,
      fix,
      cause: causeRef,
    };
    this.append((entry as unknown) as Json);
    return entry;
  }

  all(): RefusalEntry[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as RefusalEntry);
  }

  private append(entry: Json): void {
    mkdirSync(dirname(this.file), { recursive: true });
    // Redaction at the write boundary (D9.4): the refusal ledger never
    // stores secrets, whatever the caller put in the cause reference.
    appendFileSync(this.file, `${JSON.stringify(redactPayload(entry))}\n`, "utf8");
  }
}
