/**
 * vae-package — .vxn contract and fingerprinting (D8.2, D21.2, D21.10).
 *
 * Reproducible or not released (Stage 21 principle 1): two builds of
 * the same commit produce byte-identical artifacts, verified in CI.
 * MS-0 ships the manifest contract, the fingerprinting rule, and the
 * reproducibility declaration; the build/sign/verify pipeline is MS-6.
 */

import { blake3Text, canonicalJson } from "vae-foundation";

export interface VxnManifest {
  readonly manifestVersion: 1;
  readonly name: string;
  readonly version: string;
  /** Pinned toolchain — reproducibility requires pins, not vibes (D21.2). */
  readonly toolchain: { readonly runtime: string; readonly version: string };
  /** Contents with their blake3 digests (hash-pinned, D21.10). */
  readonly contents: readonly { readonly path: string; readonly digest: string }[];
}

/** Fingerprint a document set deterministically (D8.2). */
export function fingerprintManifest(manifest: VxnManifest): string {
  return blake3Text(canonicalJson(manifest));
}

/** Verify that a manifest's contents all carry plausible digests. */
export function digestsWellFormed(manifest: VxnManifest): boolean {
  return manifest.contents.every((c) => /^blake3:[0-9a-f]{64}$/.test(c.digest));
}

export const PACKAGE_STATUS = {
  manifestContract: true,
  fingerprinting: true,
  buildSignVerifyPipeline: false,
  reproducibleBuildVerification: false,
  targetMilestone: "MS-6",
} as const;
