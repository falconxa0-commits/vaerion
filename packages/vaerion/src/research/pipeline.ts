/**
 * Vaerion — the ONE research pipeline (ASCENSION XVIII Phase 4; P8, D-O).
 *
 * Law: there is exactly ONE path from declared local sources to a journaled,
 * provenance-carrying context pack. Before this module that pipeline lived
 * inline in the L4 CLI (`run research`), forcing any new grounded surface to
 * either duplicate it or go through a command. Now both `vae run research`
 * and `vae ai ask` execute THIS fold, in this order, with these journaled
 * events (additive-only, all pre-existing types — no registry movement):
 *
 *   per document:  research.source.fetched → fingerprint → store.blob.put →
 *                  fence → research.evidence.recorded → research.index.updated
 *   then:          query → citations → prepareContext → research.context.prepared
 *
 * Determinism: document order is sorted; the pack fingerprint is blake3 over
 * canonical content; no wall-clock enters the derived values (only the
 * harness's own journaled timestamps, which are runtime data, not law).
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { RunHarness } from "../runtime/run.ts";
import type { Principal } from "../broker/contracts/principal.ts";
import { BlobStore } from "../store/blob-cas.ts";
import { fingerprintDocument } from "./fingerprint.ts";
import { fenceUntrusted } from "./fencing.ts";
import { provenanceOf } from "./provenance.ts";
import { buildEvidenceRecord, type EvidenceRecord } from "./evidence.ts";
import { makeCitations } from "./citation.ts";
import { LocalIndex, type IndexHit } from "./local-index.ts";
import { prepareContext, type ContextPack } from "./context.ts";
import type { ResearchCapabilityDeclaration } from "./capability.ts";

export interface SourceDoc {
  id: string;
  path: string;
  abs: string;
  text: string;
}

/** Deterministically collect markdown/text docs under declared local sources.
 *  The caller's cwd is EXPLICIT — no ambient process state (the pre-Phase-4
 *  module-global is gone by construction). */
export async function collectDocs(cwd: string, sources: string[], maxDocs: number): Promise<SourceDoc[]> {
  const docs: SourceDoc[] = [];
  for (const src of sources) {
    const abs = join(cwd, src);
    const st = await stat(abs).catch(() => null);
    if (!st) {
      const { VaerionError } = await import("../kernel/errors.ts");
      throw new VaerionError("E1600", `declared local source not found: ${src}`, { path: src });
    }
    const files: string[] = [];
    if (st.isFile()) {
      files.push(abs);
    } else {
      const walk = async (dir: string, depth: number): Promise<void> => {
        if (depth > 4) return;
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
          const p = join(dir, e.name);
          if (e.isDirectory()) await walk(p, depth + 1);
          else if (/\.(md|txt|yaml|json|ts|tsx)$/.test(e.name)) files.push(p);
        }
      };
      await walk(abs, 0);
    }
    files.sort();
    for (const file of files) {
      if (docs.length >= maxDocs) break;
      const raw = await readFile(file, "utf8");
      docs.push({
        id: `doc_${docs.length + 1}`,
        path: relative(cwd, file),
        abs: file,
        text: raw.slice(0, 16384),
      });
    }
  }
  return docs;
}

export interface ResearchPipelineInput {
  /** Workspace root (provenance paths are recorded relative to it). */
  cwd: string;
  /** The workspace blob CAS directory. */
  blobsDir: string;
  /** The run these records belong to (the harness does not expose it). */
  runId: string;
  /** The run trace id. */
  traceId: string;
  /** The run clock port (provenance timestamps; injected, never ambient). */
  clock: import("../kernel/clock.ts").Clock;
  /** The open run harness (journal first, spine fan-out second — D-F). */
  harness: RunHarness;
  /** The declared capability this pipeline indexes for. */
  capability: ResearchCapabilityDeclaration;
  /** The attributed research principal (D-D; every event carries it). */
  principal: Principal;
  sources: string[];
  maxDocs: number;
  query: string;
  budgetTokens: number;
  instructionText: string;
}

export interface ResearchPipelineResult {
  docs: SourceDoc[];
  evidence: EvidenceRecord[];
  hits: IndexHit[];
  pack: ContextPack;
}

/**
 * The shared pipeline fold: index the declared sources, then prepare the
 * context pack for the query. Every step is journaled through the harness —
 * decide→journal→act is honored upstream (broker decisions happen in the
 * calling surface, before this fold runs).
 */
export async function assembleResearchContext(input: ResearchPipelineInput): Promise<ResearchPipelineResult> {
  const { harness, capability, principal } = input;
  const docs = await collectDocs(input.cwd, input.sources, input.maxDocs);
  const blobs = new BlobStore(input.blobsDir);
  const index = new LocalIndex();
  const evidence: EvidenceRecord[] = [];
  for (const doc of docs) {
    await harness.emit("research.source.fetched", { source_id: doc.id, path: doc.path, bytes: Buffer.byteLength(doc.text) }, principal, { kind: "envelope", ref: String(harness.journal.lastSeq) });
    const fp = await fingerprintDocument(doc.text, doc.id);
    const blobRef = await blobs.put(doc.text);
    await harness.emit("store.blob.put", { blob_ref: blobRef, purpose: `document:${doc.id}` }, principal, { kind: "envelope", ref: String(harness.journal.lastSeq) });
    const fenced = fenceUntrusted({ sourceId: doc.id, sourcePath: doc.path, capability: capability.name, fingerprint: fp, content: doc.text });
    const ev = buildEvidenceRecord({
      evidenceId: `${input.runId}:${doc.id}`,
      runId: input.runId,
      traceId: input.traceId,
      capability: capability.name,
      sourceId: doc.id,
      blobRef,
      fenced,
      provenance: provenanceOf({ evidenceId: `${input.runId}:${doc.id}`, sourceId: doc.id, sourcePath: doc.path, fingerprint: fp, retrievedAt: input.clock.nowIso(), locator: `${doc.path}#head` }),
      recordedAt: input.clock.nowIso(),
    });
    // The FULL evidence record is journaled (never a summary): research
    // state must be restorable by folding the journal (R-RT2), and the
    // replay reducer consumes exactly this payload shape.
    await harness.emit("research.evidence.recorded", { evidence: ev, blob_ref: blobRef }, principal, { kind: "envelope", ref: String(harness.journal.lastSeq) });
    evidence.push(ev);
    const indexed = index.addDocument({ docId: doc.id, sourceId: doc.id, sourcePath: doc.path, fingerprint: fp, text: doc.text });
    await harness.emit("research.index.updated", { doc: indexed }, principal, { kind: "envelope", ref: String(harness.journal.lastSeq) });
  }

  const hits = index.query(input.query);
  const citations = makeCitations(evidence, Object.fromEntries(evidence.map((e) => [e.evidence_id, null])));
  const pack = await prepareContext({
    query: input.query,
    capability,
    hits,
    evidence,
    citations,
    budgetTokens: input.budgetTokens,
    instructionText: input.instructionText,
  });
  await harness.emit(
    "research.context.prepared",
    { pack_fingerprint: pack.pack_fingerprint, query: input.query, capability: capability.name, tokens_estimated: pack.tokens_estimated, blocks: pack.blocks.length, dropped: pack.dropped_count },
    principal,
    { kind: "envelope", ref: String(harness.journal.lastSeq) },
  );
  return { docs, evidence, hits, pack };
}

/** Render the context pack as the grounded system prompt (deterministic:
 *  the same blocks yield the same bytes). The instruction block comes first;
 *  every piece of untrusted evidence travels ONLY inside its fence, with its
 *  citation id pinned to the fence header. Deliberately EXCLUDED: the pack
 *  fingerprint and provenance timestamps — they carry retrieval-time wall-
 *  clock material, and a seeded request must stay byte-deterministic. */
export function renderPackAsSystemPrompt(pack: ContextPack): string {
  const parts: string[] = [];
  for (const block of pack.blocks) {
    if (block.kind === "instruction") {
      parts.push(block.text);
    } else {
      parts.push(`${block.fence}\ncitation: ${block.citation_id}`);
    }
  }
  return parts.join("\n\n");
}
