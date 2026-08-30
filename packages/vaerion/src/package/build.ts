/**
 * Vaerion packaging — the deterministic bundle build (MS-6, ADR-0016).
 *
 * The build is a FOLD over declared inputs plus lockfile pins: no wall-clock,
 * no ambient paths, no randomness (ADR-0016 decision 5). Identical inputs
 * produce byte-identical bundles — the rebuild test in the suite proves it.
 *
 * The fold, in order:
 *   1. declared include paths (config `package.include`) — files carry
 *      themselves; directories carry every file under them recursively;
 *   2. declared extension artifacts — ALWAYS carried (the manifest pins
 *      their sha256 digests, so a bundle that dropped them would be
 *      unverifiable), each pin-verified BEFORE it is bundled: a mismatched
 *      artifact is never distributed, by the same law that says it is never
 *      executed (E2100).
 *
 * Entries are deduplicated by project-relative POSIX path and emitted in
 * strictly ascending order. Paths that escape the project root, absolute
 * paths, and traversal are refused fail-closed (E2204).
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { blake3HexOf } from "../kernel/hash.ts";
import { VaerionError } from "../kernel/errors.ts";
import { ENGINE_VERSION } from "../journal/writer.ts";
import { sha256File } from "../extensions/host.ts";
import type { VaerionConfig } from "../config/config.ts";
import { encodeBundle, encodeEntryStream, compressPayload, assertSafeEntryPath, comparePaths, type BundleEntry, type BundleManifest, type BundlePin } from "./format.ts";
/** The produced artifact: full bytes + the manifest + the bundle digest. */
export interface BuiltBundle {
  bytes: Uint8Array;
  manifest: BundleManifest;
  /** blake3 hex of the full bundle bytes — the bundle's identity. */
  bundleBlake3: string;
}

/** Inputs resolved and read; the exact fold result before assembly. */
interface CollectedInputs {
  entries: BundleEntry[];
  contents: Map<string, Uint8Array>;
  pins: BundlePin[];
}

/**
 * The path law for declared inputs (fail-closed, E2204): relative, inside
 * the project, no traversal, no NUL, no backslashes, no globs (the fold is
 * over explicit declarations; glob expansion is ambient behavior).
 */
function normalizeIncludePath(root: string, raw: string): { rel: string; abs: string } {
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E2204", `package include "${raw}": ${why}`);
  };
  if (typeof raw !== "string" || raw.length === 0) fail("path must be a non-empty string");
  if (raw.includes("\0")) fail("contains NUL");
  if (raw.includes("\\")) fail("backslash paths are not portable; use /");
  if (raw.includes("*") || raw.includes("?") || raw.includes("[")) fail("globs are refused — declare explicit paths");
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) fail("absolute paths are refused — declare a project-relative path");
  const segments = raw.split("/");
  for (const seg of segments) {
    if (seg === "..") fail("traversal above the project root is refused");
    if (seg === "." || seg === "") fail("empty path segment");
  }
  const abs = resolve(root, raw);
  const rel = relative(root, abs).split(sep).join("/");
  if (rel.startsWith("..") || resolve(abs) === resolve(root)) {
    fail("resolves outside the project root");
  }
  return { rel, abs };
}

/** Recursively list files under a directory as project-relative POSIX paths. */
async function walkFiles(root: string, absDir: string, out: string[]): Promise<void> {
  const items = await readdir(absDir, { withFileTypes: true });
  for (const item of items) {
    const abs = join(absDir, item.name);
    if (item.isDirectory()) {
      await walkFiles(root, abs, out);
    } else if (item.isFile()) {
      out.push(relative(root, abs).split(sep).join("/"));
    }
  }
}

/**
 * Resolve the include list into a deduplicated, canonically ordered set of
 * project-relative file paths (E2204 on missing inputs).
 */
export async function resolveInputPaths(root: string, include: string[]): Promise<string[]> {
  const set = new Set<string>();
  for (const raw of include) {
    const { rel, abs } = normalizeIncludePath(root, raw);
    const st = await stat(abs).catch(() => null);
    if (!st) throw new VaerionError("E2204", `declared input "${raw}" does not exist (Fix: correct package.include in vaerion.yaml)`);
    if (st.isDirectory()) {
      const files: string[] = [];
      await walkFiles(root, abs, files);
      if (files.length === 0) {
        throw new VaerionError("E2204", `declared input "${raw}" is a directory with no files`);
      }
      for (const f of files) set.add(f);
    } else if (st.isFile()) {
      set.add(rel);
    } else {
      throw new VaerionError("E2204", `declared input "${raw}" is neither a file nor a directory`);
    }
  }
  return [...set].sort(comparePaths);
}

/**
 * Collect the full fold: every declared input + every declared extension
 * artifact (pin-verified first), read, digested, canonically ordered.
 */
export async function collectInputs(root: string, config: VaerionConfig): Promise<CollectedInputs> {
  const include = config.package?.include ?? [];
  if (include.length === 0) {
    throw new VaerionError("E2204", "no package inputs declared (Fix: add package.include to vaerion.yaml)");
  }
  const paths = await resolveInputPaths(root, include);

  // Declared extension artifacts: pin-verified, then always carried.
  const pins: BundlePin[] = [];
  const forcedPaths = new Set<string>();
  for (const ext of config.extensions ?? []) {
    const artifactRel = relative(root, resolve(root, ext.artifact)).split(sep).join("/");
    if (artifactRel.startsWith("..")) {
      throw new VaerionError("E2204", `extension ${ext.name}: artifact "${ext.artifact}" resolves outside the project root`);
    }
    const actual = await sha256File(join(root, artifactRel)).catch(() => null);
    if (actual === null) {
      throw new VaerionError("E2204", `extension ${ext.name}: artifact "${ext.artifact}" does not exist`);
    }
    if (`sha256:${actual}` !== ext.digest) {
      // The pin law holds at build time exactly as at execution time (E2100).
      throw new VaerionError("E2100", `extension ${ext.name}: artifact does not match its pinned digest — a mismatched artifact is never bundled`);
    }
    pins.push({ name: ext.name, digest: ext.digest });
    forcedPaths.add(artifactRel);
  }
  pins.sort((a, b) => comparePaths(a.name, b.name));

  const allPaths = [...new Set([...paths, ...forcedPaths])].sort(comparePaths);
  const contents = new Map<string, Uint8Array>();
  const entries: BundleEntry[] = [];
  for (const p of allPaths) {
    assertSafeEntryPath(p);
    const bytes = await readFile(join(root, p));
    const digest = await blake3HexOf(bytes);
    contents.set(p, bytes);
    entries.push({ path: p, blake3: digest, size: bytes.length });
  }
  return { entries, contents, pins };
}

/**
 * Build the deterministic bundle. Pure over its inputs: same config, same
 * files, same engine → the same bytes (P2; proven by the rebuild test).
 */
export async function buildBundle(root: string, config: VaerionConfig, configFingerprint: string): Promise<BuiltBundle> {
  const { entries, contents, pins } = await collectInputs(root, config);
  const stream = encodeEntryStream(entries, contents);
  const payload = compressPayload(stream);
  const manifest: BundleManifest = {
    format: 1,
    compression: { alg: "zstd", level: 19 },
    project: { name: config.project.name },
    configFingerprint,
    builtWith: { engine: ENGINE_VERSION },
    entries,
    pins,
    payload: {
      blake3: await blake3HexOf(payload),
      size: payload.length,
      uncompressedSize: stream.length,
    },
  };
  const bytes = encodeBundle(manifest, payload);
  return { bytes, manifest, bundleBlake3: await blake3HexOf(bytes) };
}

/** Default bundle output path: .vaerion/package/<project.name>.vxn (relative). */
export function defaultBundlePath(config: VaerionConfig): string {
  return join(".vaerion", "package", `${config.project.name}.vxn`);
}

/**
 * Resolve the output path from flag > config > default. The same path law as
 * inputs applies: relative, inside the project (E2204).
 */
export function resolveBundleOutPath(root: string, config: VaerionConfig, flagOut?: string): string {
  const raw = flagOut ?? config.package?.out ?? defaultBundlePath(config);
  const { rel } = normalizeIncludePath(root, raw);
  return rel;
}
