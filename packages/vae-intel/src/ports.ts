/**
 * vae-intel — Project Intelligence ports (Stage: blueprint §5.2; law: D8.2, D14.5).
 *
 * Intel owns deterministic understanding of a project: symbols,
 * dependency graphs, semantic chunks, and vector search. MS-0
 * declares the PORTS and data contracts only — the indexer pipeline
 * is an MS-4 deliverable (foundations-before-features, D22.2).
 * There is deliberately no fake indexing here: an unimplemented port
 * has no implementation to import, so nothing can pretend to work.
 */

import type { Json } from "vae-foundation";

/** A symbol extracted from project source (deterministic, pinned). */
export interface SymbolRecord {
  readonly name: string;
  readonly kind: "function" | "class" | "method" | "variable" | "type" | "module";
  readonly path: string;
  readonly line: number;
  readonly signature?: string;
}

/** A semantic chunk with provenance (feeds the context engine, D14.3). */
export interface ChunkRecord {
  readonly chunkId: string;
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  /** blake3 fingerprint of the chunk content (D8.2 document identity). */
  readonly contentFingerprint: string;
  /** Vector reference — blobs by ref, never inline (D9.5). */
  readonly vectorRef?: string;
}

/** Indexer pipeline stage port (MS-4 implements; MS-0 declares). */
export interface IndexerStage {
  readonly name: string;
  process(input: Json): Promise<Json>;
}

/** Query DSL port for intel queries (MS-4). */
export interface IntelQueryPort {
  query(dsl: IntelQuery): Promise<SymbolRecord[]>;
}

export interface IntelQuery {
  readonly text: string;
  readonly kind?: SymbolRecord["kind"];
  readonly pathPrefix?: string;
  readonly limit?: number;
}

export const INTEL_STATUS = {
  portsDeclared: true,
  indexerImplemented: false,
  targetMilestone: "MS-4",
} as const;
