/**
 * Vaerion packaging — the .vxn deterministic archive format (MS-6, ADR-0016).
 *
 * Law (ADR-0016):
 *   1. The bundle format is `.vxn`: a deterministic archive whose entries are
 *      ordered canonically and compressed with zstd at a PINNED compression
 *      level, so identical inputs produce identical bytes (P2 determinism).
 *   2. Content identity is BLAKE3: every file carries a blake3 digest, and the
 *      manifest pins component digests (extensions) that must equal the
 *      vaerion.lock pins at import time — a mismatch is a hard failure.
 *   3. Import and verify are pure checks: recompute digests, compare pins,
 *      report. They never execute package content.
 *   5. The build is a fold over declared inputs plus lockfile pins — no
 *      wall-clock, no ambient paths.
 *
 * Byte layout (format version 1):
 *   magic    4 bytes  "VXN1" (ASCII) — the magic carries the format version
 *   u32be    header length H
 *   header   H bytes  — canonical JSON of the manifest (sorted keys, no
 *                       whitespace; recomputable, so non-canonical headers
 *                       are a verification failure, not a parsing choice)
 *   payload  rest     — zstd(level 19) of the canonical entry stream
 *
 * Entry stream (uncompressed payload bytes):
 *   per entry: u32be pathLen · path UTF-8 · u64be contentLen · content bytes
 *   entries appear in strictly ascending path order (UTF-16 code-unit order,
 *   matching canonical JSON key ordering).
 *
 * Determinism discipline: the pinned zstd level is part of the format
 * contract — changing it requires a format version bump (new magic), never a
 * silent rebuild. Compression uses Bun's native zstd (deterministic for a
 * fixed level and toolchain; the rebuild test proves byte equality).
 */

import { canonicalJson } from "../kernel/canonical.ts";
import { VaerionError } from "../kernel/errors.ts";

/** Magic + format version, one unit: "VXN1" is format 1. */
export const VXN_MAGIC = "VXN1";
/** Pinned zstd level (ADR-0016 decision 1). Part of the format contract. */
export const VXN_ZSTD_LEVEL = 19;
/** Pinned compression algorithm identifier (recorded in the manifest). */
export const VXN_COMPRESSION_ALG = "zstd";

/** One entry of the bundle: a project-relative path + its content identity. */
export interface BundleEntry {
  /** Project-relative POSIX path ("/" separators; no leading "/", no ".."). */
  path: string;
  /** blake3 hex of the uncompressed content bytes. */
  blake3: string;
  /** Content size in bytes. */
  size: number;
}

/** A component pin carried by the manifest (extensions, per ADR-0016 §2). */
export interface BundlePin {
  /** Extension name (the tool name it is reachable as). */
  name: string;
  /** Pin exactly as declared: "sha256:<64 lowercase hex>". */
  digest: string;
}

/** The bundle manifest — the ONLY self-describing data in the file. */
export interface BundleManifest {
  format: 1;
  compression: { alg: typeof VXN_COMPRESSION_ALG; level: number };
  project: { name: string };
  /** blake3 of the canonical config JSON at build time (provenance). */
  configFingerprint: string;
  /** Engine that built the bundle (provenance; deterministic per toolchain). */
  builtWith: { engine: string };
  /** Entries sorted by path (UTF-16 code-unit order). */
  entries: BundleEntry[];
  /** Component pins sorted by name. */
  pins: BundlePin[];
  payload: {
    /** blake3 hex of the compressed payload bytes. */
    blake3: string;
    /** Compressed payload size in bytes. */
    size: number;
    /** Uncompressed entry-stream size in bytes. */
    uncompressedSize: number;
  };
}

/* ─────────────────────────  entry stream encode/decode  ───────────────────────── */

function writeU32be(v: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = (v >>> 24) & 0xff;
  b[1] = (v >>> 16) & 0xff;
  b[2] = (v >>> 8) & 0xff;
  b[3] = v & 0xff;
  return b;
}

function readU32be(b: Uint8Array, off: number): number {
  return ((b[off] as number) << 24) | ((b[off + 1] as number) << 16) | ((b[off + 2] as number) << 8) | (b[off + 3] as number);
}

function writeU64be(v: number): Uint8Array {
  if (!Number.isSafeInteger(v) || v < 0) {
    throw new VaerionError("E2200", `entry size is not a safe non-negative integer: ${v}`);
  }
  const b = new Uint8Array(8);
  let rest = v;
  for (let i = 7; i >= 0; i--) {
    b[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  return b;
}

function readU64be(b: Uint8Array, off: number): number {
  let v = 0;
  for (let i = 0; i < 8; i++) {
    v = v * 256 + (b[off + i] as number);
  }
  if (!Number.isSafeInteger(v)) {
    throw new VaerionError("E2200", "entry length exceeds the safe integer range — the stream is malformed");
  }
  return v;
}

/**
 * Encode the canonical entry stream. Entries MUST already be in canonical
 * (strictly ascending path) order — encodeEntryStream refuses out-of-order
 * or duplicate paths rather than silently normalizing them.
 */
export function encodeEntryStream(entries: BundleEntry[], contents: Map<string, Uint8Array>): Uint8Array {
  let last: string | null = null;
  const parts: Uint8Array[] = [];
  const encoder = new TextEncoder();
  for (const e of entries) {
    if (last !== null && comparePaths(e.path, last) <= 0) {
      throw new VaerionError("E2200", `entries are not in strictly ascending canonical order at "${e.path}"`);
    }
    const content = contents.get(e.path);
    if (!content) throw new VaerionError("E2200", `no content provided for entry "${e.path}"`);
    const pathBytes = encoder.encode(e.path);
    parts.push(writeU32be(pathBytes.length), pathBytes, writeU64be(content.length), content);
    last = e.path;
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Path comparison in UTF-16 code-unit order (canonical ordering law). */
export function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface DecodedEntryStream {
  entries: Array<{ path: string; content: Uint8Array }>;
  bytesConsumed: number;
}

/**
 * Decode a canonical entry stream. Strictly consuming: trailing garbage,
 * truncated entries, out-of-order or duplicate paths are format failures.
 */
export function decodeEntryStream(payload: Uint8Array): DecodedEntryStream {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const out: Array<{ path: string; content: Uint8Array }> = [];
  let off = 0;
  let last: string | null = null;
  while (off < payload.length) {
    if (off + 4 > payload.length) throw new VaerionError("E2200", "entry stream truncated in path length");
    const pathLen = readU32be(payload, off);
    off += 4;
    if (off + pathLen > payload.length) throw new VaerionError("E2200", "entry stream truncated in path bytes");
    let path: string;
    try {
      path = decoder.decode(payload.subarray(off, off + pathLen));
    } catch {
      throw new VaerionError("E2200", "entry path is not valid UTF-8");
    }
    off += pathLen;
    assertSafeEntryPath(path);
    if (last !== null && comparePaths(path, last) <= 0) {
      throw new VaerionError("E2200", `entry order is not canonical at "${path}" (previous "${last}")`);
    }
    last = path;
    if (off + 8 > payload.length) throw new VaerionError("E2200", "entry stream truncated in content length");
    const contentLen = readU64be(payload, off);
    off += 8;
    if (off + contentLen > payload.length) throw new VaerionError("E2200", `entry stream truncated in content of "${path}"`);
    out.push({ path, content: payload.slice(off, off + contentLen) });
    off += contentLen;
  }
  return { entries: out, bytesConsumed: off };
}

/**
 * The entry path law (fail-closed): project-relative POSIX paths that can
 * never escape the bundle root. Absolute paths, "..", drive letters,
 * backslashes, NUL, and trailing slashes are refused.
 */
export function assertSafeEntryPath(path: string): void {
  const fail = (why: string): never => {
    throw new VaerionError("E2200", `unsafe bundle entry path "${path}": ${why}`);
  };
  if (path.length === 0) fail("empty path");
  if (path.includes("\0")) fail("contains NUL");
  if (path.includes("\\")) fail("backslash is not a bundle path separator");
  if (path.startsWith("/")) fail("absolute path");
  if (/^[a-zA-Z]:/.test(path)) fail("drive-letter path");
  if (path.endsWith("/")) fail("directory path (bundles carry files only)");
  const segments = path.split("/");
  for (const seg of segments) {
    if (seg === "..") fail("traversal segment");
    if (seg === "." || seg === "") fail("empty segment");
  }
}

/* ─────────────────────────────  container encode/decode  ───────────────────────────── */

/** The full bundle bytes: magic + header length + canonical header + payload. */
export function encodeBundle(manifest: BundleManifest, payload: Uint8Array): Uint8Array {
  if (manifest.format !== 1) throw new VaerionError("E2203", `unsupported manifest format ${String(manifest.format)}`);
  if (manifest.compression.alg !== VXN_COMPRESSION_ALG || manifest.compression.level !== VXN_ZSTD_LEVEL) {
    throw new VaerionError("E2203", `compression pin violated: the format pins ${VXN_COMPRESSION_ALG} level ${VXN_ZSTD_LEVEL}`);
  }
  const headerBytes = new TextEncoder().encode(canonicalJson(manifest));
  const magicBytes = new TextEncoder().encode(VXN_MAGIC);
  const out = new Uint8Array(magicBytes.length + 4 + headerBytes.length + payload.length);
  out.set(magicBytes, 0);
  out.set(writeU32be(headerBytes.length), magicBytes.length);
  out.set(headerBytes, magicBytes.length + 4);
  out.set(payload, magicBytes.length + 4 + headerBytes.length);
  return out;
}

export interface DecodedBundle {
  manifest: BundleManifest;
  headerBytes: Uint8Array;
  payload: Uint8Array;
}

/**
 * Split a bundle into (manifest, payload) with structural law enforced:
 * magic/version (E2203), manifest re-serialization equality (E2200 — the
 * header must be canonical), manifest shape (E2200), and the compression pin
 * (E2203). Digest verification happens in verify.ts, not here — decoding is
 * structural, verification is evidential.
 */
export function decodeBundle(bytes: Uint8Array): DecodedBundle {
  if (bytes.length < 4) throw new VaerionError("E2203", "not a .vxn bundle (too short for magic)");
  let magic: string;
  try {
    magic = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, 4));
  } catch {
    throw new VaerionError("E2203", "not a .vxn bundle (magic is not ASCII)");
  }
  if (magic !== VXN_MAGIC) {
    // Distinguish "not a bundle at all" from "newer format" by the first three bytes.
    const prefix = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 3));
    if (prefix === "VXN") {
      throw new VaerionError("E2203", `bundle format version is newer than this engine supports (magic "${magic}")`);
    }
    throw new VaerionError("E2203", "not a .vxn bundle (bad magic)");
  }
  if (bytes.length < 8) throw new VaerionError("E2200", "bundle too short for a header length");
  const headerLen = readU32be(bytes, 4);
  if (headerLen <= 0 || 8 + headerLen > bytes.length) throw new VaerionError("E2200", `header length ${headerLen} out of bounds`);
  const headerBytes = bytes.slice(8, 8 + headerLen);
  const payload = bytes.slice(8 + headerLen);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(headerBytes));
  } catch {
    throw new VaerionError("E2200", "manifest header is not valid JSON");
  }
  const reserialized = canonicalJson(parsed);
  if (reserialized !== new TextDecoder().decode(headerBytes)) {
    throw new VaerionError("E2200", "manifest header is not canonical JSON (rebuild the bundle; hand-edited bytes are a format violation)");
  }
  return { manifest: assertManifestShape(parsed), headerBytes, payload };
}

/** Structural manifest law (types, pins, sorted entries; E2200 on drift). */
export function assertManifestShape(value: unknown): BundleManifest {
  const fail: (why: string) => never = (why) => {
    throw new VaerionError("E2200", `manifest shape violation: ${why}`);
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("manifest must be a mapping");
  const m = value as Record<string, unknown>;
  if (m.format !== 1) fail(`format must be 1, got ${String(m.format)}`);
  const comp = m.compression as Record<string, unknown> | undefined;
  if (!comp || comp.alg !== VXN_COMPRESSION_ALG || comp.level !== VXN_ZSTD_LEVEL) {
    fail(`compression pin violated (expected ${VXN_COMPRESSION_ALG} level ${VXN_ZSTD_LEVEL})`);
  }
  const project = m.project as Record<string, unknown> | undefined;
  if (!project || typeof project.name !== "string" || project.name.length === 0) fail("project.name required");
  if (typeof m.configFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(m.configFingerprint)) fail("configFingerprint must be blake3 hex");
  const builtWith = m.builtWith as Record<string, unknown> | undefined;
  if (!builtWith || typeof builtWith.engine !== "string" || builtWith.engine.length === 0) fail("builtWith.engine required");
  if (!Array.isArray(m.entries)) fail("entries must be an array");
  const entries: BundleEntry[] = [];
  let last: string | null = null;
  for (const e of m.entries as unknown[]) {
    const entry = e as Record<string, unknown>;
    if (!entry || typeof entry.path !== "string") fail("entry.path required");
    assertSafeEntryPath(entry.path as string);
    if (typeof entry.blake3 !== "string" || !/^[0-9a-f]{64}$/.test(entry.blake3)) fail(`entry ${String(entry.path)}: blake3 must be hex`);
    if (typeof entry.size !== "number" || !Number.isSafeInteger(entry.size) || (entry.size as number) < 0) fail(`entry ${String(entry.path)}: size must be a non-negative integer`);
    if (last !== null && comparePaths(entry.path as string, last) <= 0) fail(`entries not strictly ascending at ${String(entry.path)}`);
    last = entry.path as string;
    entries.push({ path: entry.path as string, blake3: entry.blake3 as string, size: entry.size as number });
  }
  if (!Array.isArray(m.pins)) fail("pins must be an array");
  const pins: BundlePin[] = [];
  let lastName: string | null = null;
  for (const p of m.pins as unknown[]) {
    const pin = p as Record<string, unknown>;
    if (!pin || typeof pin.name !== "string" || !/^[a-z][a-z0-9._-]{0,62}$/.test(pin.name)) fail("pin.name must be a valid tool name");
    if (typeof pin.digest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(pin.digest)) fail(`pin ${String(pin.name)}: digest must be "sha256:<hex>"`);
    if (lastName !== null && comparePaths(pin.name as string, lastName) <= 0) fail(`pins not strictly ascending at ${String(pin.name)}`);
    lastName = pin.name as string;
    pins.push({ name: pin.name as string, digest: pin.digest as string });
  }
  const payload = m.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload.blake3 !== "string" || !/^[0-9a-f]{64}$/.test(payload.blake3)) fail("payload.blake3 must be hex");
  if (typeof payload.size !== "number" || !Number.isSafeInteger(payload.size) || (payload.size as number) < 0) fail("payload.size must be a non-negative integer");
  if (typeof payload.uncompressedSize !== "number" || !Number.isSafeInteger(payload.uncompressedSize) || (payload.uncompressedSize as number) < 0) fail("payload.uncompressedSize must be a non-negative integer");
  return {
    format: 1,
    compression: { alg: VXN_COMPRESSION_ALG, level: VXN_ZSTD_LEVEL },
    project: { name: project.name as string },
    configFingerprint: m.configFingerprint as string,
    builtWith: { engine: builtWith.engine as string },
    entries,
    pins,
    payload: { blake3: payload.blake3 as string, size: payload.size as number, uncompressedSize: payload.uncompressedSize as number },
  };
}

/* ────────────────────────────────  compression  ──────────────────────────────── */

/** Compress at the pinned level. Deterministic for a fixed toolchain. */
export function compressPayload(bytes: Uint8Array): Uint8Array {
  return Bun.zstdCompressSync(bytes, { level: VXN_ZSTD_LEVEL });
}

/** Decompress (used by verify — a pure check, never content execution). */
export function decompressPayload(bytes: Uint8Array): Uint8Array {
  try {
    return Bun.zstdDecompressSync(bytes);
  } catch {
    throw new VaerionError("E2200", "payload is not valid zstd at the pinned level");
  }
}
