/**
 * Vaerion packaging — .vxn format law, unit level (MS-6, ADR-0016).
 *
 * Law under test: canonical entry ordering (strictly ascending, duplicates
 * refused); the entry path law (no absolute, no traversal, no NUL, no
 * backslash); the container law (magic VXN1, canonical manifest header,
 * compression pin zstd@19); manifest shape drift refused (E2200); zstd
 * roundtrip + pinned-level byte determinism (P2).
 */

import { describe, expect, test } from "bun:test";
import {
  VXN_MAGIC,
  VXN_ZSTD_LEVEL,
  encodeEntryStream,
  decodeEntryStream,
  encodeBundle,
  decodeBundle,
  assertManifestShape,
  assertSafeEntryPath,
  compressPayload,
  decompressPayload,
  comparePaths,
  type BundleManifest,
} from "../../src/package/format.ts";
import { VaerionError, type ErrorCode } from "../../src/kernel/errors.ts";

function expectCodeSync(fn: () => unknown, code: ErrorCode): void {
  try {
    fn();
    expect.unreachable();
  } catch (err) {
    expect((err as VaerionError).code).toBe(code);
  }
}

function manifestFor(entries: Array<{ path: string; content: string }>): { manifest: BundleManifest; stream: Uint8Array } {
  const encoder = new TextEncoder();
  const contents = new Map<string, Uint8Array>();
  const list = entries
    .map((e) => ({ path: e.path, content: encoder.encode(e.content) }))
    .sort((a, b) => comparePaths(a.path, b.path));
  for (const e of list) contents.set(e.path, e.content);
  const stream = encodeEntryStream(
    list.map((e) => ({ path: e.path, blake3: "a".repeat(64), size: e.content.length })),
    contents,
  );
  const payload = compressPayload(stream);
  const manifest: BundleManifest = {
    format: 1,
    compression: { alg: "zstd", level: VXN_ZSTD_LEVEL },
    project: { name: "unit-fmt" },
    configFingerprint: "b".repeat(64),
    builtWith: { engine: "test" },
    entries: list.map((e) => ({ path: e.path, blake3: "a".repeat(64), size: e.content.length })),
    pins: [],
    payload: { blake3: "c".repeat(64), size: payload.length, uncompressedSize: stream.length },
  };
  return { manifest, stream };
}

describe("package format — entry stream", () => {
  test("roundtrips canonically ordered entries byte-exactly", () => {
    const { stream } = manifestFor([
      { path: "docs/b.md", content: "second" },
      { path: "docs/a.md", content: "first" },
      { path: "z-last.txt", content: "end" },
    ]);
    const decoded = decodeEntryStream(decompressPayload(compressPayload(stream)));
    expect(decoded.entries.map((e) => e.path)).toEqual(["docs/a.md", "docs/b.md", "z-last.txt"]);
    expect(new TextDecoder().decode(decoded.entries[0]!.content)).toBe("first");
    expect(decoded.bytesConsumed).toBe(stream.length);
  });

  test("refuses out-of-order and duplicate paths (E2200)", () => {
    const encoder = new TextEncoder();
    const contents = new Map<string, Uint8Array>([["b", encoder.encode("1")], ["a", encoder.encode("2")]]);
    expectCodeSync(
      () =>
        encodeEntryStream(
          [{ path: "b", blake3: "a".repeat(64), size: 1 }, { path: "a", blake3: "a".repeat(64), size: 1 }],
          contents,
        ),
      "E2200",
    );
    expectCodeSync(
      () =>
        encodeEntryStream(
          [{ path: "a", blake3: "a".repeat(64), size: 1 }, { path: "a", blake3: "a".repeat(64), size: 1 }],
          contents,
        ),
      "E2200",
    );
    expectCodeSync(
      () => encodeEntryStream([{ path: "a", blake3: "a".repeat(64), size: 1 }], new Map()),
      "E2200",
    );
  });

  test("path law: traversal, absolute, backslash, NUL, drive letter, trailing slash, empty segment (E2200)", () => {
    expectCodeSync(() => assertSafeEntryPath("../escape"), "E2200");
    expectCodeSync(() => assertSafeEntryPath("a/../../b"), "E2200");
    expectCodeSync(() => assertSafeEntryPath("/absolute"), "E2200");
    expectCodeSync(() => assertSafeEntryPath("C:\\win"), "E2200");
    expectCodeSync(() => assertSafeEntryPath("a\\b"), "E2200");
    expectCodeSync(() => assertSafeEntryPath("bad\0nul"), "E2200");
    expectCodeSync(() => assertSafeEntryPath("C:/drive"), "E2200");
    expectCodeSync(() => assertSafeEntryPath("dir/"), "E2200");
    expectCodeSync(() => assertSafeEntryPath("a//b"), "E2200");
    expectCodeSync(() => assertSafeEntryPath("./here"), "E2200");
    expectCodeSync(() => assertSafeEntryPath(""), "E2200");
    expect(assertSafeEntryPath("docs/a.md")).toBeUndefined();
  });

  test("trailing bytes after the last entry are a format violation (E2200)", () => {
    const { stream } = manifestFor([{ path: "a.txt", content: "x" }]);
    const padded = new Uint8Array(stream.length + 3);
    padded.set(stream, 0);
    expectCodeSync(() => decodeEntryStream(padded), "E2200");
    const truncated = stream.subarray(0, stream.length - 2);
    expectCodeSync(() => decodeEntryStream(truncated), "E2200");
  });
});

describe("package format — container", () => {
  test("magic is VXN1 and the compression pin is zstd at the pinned level", () => {
    expect(VXN_MAGIC).toBe("VXN1");
    expect(VXN_ZSTD_LEVEL).toBe(19);
  });

  test("encode → decode roundtrip preserves the manifest and payload", () => {
    const { manifest, stream } = manifestFor([{ path: "a.txt", content: "hello bundle" }]);
    const bytes = encodeBundle(manifest, compressPayload(stream));
    const decoded = decodeBundle(bytes);
    expect(decoded.manifest).toEqual(manifest);
    expect(decompressPayload(decoded.payload).length).toBe(stream.length);
  });

  test("bad magic refuses honestly (E2203)", () => {
    const { manifest, stream } = manifestFor([{ path: "a.txt", content: "x" }]);
    const bytes = encodeBundle(manifest, compressPayload(stream));
    const forged = new TextEncoder().encode("NOPE" + new TextDecoder().decode(bytes.subarray(4)));
    expectCodeSync(() => decodeBundle(forged), "E2203");
    // A newer VXN magic is distinguished from garbage.
    const newer = new TextEncoder().encode("VXN2" + new TextDecoder().decode(bytes.subarray(4)));
    expectCodeSync(() => decodeBundle(newer), "E2203");
    expectCodeSync(() => decodeBundle(new Uint8Array(2)), "E2203");
  });

  test("a non-canonical manifest header is a format violation (E2200)", () => {
    const { manifest, stream } = manifestFor([{ path: "a.txt", content: "x" }]);
    const payload = compressPayload(stream);
    const prettyHeader = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    const forged = new Uint8Array(8 + prettyHeader.length + payload.length);
    forged.set(new TextEncoder().encode(VXN_MAGIC), 0);
    new DataView(forged.buffer).setUint32(4, prettyHeader.length);
    forged.set(prettyHeader, 8);
    forged.set(payload, 8 + prettyHeader.length);
    expectCodeSync(() => decodeBundle(forged), "E2200");
  });

  test("manifest shape drift is refused (E2200)", () => {
    const { manifest } = manifestFor([{ path: "a.txt", content: "x" }]);
    expectCodeSync(() => assertManifestShape({ ...manifest, format: 2 }), "E2200");
    expectCodeSync(() => assertManifestShape({ ...manifest, compression: { alg: "gzip", level: 9 } }), "E2200");
    expectCodeSync(() => assertManifestShape({ ...manifest, configFingerprint: "nothex" }), "E2200");
    expectCodeSync(() => assertManifestShape({ ...manifest, entries: [{ path: "../x", blake3: "a".repeat(64), size: 1 }] }), "E2200");
    expectCodeSync(
      () =>
        assertManifestShape({
          ...manifest,
          entries: [
            { path: "b", blake3: "a".repeat(64), size: 1 },
            { path: "a", blake3: "a".repeat(64), size: 1 },
          ],
        }),
      "E2200",
    );
    expectCodeSync(() => assertManifestShape({ ...manifest, pins: [{ name: "Bad Name", digest: "sha256:" + "a".repeat(64) }] }), "E2200");
    expectCodeSync(() => assertManifestShape({ ...manifest, pins: [{ name: "x", digest: "md5:zz" }] }), "E2200");
    expectCodeSync(() => assertManifestShape({ ...manifest, payload: { ...manifest.payload, size: -1 } }), "E2200");
    expectCodeSync(() => assertManifestShape("not a manifest"), "E2200");
  });

  test("compression pin is enforced at encode time (E2203)", () => {
    const { manifest, stream } = manifestFor([{ path: "a.txt", content: "x" }]);
    const drifted = { ...manifest, compression: { alg: "zstd", level: 3 } };
    expectCodeSync(() => encodeBundle(drifted as BundleManifest, compressPayload(stream)), "E2203");
  });
});

describe("package format — zstd pin", () => {
  test("compression is byte-deterministic at the pinned level (P2 fold law)", () => {
    const payload = new TextEncoder().encode("vaerion deterministic bundle payload ".repeat(500));
    const a = compressPayload(payload);
    const b = compressPayload(payload);
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
    expect(new TextDecoder().decode(decompressPayload(a))).toBe(new TextDecoder().decode(payload));
  });

  test("empty and binary payloads roundtrip", () => {
    const empty = compressPayload(new Uint8Array(0));
    expect(decompressPayload(empty).length).toBe(0);
    const binary = new Uint8Array(256);
    for (let i = 0; i < 256; i++) binary[i] = i;
    expect(Buffer.compare(Buffer.from(decompressPayload(compressPayload(binary))), Buffer.from(binary))).toBe(0);
  });
});
