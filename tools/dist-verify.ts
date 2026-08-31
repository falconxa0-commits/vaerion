/**
 * Vaerion dist-verify — verify a release artifact set (consumer side).
 *
 * Usage (from a directory containing MANIFEST.json, MANIFEST.json.sig and
 * the artifacts, with --pub pointing at the release public key):
 *
 *   bun run tools/dist-verify.ts --manifest MANIFEST.json \
 *     --sig MANIFEST.json.sig --pub keys/release-signing.pub
 *
 * Checks, in order, fail-closed:
 *   1. the Ed25519 signature verifies over the canonical (sorted-key)
 *      manifest bytes;
 *   2. every artifact named in the manifest exists;
 *   3. every artifact's sha256 and size match the manifest;
 *   4. every artifact's blake3 digest matches the manifest.
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
const pubPath = resolve(arg("pub"));
const base = dirname(manifestPath);

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
  commit: string;
  artifacts: Array<{ name: string; bytes: number; sha256: string; blake3: string }>;
};
console.log(`dist-verify: release ${manifest.release} @ commit ${manifest.commit.slice(0, 12)}…`);

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
console.log("\ndist-verify: ALL CHECKS PASSED — signature and every artifact digest verify.");
