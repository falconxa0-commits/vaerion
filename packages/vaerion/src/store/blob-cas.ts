/**
 * Vaerion — blob content-addressed store (CAS).
 *
 * Law: large I/O payloads live OUT of the journal as `blob_ref`s; the journal
 * carries the reference, the CAS carries the bytes (ratified: blob_ref).
 *
 * Layout: <root>/blake3/<h[0:2]>/<h[2:4]>/<h>. Content is addressed by its
 * own blake3 digest, so any mismatch is detectable (E1008) and dedupe is free.
 */

import { mkdir, readFile, writeFile, stat, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { blake3HexOf, type HashHex } from "../kernel/hash.ts";
import { VaerionError } from "../kernel/errors.ts";

export interface BlobRef {
  alg: "blake3";
  hash: HashHex;
  size: number;
}

export interface BlobRefInput {
  alg?: "blake3";
  hash: string;
  size: number;
}

export function assertBlobRefShape(value: unknown): asserts value is BlobRef {
  const r = value as Partial<BlobRef> | null;
  if (!r || typeof r !== "object") throw new VaerionError("E1007", "blob_ref is not an object");
  if (r.alg !== "blake3") throw new VaerionError("E1007", `blob_ref.alg must be blake3, got ${String(r.alg)}`);
  if (typeof r.hash !== "string" || !/^[0-9a-f]{64}$/.test(r.hash)) throw new VaerionError("E1007", "blob_ref.hash is not a blake3 hex");
  if (!Number.isInteger(r.size) || (r.size as number) < 0) throw new VaerionError("E1007", "blob_ref.size must be a non-negative integer");
}

export class BlobStore {
  constructor(private readonly root: string) {}

  private pathFor(hash: HashHex): string {
    return join(this.root, "blake3", hash.slice(0, 2), hash.slice(2, 4), hash);
  }

  /** Store bytes; returns the content-addressed ref. Dedupes by digest. */
  async put(content: Uint8Array | string): Promise<BlobRef> {
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    const hash = await blake3HexOf(bytes);
    const path = this.pathFor(hash);
    await mkdir(dirname(path), { recursive: true });
    const exists = await stat(path).then(() => true, () => false);
    if (!exists) {
      await writeFile(path, bytes, { flag: "wx" }); // CAS: never overwrite
    }
    return { alg: "blake3", hash, size: bytes.byteLength };
  }

  async open(ref: BlobRef | BlobRefInput): Promise<Uint8Array> {
    assertBlobRefShape({ alg: "blake3", ...ref });
    const path = this.pathFor(ref.hash);
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch {
      throw new VaerionError("E1007", `blob missing from CAS: ${ref.hash.slice(0, 12)}…`, { hash: ref.hash });
    }
    if (bytes.byteLength !== ref.size) {
      throw new VaerionError("E1008", `blob size mismatch: ref says ${ref.size}, store has ${bytes.byteLength}`, { hash: ref.hash });
    }
    const actual = await blake3HexOf(new Uint8Array(bytes));
    if (actual !== ref.hash) {
      throw new VaerionError("E1008", `blob digest mismatch: ref ${ref.hash.slice(0, 12)}…, computed ${actual.slice(0, 12)}…`, { hash: ref.hash });
    }
    return new Uint8Array(bytes);
  }

  async exists(ref: BlobRef | BlobRefInput): Promise<boolean> {
    return stat(this.pathFor(ref.hash)).then(() => true, () => false);
  }

  /** Verify one ref (digest + size). Returns the error it would throw, or null. */
  async verify(ref: BlobRef | BlobRefInput): Promise<VaerionError | null> {
    try {
      await this.open(ref);
      return null;
    } catch (err) {
      return err instanceof VaerionError ? err : new VaerionError("E1008", (err as Error).message);
    }
  }

  /** Remove a blob — GC only; refs are immutable, removal must be ref-counted upstream. */
  async unsafeRemove(ref: BlobRef | BlobRefInput): Promise<void> {
    await unlink(this.pathFor(ref.hash)).catch(() => undefined);
  }
}
