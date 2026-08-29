/**
 * Vaerion — spine persistence bridge.
 *
 * Durable subscribers replay from a cursor (R-RT1): subscribe-with-replay
 * feeds every journaled envelope after `cursorSeq` first, then live events.
 * The journal is the truth; the bus is the fast path.
 */

import type { Envelope } from "./envelope.ts";
import type { EventBus, EventFilter, Subscription } from "./bus.ts";

export interface ReplaySource {
  /** Yields journaled envelopes with seq >= fromSeq, in journal order. */
  envelopesFrom(fromSeq: number): AsyncIterable<Envelope>;
}

export class SpinePersistence {
  constructor(
    private readonly bus: EventBus,
    private readonly source: ReplaySource,
  ) {}

  /**
   * Subscribe and backfill from `cursorSeq` (exclusive) before going live.
   * Backfill preserves journal order; live delivery then continues without
   * gaps because publish order == journal append order (single writer).
   */
  async subscribeFromCursor(
    cursorSeq: number,
    filter: EventFilter,
    handler: (env: Envelope) => void | Promise<void>,
  ): Promise<Subscription> {
    for await (const env of this.source.envelopesFrom(cursorSeq + 1)) {
      if (matchesFilter(filter, env)) await handler(env);
    }
    return this.bus.subscribe(filter, handler);
  }
}

function matchesFilter(filter: EventFilter, env: Envelope): boolean {
  if (filter.all) return true;
  if (!filter.types) return true;
  return filter.types.has(env.type);
}
