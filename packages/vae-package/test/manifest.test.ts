import { describe, expect, it } from "bun:test";
import { blake3Ref } from "vae-foundation";
import { fingerprintManifest, digestsWellFormed, PACKAGE_STATUS, type VxnManifest } from "../src/manifest.ts";

const manifest: VxnManifest = {
  manifestVersion: 1,
  name: "demo",
  version: "0.1.0",
  toolchain: { runtime: "bun", version: "1.3.14" },
  contents: [{ path: "run.yaml", digest: blake3Ref("steps: []") }],
};

describe("vxn manifest contract (D8.2, D21.2)", () => {
  it("fingerprints identical manifests identically", () => {
    expect(fingerprintManifest(manifest)).toBe(fingerprintManifest(structuredClone(manifest)));
  });

  it("validates digest form (hash-pinned contents, D21.10)", () => {
    expect(digestsWellFormed(manifest)).toBeTrue();
    expect(digestsWellFormed({ ...manifest, contents: [{ path: "x", digest: "sha256:nope" }] })).toBeFalse();
  });

  it("declares the build pipeline as MS-6 work, honestly", () => {
    expect(PACKAGE_STATUS.buildSignVerifyPipeline).toBeFalse();
    expect(PACKAGE_STATUS.targetMilestone).toBe("MS-6");
  });
});
