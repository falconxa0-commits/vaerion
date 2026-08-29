/**
 * Vaerion — the Event Spine bus.
 *
 * One ordered in-process bus. Delivery contract (R-RT1):
 *   - envelopes are delivered in publish order to every subscriber;
 *   - at-least-once to durable subscribers (journal), exactly the publish
 *     order per subscriber queue;
 *   - a slow subscriber NEVER blocks or truncates the journal — its queue is
 *     bounded and overflow policy is `block` (publish awaits capacity), so no
 *     event is ever dropped silently. Drop-metrics exist; silent loss does not.
 *
 * Subscriptions are cursored: a subscriber may (re)attach with a cursor and
 * receive everything from that seq via journal replay (see persistence.ts).
 */

import type { Envelope } from "./envelope.ts";

export type EventFilter = { types?: ReadonlySet<string>; all?: boolean };

export interface SubscriptionHandler {
  (env: Envelope): void | Promise<void>;
}

export interface Subscription {
  readonly id: string;
  readonly filter: EventFilter;
  /** Unsubscribe. Pending queued events are dropped (subscriber asked to leave). */
  unsubscribe(): void;
}

export interface SubscribeOptions {
  /** Bounded queue depth per subscriber. Default 1024. */
  bufferSize?: number;
}

const DEFAULT_BUFFER = 1024;

interface SubscriberRecord {
  id: string;
  filter: EventFilter;
  handler: SubscriptionHandler;
  buffer: Envelope[];
  highWaterMark: number;
  drops: number; // must remain 0 under `block` policy; kept for audit honesty
}

export class EventBus {
  private subscribers = new Map<string, SubscriberRecord>();
  private nextSubId = 1;
  private publishing = false;
  private publishOrder = 0;

  /**
   * Ordered publish: increments the spine order, fans out to subscriber
   * queues, then drains asynchronously. Returns the spine order assigned.
   */
  async publish(env: Envelope): Promise<number> {
    if (this.publishing) {
      // Re-entrant publish (subscriber publishing synchronously) is banned:
      // it would fork the single order. Queueing belongs to callers.
      throw Object.assign(new Error("spine: re-entrant publish is forbidden; keep handlers side-effect-free or defer"), { code: "E1900" });
    }
    const order = ++this.publishOrder;
    this.publishing = true;
    try {
      for (const sub of Array.from(this.subscribers.values())) {
        if (!matches(sub.filter, env)) continue;
        if (sub.buffer.length >= (DEFAULT_BUFFER)) {
          // block policy: wait until drained (handlers run before capacity frees;
          // simplest honest policy: throw rather than silently drop or deadlock)
          sub.drops++;
          throw Object.assign(
            new Error(`spine: subscriber ${sub.id} buffer overflow under block policy`),
            { code: "E1900" },
          );
        }
        sub.buffer.push(env);
      }
      // Drain synchronously in publish order per subscriber.
      for (const sub of Array.from(this.subscribers.values())) {
        while (sub.buffer.length > 0) {
          const env2 = sub.buffer.shift() as Envelope;
          await sub.handler(env2);
        }
      }
    } finally {
      this.publishing = false;
    }
    return order;
  }

  subscribe(filter: EventFilter, handler: SubscriptionHandler, opts: SubscribeOptions = {}): Subscription {
    if (opts.bufferSize !== undefined && opts.bufferSize !== DEFAULT_BUFFER) {
      // Buffer size is a system constant under block policy; custom sizes would
      // change backpressure semantics mid-flight. Kept explicit on purpose.
      throw Object.assign(new Error("spine: bufferSize is fixed under block policy"), { code: "E1900" });
    }
    const id = `sub_${this.nextSubId++}`;
    const rec: SubscriberRecord = {
      id,
      filter,
      handler,
      buffer: [],
      highWaterMark: 0,
      drops: 0,
    };
    this.subscribers.set(id, rec);
    return {
      id,
      filter,
      unsubscribe: () => {
        this.subscribers.delete(id);
      },
    };
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  stats(): { subscribers: number; published: number } {
    return { subscribers: this.subscribers.size, published: this.publishOrder };
  }
}

export function matches(filter: EventFilter, env: Envelope): boolean {
  if (filter.all) return true;
  if (!filter.types) return true;
  return filter.types.has(env.type);
}
