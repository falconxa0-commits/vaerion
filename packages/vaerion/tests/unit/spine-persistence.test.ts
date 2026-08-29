/**
 * Vaerion — spine persistence bridge (durable subscribers, R-RT1).
 *
 * subscribeFromCursor must backfill every journaled envelope AFTER the
 * cursor, in journal order, honoring the filter — then hand the subscription
 * to the live bus without dropping or reordering.
 */

import { describe, expect, test } from "bun:test";
import { EventBus } from "../../src/spine/bus.ts";
import { SpinePersistence, type ReplaySource } from "../../src/spine/persistence.ts";
import { draftEnvelope, type Envelope } from "../../src/spine/envelope.ts";
import { FixedClock } from "../../src/kernel/clock.ts";

const clock = new FixedClock(1735689600000);

function envOf(seq: number, type: string, payload: Record<string, unknown>): Envelope {
  const env = draftEnvelope({
    type,
    traceId: "t_persist",
    spanId: `s_${seq}`,
    actor: { kind: "system", id: "runtime" },
    cause: { kind: "origin", ref: null },
    payload,
    clock,
  });
  return { ...env, seq };
}

const JOURNALED: Envelope[] = [
  envOf(1, "research.source.fetched", { n: 1 }),
  envOf(2, "research.index.updated", { n: 2 }),
  envOf(3, "store.blob.put", { n: 3 }),
  envOf(4, "research.source.fetched", { n: 4 }),
];

function sourceOf(envs: Envelope[]): ReplaySource {
  return {
    async *envelopesFrom(fromSeq: number): AsyncIterable<Envelope> {
      for (const e of envs) {
        if (e.seq >= fromSeq) yield e;
      }
    },
  };
}

describe("SpinePersistence (durable subscribe with replay)", () => {
  test("backfill from cursor is in journal order, then live delivery continues", async () => {
    const bus = new EventBus();
    const persistence = new SpinePersistence(bus, sourceOf(JOURNALED));
    const seen: string[] = [];
    const sub = await persistence.subscribeFromCursor(1, { all: true }, (env) => {
      seen.push(`${env.seq}:${env.type}`);
    });
    // Backfilled 2,3,4 (cursor 1 is exclusive), in order.
    expect(seen).toEqual(["2:research.index.updated", "3:store.blob.put", "4:research.source.fetched"]);

    // Live events flow through the same handler after backfill.
    await bus.publish(envOf(5, "research.source.fetched", { n: 5 })); // publish drains synchronously in publish order
    expect(seen).toContain("5:research.source.fetched");
    sub.unsubscribe();
  });

  test("filters isolate types in BOTH backfill and live phases", async () => {
    const bus = new EventBus();
    const persistence = new SpinePersistence(bus, sourceOf(JOURNALED));
    const seen: number[] = [];
    const filter = { types: new Set(["research.source.fetched"]) };
    const sub = await persistence.subscribeFromCursor(0, filter, (env) => {
      seen.push(env.seq);
    });
    expect(seen).toEqual([1, 4]); // only fetched events, journal order
    await bus.publish(envOf(5, "research.source.fetched", {}));
    await bus.publish(envOf(6, "research.index.updated", {}));
    expect(seen).toEqual([1, 4, 5]); // live non-matching event excluded
    sub.unsubscribe();
  });

  test("async handlers are awaited during backfill (no overlap ordering bugs)", async () => {
    const bus = new EventBus();
    const persistence = new SpinePersistence(bus, sourceOf(JOURNALED));
    const seen: number[] = [];
    let running = 0;
    let maxConcurrent = 0;
    const sub = await persistence.subscribeFromCursor(0, { all: true }, async (env) => {
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      await new Promise((r) => setTimeout(r, 1));
      seen.push(env.seq);
      running--;
    });
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(maxConcurrent).toBe(1); // sequential: journal order is preserved
    sub.unsubscribe();
  });
});
