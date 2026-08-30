/**
 * Vaerion packaging — pure bundle verification (MS-6, ADR-0016 decision 3).
 *
 * Import and verify are PURE CHECKS: they recompute digests, compare pins,
 * and report. They NEVER execute package content. Verification is evidential
 * — it produces a per-check report with honest findings instead of failing on
 * the first problem, so the operator sees the full picture in one pass.
 *
 * Every finding carries its stable E-code:
 *   E2201 digest mismatch (payload or entry)   E2200 format law violation
 *   E2202 pin mismatch (config/lock ↔ manifest) E2205 lock disagreement
 * The CLI renders the report and exits partial (5) with E2206 when the
 * bundle is not verified; the report is the evidence, the code is the hint.
 */

import { blake3HexOf } from "../kernel/hash.ts";
import { VaerionError } from "../kernel/errors.ts";
import type { VaerionConfig } from "../config/config.ts";
import { decodeBundle, decompressPayload, decodeEntryStream, VXN_ZSTD_LEVEL, VXN_COMPRESSION_ALG, type BundleManifest } from "./format.ts";
import { readLock, pinsEqual } from "./lock.ts";

/** One honest finding (code + human detail). */
export interface VerifyFinding {
  code: string;
  check: string;
  detail: string;
}

/** The full verification report — the evidence a consumer relies on. */
export interface VerifyReport {
  ok: boolean;
  /** blake3 of the full bundle bytes (recomputed here, not trusted). */
  bundleBlake3: string;
  bundleSize: number;
  entryCount: number;
  entriesVerified: number;
  pinsChecked: number;
  findings: VerifyFinding[];
  /** Checks that passed (named, for the honest full picture). */
  checksPassed: string[];
  manifest: BundleManifest | null;
}

function newReport(bundleBlake3: string, bundleSize: number): VerifyReport {
  return {
    ok: true,
    bundleBlake3,
    bundleSize,
    entryCount: 0,
    entriesVerified: 0,
    pinsChecked: 0,
    findings: [],
    checksPassed: [],
    manifest: null,
  };
}

/**
 * Verify a .vxn bundle as a pure check against a workspace context:
 *   1. structural law (magic, canonical manifest, compression pin);
 *   2. payload digest + decompression + canonical entry stream;
 *   3. per-entry size + blake3 digests;
 *   4. pin governance: manifest pins ⇄ declared extensions (both directions);
 *   5. lock governance (when vaerion.lock exists): config fingerprint,
 *      extension pins, and the sealed bundle digest must all agree.
 * `configFingerprint` is the CURRENT workspace config fingerprint (computed
 * by the caller via the standard config path); pass null to skip
 * workspace-facing checks (format-only verification).
 */
export async function verifyBundleBytes(bytes: Uint8Array, opts: { config?: VaerionConfig; configFingerprint?: string | null; root?: string }): Promise<VerifyReport> {
  const bundleBlake3 = await blake3HexOf(bytes);
  const report = newReport(bundleBlake3, bytes.length);

  // 1. Structural law. decodeBundle throws with stable codes on hard
  //    structural violations; a hard throw IS the finding.
  let manifest: ReturnType<typeof decodeBundle>["manifest"];
  let payload: Uint8Array;
  try {
    const decoded = decodeBundle(bytes);
    manifest = decoded.manifest;
    payload = decoded.payload;
    report.manifest = manifest;
  } catch (err) {
    const code = err instanceof VaerionError ? err.code : "E2200";
    report.ok = false;
    report.findings.push({ code, check: "structure", detail: (err as Error).message });
    return report; // nothing downstream is parseable — report the structural failure
  }
  report.checksPassed.push("structure: magic VXN1, canonical manifest, compression pin");
  report.entryCount = manifest.entries.length;

  // 2. Payload digest + decompression.
  if (manifest.payload.size !== payload.length) {
    report.ok = false;
    report.findings.push({ code: "E2200", check: "payload-size", detail: `manifest records payload size ${manifest.payload.size}, bundle carries ${payload.length}` });
  } else {
    report.checksPassed.push("payload-size");
  }
  const payloadBlake3 = await blake3HexOf(payload);
  if (payloadBlake3 !== manifest.payload.blake3) {
    report.ok = false;
    report.findings.push({ code: "E2201", check: "payload-digest", detail: `manifest pins ${manifest.payload.blake3.slice(0, 12)}…, bundle carries ${payloadBlake3.slice(0, 12)}…` });
  } else {
    report.checksPassed.push("payload-digest");
  }

  let decodedEntries: Array<{ path: string; content: Uint8Array }> = [];
  try {
    const decompressed = decompressPayload(payload);
    if (decompressed.length !== manifest.payload.uncompressedSize) {
      report.ok = false;
      report.findings.push({ code: "E2200", check: "payload-uncompressed-size", detail: `manifest records ${manifest.payload.uncompressedSize} uncompressed bytes, payload yields ${decompressed.length}` });
    } else {
      report.checksPassed.push("payload-uncompressed-size");
    }
    const stream = decodeEntryStream(decompressed);
    if (stream.bytesConsumed !== decompressed.length) {
      report.ok = false;
      report.findings.push({ code: "E2200", check: "entry-stream-exhausted", detail: `${decompressed.length - stream.bytesConsumed} trailing byte(s) after the last entry — the stream is not canonical` });
    } else {
      report.checksPassed.push("entry-stream-exhausted");
    }
    decodedEntries = stream.entries;
  } catch (err) {
    report.ok = false;
    const code = err instanceof VaerionError ? err.code : "E2200";
    report.findings.push({ code, check: "payload-decode", detail: (err as Error).message });
  }

  // 3. Per-entry digests (the manifest is the claim; bytes are the evidence).
  const manifestByPath = new Map(manifest.entries.map((e) => [e.path, e]));
  if (decodedEntries.length !== manifest.entries.length) {
    report.ok = false;
    report.findings.push({ code: "E2200", check: "entry-count", detail: `manifest declares ${manifest.entries.length} entries, payload carries ${decodedEntries.length}` });
  }
  for (const { path, content } of decodedEntries) {
    const claimed = manifestByPath.get(path);
    if (!claimed) {
      report.ok = false;
      report.findings.push({ code: "E2200", check: "entry-declared", detail: `payload entry "${path}" is not declared in the manifest` });
      continue;
    }
    if (content.length !== claimed.size) {
      report.ok = false;
      report.findings.push({ code: "E2201", check: `entry-size:${path}`, detail: `manifest records ${claimed.size} bytes, payload carries ${content.length}` });
      continue;
    }
    const digest = await blake3HexOf(content);
    if (digest !== claimed.blake3) {
      report.ok = false;
      report.findings.push({ code: "E2201", check: `entry-digest:${path}`, detail: `manifest pins ${claimed.blake3.slice(0, 12)}…, content hashes ${digest.slice(0, 12)}…` });
    } else {
      report.entriesVerified++;
    }
  }
  for (const claimed of manifest.entries) {
    if (!decodedEntries.some((e) => e.path === claimed.path)) {
      report.ok = false;
      report.findings.push({ code: "E2200", check: "entry-present", detail: `manifest declares "${claimed.path}" but the payload does not carry it` });
    }
  }
  if (report.entriesVerified === manifest.entries.length && manifest.entries.length > 0 && !report.findings.some((f) => f.check.startsWith("entry-"))) {
    report.checksPassed.push(`entry-digests (${report.entriesVerified} verified)`);
  }

  // 4. Pin governance: manifest ⇄ config (both directions, fail-closed).
  if (opts.config) {
    const declared = (opts.config.extensions ?? []).map((e) => ({ name: e.name, digest: e.digest }));
    report.pinsChecked = declared.length;
    const manifestPins = new Map(manifest.pins.map((p) => [p.name, p.digest]));
    for (const d of declared) {
      const actual = manifestPins.get(d.name);
      if (actual === undefined) {
        report.ok = false;
        report.findings.push({ code: "E2202", check: `pin-carried:${d.name}`, detail: `extension "${d.name}" is declared in vaerion.yaml but the bundle carries no pin for it` });
      } else if (actual !== d.digest) {
        report.ok = false;
        report.findings.push({ code: "E2202", check: `pin-match:${d.name}`, detail: `digest swap: bundle pins ${actual.slice(0, 14)}…, config declares ${d.digest.slice(0, 14)}…` });
      }
    }
    for (const p of manifest.pins) {
      const d = declared.find((x) => x.name === p.name);
      if (!d) {
        report.ok = false;
        report.findings.push({ code: "E2202", check: `pin-declared:${p.name}`, detail: `bundle pins extension "${p.name}" which is not declared in vaerion.yaml` });
      }
    }
    if (report.findings.every((f) => !f.check.startsWith("pin-"))) {
      report.checksPassed.push(`pins (${report.pinsChecked} declared, bidirectional)`);
    }
    // Config fingerprint provenance (informational drift is a finding: a
    // bundle built from different config is not THIS project's bundle).
    if (opts.configFingerprint && opts.configFingerprint !== manifest.configFingerprint) {
      report.ok = false;
      report.findings.push({ code: "E2205", check: "config-fingerprint", detail: `bundle was built from config ${manifest.configFingerprint.slice(0, 12)}…, workspace config is ${opts.configFingerprint.slice(0, 12)}… — rebuild the bundle` });
    } else if (opts.configFingerprint) {
      report.checksPassed.push("config-fingerprint");
    }
  }

  // 5. Lock governance: the generated, committed seal must agree with reality.
  if (opts.root) {
    const lock = await readLock(opts.root).catch((err: unknown) => {
      if (err instanceof VaerionError) {
        report.ok = false;
        report.findings.push({ code: err.code, check: "lock-parse", detail: err.message });
        return null;
      }
      throw err;
    });
    if (lock) {
      if (lock.bundle.blake3 !== report.bundleBlake3) {
        report.ok = false;
        report.findings.push({ code: "E2205", check: "lock-bundle-digest", detail: `vaerion.lock seals ${lock.bundle.blake3.slice(0, 12)}…, the bundle is ${report.bundleBlake3.slice(0, 12)}… — stale lock; rebuild` });
      }
      if (opts.configFingerprint && lock.configFingerprint !== opts.configFingerprint) {
        report.ok = false;
        report.findings.push({ code: "E2205", check: "lock-config-fingerprint", detail: "vaerion.lock records a different config fingerprint than the workspace — stale lock; rebuild" });
      }
      if (opts.config && !pinsEqual(lock.extensions, (opts.config.extensions ?? []).map((e) => ({ name: e.name, digest: e.digest })))) {
        report.ok = false;
        report.findings.push({ code: "E2205", check: "lock-extension-pins", detail: "vaerion.lock extension pins disagree with vaerion.yaml — stale lock; rebuild" });
      }
      if (report.findings.every((f) => !f.check.startsWith("lock-"))) {
        report.checksPassed.push("lock (bundle digest, config fingerprint, extension pins agree)");
      }
    }
  }

  return report;
}
