import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executionOrder, planFingerprint, validatePlan, type RunPlan } from "../src/plan.ts";
import { FileCheckpointStore } from "../src/checkpoint.ts";

const linear: RunPlan = {
  name: "linear",
  steps: [
    { id: "a", tool: "t.a" },
    { id: "b", tool: "t.b", needs: ["a"] },
    { id: "c", tool: "t.c", needs: ["b"] },
  ],
};

describe("declared run plans (D11.2, E1008)", () => {
  it("accepts a valid DAG", () => {
    expect(() => validatePlan(linear)).not.toThrow();
  });

  it("refuses duplicate step ids", () => {
    expect(() => validatePlan({ name: "dup", steps: [{ id: "a", tool: "t" }, { id: "a", tool: "t" }] })).toThrow(/duplicate step id/);
  });

  it("refuses unknown dependencies", () => {
    expect(() => validatePlan({ name: "ghost", steps: [{ id: "a", tool: "t", needs: ["nope"] }] })).toThrow(/unknown step 'nope'/);
  });

  it("refuses cycles", () => {
    expect(() =>
      validatePlan({
        name: "cycle",
        steps: [
          { id: "a", tool: "t", needs: ["c"] },
          { id: "b", tool: "t", needs: ["a"] },
          { id: "c", tool: "t", needs: ["b"] },
        ],
      }),
    ).toThrow(/dependency cycle/);
  });

  it("produces a deterministic dependency-first order", () => {
    const order = executionOrder(linear).map((s) => s.id);
    expect(order).toEqual(["a", "b", "c"]);
    const diamond: RunPlan = {
      name: "diamond",
      steps: [
        { id: "root", tool: "t" },
        { id: "left", tool: "t", needs: ["root"] },
        { id: "right", tool: "t", needs: ["root"] },
        { id: "join", tool: "t", needs: ["left", "right"] },
      ],
    };
    expect(executionOrder(diamond).map((s) => s.id)).toEqual(["root", "left", "right", "join"]);
  });

  it("fingerprints identical plans identically and different plans differently", () => {
    expect(planFingerprint(linear)).toBe(planFingerprint(structuredClone(linear)));
    expect(planFingerprint(linear)).not.toBe(planFingerprint({ ...linear, name: "other" }));
  });
});

describe("checkpoint store (D11.6)", () => {
  it("persists checkpoints durably and reads them back", () => {
    const dir = mkdtempSync(join(tmpdir(), "vae-ckpt-"));
    try {
      const store = new FileCheckpointStore(dir);
      store.write({ runId: "r1", stepId: "s1", phase: "before-effect", payload: { n: 1 }, tsMs: 1 });
      store.write({ runId: "r1", stepId: "s2", phase: "before-effect", payload: { n: 2 }, tsMs: 2 });
      store.write({ runId: "r2", stepId: "s1", phase: "before-effect", payload: { n: 3 }, tsMs: 3 });
      expect(store.all("r1").length).toBe(2);
      expect(store.latest("r1")?.stepId).toBe("s2");
      // A fresh store instance reads the same durable state (resume path).
      const reopened = new FileCheckpointStore(dir);
      expect(reopened.latest("r1")?.payload).toEqual({ n: 2 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
