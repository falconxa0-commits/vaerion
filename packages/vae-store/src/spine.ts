/**
 * vae-store — the event spine (Sacred Invariant I, D9.1).
 *
 * The journal is the log; the spine is stateless fan-out. The spine
 * keeps no truth of its own — it carries journal-anchored envelopes to
 * subscribers (renderers, streams, recorders). Delivery is
 * at-least-once; consumers MUST be idempotent (D9.6). Redaction is
 * applied by the publisher BEFORE an event crosses a trust boundary
 * (D9.4) — this component never forwards secrets.
 */

import type { Envelope, KnownEventType } from "vae-foundation";
import { isKnownEventType, redactPayload } from "vae-foundation";

export type SubscriptionFilter = { readonly types?: readonly KnownEventType[] };

export interface Subscription {
  readonly id: number;
  readonly filter?: SubscriptionFilter;
  deliver(envelope: Envelope): void;
}

export class EventSpine {
  private nextId = 1;
  private readonly subscriptions: Subscription[] = [];

  /** Subscribe a fan-out consumer. Attach/detach is always safe. */
  subscribe(sub: Omit<Subscription, "id">): Subscription {
    const full: Subscription = { id: this.nextId++, filter: sub.filter, deliver: sub.deliver };
    this.subscriptions.push(full);
    return full;
  }

  unsubscribe(id: number): void {
    const idx = this.subscriptions.findIndex((s) => s.id === id);
    if (idx >= 0) this.subscriptions.splice(idx, 1);
  }

  /**
   * Fan out one envelope. Unknown types are forwarded untouched
   * (forward-compat duty, envelope contract). Payloads are redacted at
   * this publication boundary (D9.4). Subscriber errors never corrupt
   * the spine: delivery failures are contained, not propagated.
   */
  publish(envelope: Envelope): void {
    const safe: Envelope =
      envelope.payload === undefined
        ? envelope
        : { ...envelope, payload: redactPayload(envelope.payload) };
    for (const sub of [...this.subscriptions]) {
      const types = sub.filter?.types;
      if (types !== undefined && !types.includes(safe.type as KnownEventType)) continue;
      try {
        sub.deliver(safe);
      } catch {
        // At-least-once contract (D9.6): a failing consumer must not
        // take the spine down; idempotent consumers may re-receive.
      }
    }
  }

  subscriberCount(): number {
    return this.subscriptions.length;
  }
}
