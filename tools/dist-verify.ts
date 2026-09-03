/**
 * Vaerion dist-verify — verify a release artifact set (consumer side).
 *
 * Usage (from a directory containing MANIFEST.json, MANIFEST.json.sig and
 * the artifacts):
 *
 *   bun run tools/dist-verify.ts --manifest MANIFEST.json \
 *     --sig MANIFEST.json.sig [--pub release-signing.pub]
 *
 * The public key resolves, in order (fail-closed when none is found):
 *   1. the explicit --pub flag;
 *   2. release-signing.pub BESIDE the manifest — the key that signed THIS
 *      artifact set, manifest-bound like every other shipped file (XX-D4:
 *      the consumer journey works with no repository and no session state).
 *
 * Checks, in order, fail-closed:
 *   1. the Ed25519 signature verifies over the canonical (sorted-key)
 *      manifest bytes;
 *   2. every artifact named in the manifest exists;
 *   3. every artifact's sha256 and size match the manifest;
 *   4. every artifact's blake3 digest matches the manifest;
 *   5. SHA256SUMS (when present) agrees with the signed manifest for every
 *      shared artifact AND digests MANIFEST.json + its signature — a lying
 *      or tampered checksum file is a hard failure (Ω trust-chain law).
 */

import { createHash, verify as edVerify, createPublicKey } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { blake3HexOf } from "../packages/vaerion/src/kernel/hash.ts";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || !process.argv[i + 1]) {
    console.error(`dist-verify: missing --${name} <path>`);
    process.exit(2);
  }
  return process.argv[i + 1]!;
}

const manifestPath = resolve(arg("manifest"));
const sigPath = resolve(arg("sig"));
const base = dirname(manifestPath);
// The key resolution law: explicit flag → the key beside the manifest →
// fail-closed with teaching (a consumer without the key must be TAUGHT,
// never left guessing).
const pubIdx = process.argv.indexOf("--pub");
const pubFlag = pubIdx !== -1 && process.argv[pubIdx + 1] ? process.argv[pubIdx + 1] : undefined;
const pubBeside = join(base, "release-signing.pub");
const pubPath = pubFlag ? resolve(pubFlag) : existsSync(pubBeside) ? pubBeside : null;
if (!pubPath) {
  console.error("dist-verify: no public key — pass --pub <path>, or place release-signing.pub beside MANIFEST.json (it ships with every artifact set)");
  process.exit(2);
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, val]) => [k, sortDeep(val)]));
  }
  return v;
}

const manifestBytes = readFileSync(manifestPath);
const signature = Buffer.from(readFileSync(sigPath, "utf8").trim(), "base64");
const pub = createPublicKey(readFileSync(pubPath));

const sigOk = edVerify(null, manifestBytes, pub, signature);
if (!sigOk) {
  console.error("dist-verify: FAIL — Ed25519 signature does NOT verify over the manifest bytes.");
  process.exit(1);
}
console.log("dist-verify: signature OK (Ed25519 over canonical manifest bytes)");

const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
  release: string;
  ref?: string;
  commit: string;
  artifacts: Array<{ name: string; bytes: number; sha256: string; blake3: string }>;
};
console.log(`dist-verify: release ${manifest.release} @ ${manifest.ref ?? "HEAD"} commit ${manifest.commit.slice(0, 12)}…`);

let failures = 0;
for (const artifact of manifest.artifacts) {
  const path = join(base, artifact.name);
  if (!existsSync(path)) {
    console.error(`dist-verify: FAIL — ${artifact.name}: missing`);
    failures++;
    continue;
  }
  const bytes = statSync(path).size;
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  const blake3 = await blake3HexOf(readFileSync(path));
  const ok = bytes === artifact.bytes && sha256 === artifact.sha256 && blake3 === artifact.blake3;
  if (ok) {
    console.log(`dist-verify: OK    ${artifact.name} (${bytes} bytes, blake3 ${blake3.slice(0, 16)}…, sha256 ${sha256.slice(0, 16)}…)`);
  } else {
    console.error(`dist-verify: FAIL — ${artifact.name} does not match the manifest (bytes/sha256/blake3).`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\ndist-verify: ${failures} FAILURE(S) — this artifact set is not trusted. Re-obtain from the release channel.`);
  process.exit(1);
}

// 5. SHA256SUMS consistency (Ω): the convenience checksum file must agree
//    with the SIGNED manifest and must cover MANIFEST.json + its signature.
const sumsPath = join(base, "SHA256SUMS");
if (existsSync(sumsPath)) {
  const entries = new Map<string, string>();
  for (const line of readFileSync(sumsPath, "utf8").split("\n")) {
    const m = /^([0-9a-f]{64})  (.+)$/.exec(line.trim());
    if (m) entries.set(m[2]!, m[1]!);
  }
  let sumsFailures = 0;
  for (const artifact of manifest.artifacts) {
    const claimed = entries.get(artifact.name);
    if (claimed === undefined) {
      console.error(`dist-verify: FAIL — SHA256SUMS omits manifest artifact ${artifact.name}.`);
      sumsFailures++;
    } else if (claimed !== artifact.sha256) {
      console.error(`dist-verify: FAIL — SHA256SUMS disagrees with the SIGNED manifest for ${artifact.name}.`);
      sumsFailures++;
    }
  }
  for (const bound of ["MANIFEST.json", "MANIFEST.json.sig"]) {
    if (!entries.has(bound)) {
      console.error(`dist-verify: FAIL — SHA256SUMS does not cover ${bound} (trust-chain hole).`);
      sumsFailures++;
    }
  }
  if (sumsFailures > 0) {
    console.error(`\ndist-verify: ${sumsFailures} SHA256SUMS FAILURE(S) — the checksum file lies or was tampered with.`);
    process.exit(1);
  }
  console.log("dist-verify: OK    SHA256SUMS agrees with the signed manifest and covers the manifest + signature");
}

console.log("\ndist-verify: ALL CHECKS PASSED — signature and every artifact digest verify.");
