import { describe, expect, it } from "bun:test";
import { validateManifest, compatibilityAllows, canTransition, transition, EXT_HOST_STATUS } from "../src/manifest.ts";

const valid = {
  id: "com.example.helper",
  version: "1.0.0",
  compatibility: { engine: ">=0.1 <0.2" },
  requestedCapabilities: ["fs.read"],
  surfaces: ["journal.render"],
};

describe("extension manifests (D15.1, D15.4)", () => {
  it("accepts a complete manifest", () => {
    expect(() => validateManifest(valid)).not.toThrow();
  });

  it("refuses manifests without semver versions", () => {
    expect(() => validateManifest({ ...valid, version: "1.x" })).toThrow(/not semver/);
  });

  it("refuses manifests without a compatibility range", () => {
    expect(() => validateManifest({ ...valid, compatibility: { engine: "" } })).toThrow(/compatibility range/);
  });

  it("enforces compatibility ranges against the engine version (E2006 posture)", () => {
    expect(compatibilityAllows(">=0.1 <0.2", "0.1.0-ms.0")).toBeTrue();
    expect(compatibilityAllows(">=0.2", "0.1.0-ms.0")).toBeFalse();
    expect(compatibilityAllows("<0.1", "0.1.0-ms.0")).toBeFalse();
  });
});

describe("extension lifecycle (D15.2)", () => {
  it("follows registered → active → disabled → removed", () => {
    expect(canTransition("registered", "active")).toBeTrue();
    expect(canTransition("active", "disabled")).toBeTrue();
    expect(canTransition("disabled", "active")).toBeTrue();
    expect(canTransition("active", "removed")).toBeTrue();
    expect(() => transition("removed", "active")).toThrow(/Illegal extension lifecycle transition/);
    expect(() => transition("registered", "disabled")).toThrow(/Illegal/);
  });
});

describe("honest status inventory", () => {
  it("declares the sandbox runtime as MS-6 work, not present", () => {
    expect(EXT_HOST_STATUS.sandboxRuntime).toBeFalse();
    expect(EXT_HOST_STATUS.manifestValidation).toBeTrue();
    expect(EXT_HOST_STATUS.targetMilestone).toBe("MS-6");
  });
});
