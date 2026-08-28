import { describe, expect, it } from "bun:test";
import { INTEL_STATUS } from "../src/ports.ts";

// MS-0 declares ports, not implementations. This test pins the honest
// inventory so the crate cannot silently pretend to work (D22.3).
describe("intel status inventory", () => {
  it("declares ports without an indexer implementation (MS-4)", () => {
    expect(INTEL_STATUS.portsDeclared).toBeTrue();
    expect(INTEL_STATUS.indexerImplemented).toBeFalse();
    expect(INTEL_STATUS.targetMilestone).toBe("MS-4");
  });
});
