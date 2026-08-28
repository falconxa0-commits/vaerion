/**
 * vae-store — content-addressed blob store (D9.5, D8.2).
 *
 * Blobs are referenced, never inlined: payloads carry `blake3:<hex>`
 * references; bytes live here, addressed by their own digest. GC is
 * explicit and reference-aware and arrives with MS-1 (D12.5).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { blake3, blake3Ref, runFailureError } from "vae-foundation";

export type BlobRef = string & { readonly __brand: "blob-ref" };

export class BlobStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  /** Store bytes; returns their content-addressed `blake3:` reference. */
  put(bytes: Uint8Array): BlobRef {
    const digest = blake3(bytes);
    const file = this.pathFor(digest);
    if (!existsSync(file)) {
      // Content-addressed: identical bytes are stored once (idempotent put).
      writeFileSync(file, bytes);
    }
    return `blake3:${digest}` as BlobRef;
  }

  /** Open a blob by reference; refuses missing references (E3002). */
  open(ref: string): Uint8Array {
    if (!ref.startsWith("blake3:")) {
      throw runFailureError("E3002", `Malformed blob reference '${ref.slice(0, 24)}…'.`, "Blob references are `blake3:<hex>` (D9.5).");
    }
    const file = this.pathFor(ref.slice("blake3:".length));
    if (!existsSync(file)) {
      throw runFailureError("E3002", `A referenced blob is missing from the blob store (${ref.slice(0, 24)}…).`, "Restore the blob or remove the reference through the explicit, reference-aware GC (D9.5, D12.5).");
    }
    return new Uint8Array(readFileSync(file));
  }

  exists(ref: string): boolean {
    if (!ref.startsWith("blake3:")) return false;
    return existsSync(this.pathFor(ref.slice("blake3:".length)));
  }

  /** Verify that stored bytes still hash to their address (integrity). */
  verify(ref: string): boolean {
    if (!this.exists(ref)) return false;
    const bytes = this.open(ref);
    return blake3Ref(bytes) === ref;
  }

  private pathFor(digest: string): string {
    return join(this.dir, digest);
  }
}
