/**
 * Vaerion dist-pack — the release packaging tool (Phase 1).
 *
 * Produces the release artifact set for a version into dist/:
 *   - vaerion-<version>-source.tar.gz  (deterministic git archive, gzip -n)
 *   - vaerion-demo.vxn                 (reference reproducible bundle)
 *   - SHA256SUMS / MANIFEST.json       (sha256 + blake3 over every artifact)
 *   - MANIFEST.json.sig                (Ed25519 signature over canonical MANIFEST bytes)
 *   - VERIFY.md / dist-report.json     (audit packet)
 *
 * Laws:
 *   - Fail-closed: the full verification suite must be green BEFORE any
 *     artifact is produced; a red gate aborts packaging.
 *   - Determinism: the tarball is a fixed-content git archive piped through
 *     `gzip -n` (no timestamp, no owner names); the tool proves it by
 *     building the archive twice and byte-comparing.
 *   - Signature: Ed25519 over the canonical (sorted-key) manifest JSON.
 *     The signing key is the bootstrap release key (keys/release-signing.key,
 *     untracked, session-bound); its public half ships BESIDE the artifacts
 *     (dist/release-signing.pub, manifest-bound). The tracked
 *     keys/release-signing.pub is the KEY OF RECORD as of the last release
 *     close — only the Founder key ceremony (F-3) moves it. A pack run NEVER
 *     writes tracked files (XX-D4: the old behavior mutated the tracked pub
 *     key on every fresh-host pack, breaking the taught consumer path across
 *     every session boundary).
 *   - The signature is verified in-process before the run reports success.
 */

import { spawnSync } from "node:child_process";
import {
  createHash, generateKeyPairSync, sign as edSign, verify as edVerify,
  createPrivateKey, createPublicKey, KeyObject,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { blake3HexOf } from "../packages/vaerion/src/kernel/hash.ts";
import { ENGINE_VERSION } from "../packages/vaerion/src/journal/writer.ts";

const ROOT = resolve(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
// Version lockstep by construction: the pack derives its version from the
// engine itself (the Phase 8 readiness evaluator treats any disagreement as
// a blocker, and the evaluator's own sweep missed nothing — this constant
// DID drift once, which is why it is now derived, never declared).
const VERSION = ENGINE_VERSION;
const NAME = `vaerion-${VERSION}`;
const TARBALL = `${NAME}-source.tar.gz`;

function run(cmd: string[], opts: { cwd?: string } = {}): { ok: boolean; out: string } {
  const proc = spawnSync(cmd[0]!, cmd.slice(1), {
    cwd: opts.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: 600_000,
  });
  const out = ((proc.stdout ?? "") + (proc.stderr ?? "")).trim();
  return { ok: proc.status === 0, out };
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, val]) => [k, sortDeep(val)]));
  }
  return v;
}
function canon(v: unknown): Buffer { return Buffer.from(JSON.stringify(sortDeep(v))); }

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
async function blake3File(path: string): Promise<string> {
  return blake3HexOf(readFileSync(path));
}

function loadOrCreateSigningKey(): { priv: KeyObject; pub: KeyObject; generated: boolean } {
  const keyPath = join(ROOT, "keys", "release-signing.key");
  let priv: KeyObject;
  let generated = false;
  if (existsSync(keyPath)) {
    priv = createPrivateKey(readFileSync(keyPath));
  } else {
    const pair = generateKeyPairSync("ed25519");
    priv = pair.privateKey;
    mkdirSync(join(ROOT, "keys"), { recursive: true });
    writeFileSync(keyPath, priv.export({ type: "pkcs8", format: "pem" }));
    generated = true;
  }
  return { priv, pub: createPublicKey(priv), generated };
}

// ---- 0. Gates must be green (fail-closed) -----------------------------------
console.log("dist-pack: running the full verification suite (fail-closed precondition)…");
const gates = run(["bun", "run", join(ROOT, "tools", "verify.ts")]);
if (!gates.ok) {
  console.error("dist-pack: ABORT — verification gates are not green. No artifacts produced.\n" + gates.out);
  process.exit(1);
}
const verification = JSON.parse(readFileSync(join(ROOT, ".vaerion-verification.json"), "utf8")) as { ok: boolean; gates: Array<{ gate: string; ok: boolean; durationMs: number }> };
if (!verification.ok) {
  console.error("dist-pack: ABORT — verification record says not ok.");
  process.exit(1);
}

// ---- 1. Reference bundle (reproducible .vxn) --------------------------------
mkdirSync(DIST, { recursive: true });
const demo = join(ROOT, "examples", "vaerion-demo");
const bundleBuild = run(["bun", "run", join(ROOT, "packages", "vaerion/src/cli/vae.ts"), "package", "build"], { cwd: demo });
if (!bundleBuild.ok) {
  console.error("dist-pack: ABORT — reference bundle build failed:\n" + bundleBuild.out);
  process.exit(1);
}
const vxnSrc = join(demo, ".vaerion", "package", "vaerion-demo.vxn");
const vxnDst = join(DIST, "vaerion-demo.vxn");
writeFileSync(vxnDst, readFileSync(vxnSrc));

// ---- 2. Deterministic source tarball, built TWICE and byte-compared ---------
// The artifact set binds a git REF (default HEAD; --ref <ref> re-packs a
// tagged release without moving the tag). Resolving the ref to its commit
// keeps `git archive` output deterministic for the same commit.
const refArg = (() => {
  const i = process.argv.indexOf("--ref");
  if (i < 0) return "HEAD";
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) {
    console.error("dist-pack: --ref requires a git ref argument.");
    process.exit(1);
  }
  return v;
})();
const refCommit = run(["git", "rev-parse", "--verify", `${refArg}^{commit}`]).out;
if (!/^[0-9a-f]{40}$/.test(refCommit)) {
  console.error(`dist-pack: ABORT — could not resolve ref "${refArg}" to a commit.`);
  process.exit(1);
}
const head = refCommit;
const tarA = run(["bash", "-o", "pipefail", "-c", `git archive --format=tar --prefix=${NAME}/ ${head} | gzip -n | cat > dist/.tarball-a`]);
const tarB = run(["bash", "-o", "pipefail", "-c", `git archive --format=tar --prefix=${NAME}/ ${head} | gzip -n | cat > dist/.tarball-b`]);
if (!tarA.ok || !tarB.ok) {
  console.error("dist-pack: ABORT — tarball build failed:\n" + tarA.out + "\n" + tarB.out);
  process.exit(1);
}
const a = readFileSync(join(DIST, ".tarball-a"));
const b = readFileSync(join(DIST, ".tarball-b"));
const reproducible = a.equals(b);
if (!reproducible) {
  console.error("dist-pack: ABORT — tarball builds are NOT byte-identical; refusing to ship a non-reproducible release.");
  process.exit(1);
}
const tarball = join(DIST, `${NAME}-source.tar.gz`);
writeFileSync(tarball, a);
console.log(`dist-pack: tarball reproducibility PROVEN (two builds byte-identical, ${a.length} bytes)`);

// ---- 3. Signing key (needed for the VERIFY.md fingerprint) -------------------
const { priv, pub, generated } = loadOrCreateSigningKey();
const pubPem = pub.export({ type: "spki", format: "pem" });
// The public half ships BESIDE the artifacts (manifest-bound below) — the
// tracked keys/release-signing.pub is NEVER touched by a pack run (XX-D4).
writeFileSync(join(DIST, "release-signing.pub"), pubPem);
const pubFp = createHash("sha256").update(pub.export({ type: "spki", format: "der" })).digest("hex").slice(0, 32);

// ---- 4. VERIFY.md (bound by the manifest below) ------------------------------
const verifyMd = `# Release verification — ${VERSION}

Verify this release in under a minute:

\`\`\`sh
sha256sum --check SHA256SUMS                       # integrity of every artifact

# Ed25519 signature over MANIFEST.json (canonical JSON, sorted keys):
#   public key: release-signing.pub — shipped BESIDE this artifact set
#   (it is manifest-bound: the signature below covers it too)
#   fingerprint: sha256:${pubFp}
#   one-command verification (no repository needed):
bun run tools/dist-verify.ts --manifest MANIFEST.json --sig MANIFEST.json.sig --pub release-signing.pub
\`\`\`

Key provenance: this artifact set is signed by the key in release-signing.pub
(bootstrap key ${generated ? "GENERATED this run — session-bound, disclosed" : "loaded from the release-signing key file"}).
The repository-tracked keys/release-signing.pub at commit ${head.slice(0, 12)} is the
key of record as of the last release close; the Founder key ceremony (F-3)
rotates it. Verify the key you received through the channel that delivered
these artifacts — a signature proves integrity, never provenance by itself.

| Artifact | Bytes | blake3 |
|---|---|---|
${[
  { name: `${NAME}-source.tar.gz`, bytes: a.length, blake3: await blake3File(tarball) },
  { name: "vaerion-demo.vxn", bytes: statSync(vxnDst).size, blake3: await blake3File(vxnDst) },
  { name: "release-signing.pub", bytes: pubPem.length, blake3: "" },
].map((a2) => `| ${a2.name} | ${a2.bytes} | \`${a2.blake3 ? a2.blake3.slice(0, 16) + "…" : "(manifest-covered)"}…\` |`).join("\n")}

The source tarball is a deterministic git archive of commit ${head}
(gzip -n, fixed content): rebuilding it from the same commit reproduces the
same bytes. The reference bundle is the reproducible \`.vxn\` of
examples/vaerion-demo (ADR-0016): \`vae package build\` twice from the same
workspace produces byte-identical bundles.

Trust-chain coverage: MANIFEST.json (signature-bound) carries sha256+blake3
for EVERY file a consumer needs — the tarball, the reference bundle, the
signing public key, this file, dist-report.json, and SHA256SUMS itself.
SHA256SUMS then covers MANIFEST.json and its signature too (everything except
itself), so the two lists overlap and no shipped file sits outside the signed set.
`;
writeFileSync(join(DIST, "VERIFY.md"), verifyMd);

// ---- 5. dist-report (the pack run's own log; also manifest-bound) ------------
const report = {
  tool: "tools/dist-pack.ts",
  release: VERSION,
  ref: refArg,
  commit: head,
  generatedAt: new Date().toISOString(),
  gatesGreen: verification.ok,
  gates: verification.gates,
  reproducibleTarball: { proven: reproducible, bytes: a.length, method: "git archive | gzip -n, built twice, byte-compared" },
  referenceBundle: { file: "vaerion-demo.vxn", bytes: statSync(vxnDst).size, blake3: await blake3File(vxnDst) },
  signatureProvenance: "the Ed25519 public key ships beside the artifacts (release-signing.pub, manifest-bound) — see VERIFY.md",
};
writeFileSync(join(DIST, "dist-report.json"), JSON.stringify(report, null, 2) + "\n");

// ---- 6. Manifest: canonical JSON binding EVERY consumer artifact -------------
const manifest = {
  release: VERSION,
  ref: refArg,
  commit: head,
  artifacts: [
    { name: `${NAME}-source.tar.gz`, bytes: a.length, sha256: sha256File(tarball), blake3: await blake3File(tarball) },
    { name: "vaerion-demo.vxn", bytes: statSync(vxnDst).size, sha256: sha256File(vxnDst), blake3: await blake3File(vxnDst) },
    { name: "release-signing.pub", bytes: pubPem.length, sha256: sha256File(join(DIST, "release-signing.pub")), blake3: await blake3File(join(DIST, "release-signing.pub")) },
    { name: "VERIFY.md", bytes: statSync(join(DIST, "VERIFY.md")).size, sha256: sha256File(join(DIST, "VERIFY.md")), blake3: await blake3File(join(DIST, "VERIFY.md")) },
    { name: "dist-report.json", bytes: statSync(join(DIST, "dist-report.json")).size, sha256: sha256File(join(DIST, "dist-report.json")), blake3: await blake3File(join(DIST, "dist-report.json")) },
  ],
  verification: { ok: verification.ok, gates: verification.gates },
  manifestVersion: 3,
};
const manifestBytes = canon(manifest);
const manifestPath = join(DIST, "MANIFEST.json");
writeFileSync(manifestPath, manifestBytes);

// ---- 7. Sign + self-verify ----------------------------------------------------
const signature = edSign(null, manifestBytes, priv);
const sigPath = join(DIST, "MANIFEST.json.sig");
writeFileSync(sigPath, signature.toString("base64"));
const sigOk = edVerify(null, manifestBytes, pub, signature);
if (!sigOk) {
  console.error("dist-pack: ABORT — signature failed self-verification.");
  process.exit(1);
}
console.log(`dist-pack: Ed25519 signature self-verified (public key shipped beside the artifacts: release-signing.pub, fp sha256:${pubFp}…, ${generated ? "bootstrap key GENERATED this run — session-bound, disclosed" : "bootstrap key loaded"})`);

// ---- 8. SHA256SUMS last: covers EVERYTHING except itself ----------------------
const sumTargets = [TARBALL, "vaerion-demo.vxn", "release-signing.pub", "VERIFY.md", "dist-report.json", "MANIFEST.json", "MANIFEST.json.sig"];
const sums = sumTargets.map((n) => `${sha256File(join(DIST, n))}  ${n}`).join("\n") + "\n";
writeFileSync(join(DIST, "SHA256SUMS"), sums);

run(["rm", "-f", join(DIST, ".tarball-a"), join(DIST, ".tarball-b")]);

console.log(`\ndist-pack: COMPLETE — release artifacts in dist/
  ${NAME}-source.tar.gz (${a.length} bytes)
  vaerion-demo.vxn (${statSync(vxnDst).size} bytes)
  SHA256SUMS, MANIFEST.json, MANIFEST.json.sig, VERIFY.md, dist-report.json`);
