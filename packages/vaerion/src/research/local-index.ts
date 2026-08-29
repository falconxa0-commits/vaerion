/**
 * Vaerion — the local research index (deterministic BM25).
 *
 * Law:
 *  - The index is IN-MEMORY for the live run; the journal is the truth
 *    (R-RT2). Every journaled `research.index.updated` payload is an
 *    `IndexedDoc`: JSON-safe, integer-only (canonicalJson rejects floats,
 *    E1901), and reproducible from its inputs alone.
 *  - Scoring is deterministic BM25 (k1=1.5, b=0.75, idf = ln(1 + (N - df + 0.5)
 *    / (df + 0.5))): same corpus + same query ⇒ same hits in the same order,
 *    on every machine, every replay (Machine Parity).
 *  - Hits are ordered by score desc, then doc_id asc — a total order, never
 *    insertion-order luck. Raw float scores live in memory only; anything
 *    that enters a hashed structure must be quantized (see context.ts
 *    milli-scores).
 */

import { VaerionError } from "../kernel/errors.ts";
import { assertDocumentFingerprintShape, type DocumentFingerprint } from "./fingerprint.ts";

/** A journal-safe, replay-stable record of one indexed document. */
export interface IndexedDoc {
  doc_id: string;
  source_id: string;
  source_path: string;
  fingerprint: DocumentFingerprint;
  /** Total token count — non-negative integer (journal-safe). */
  length: number;
  /** Unique term count — non-negative integer (journal-safe). */
  term_count: number;
  /** Unique terms, sorted ascending — deterministic across machines. */
  terms: string[];
}

/** One scored index result. Raw float score — in-memory only, never journaled. */
export interface IndexHit {
  doc_id: string;
  score: number;
  /** Query terms matched by this doc — unique, sorted ascending. */
  matched_terms: string[];
}

/** BM25 parameters — pinned constants, part of the deterministic contract. */
const BM25_K1 = 1.5;
const BM25_B = 0.75;

/** Tokenize: lowercase, runs of [a-z0-9_]. No stemming, no stopword lists —
 * behavior must be exactly reproducible from the algorithm alone. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
}

export function assertIndexedDocShape(value: unknown): asserts value is IndexedDoc {
  const doc = value as Partial<IndexedDoc> | null;
  if (!doc || typeof doc !== "object") {
    throw new VaerionError("E1600", "indexed doc: not an object");
  }
  if (typeof doc.doc_id !== "string" || doc.doc_id.length === 0) {
    throw new VaerionError("E1600", "indexed doc: doc_id must be a non-empty string");
  }
  if (typeof doc.source_id !== "string" || doc.source_id.length === 0) {
    throw new VaerionError("E1600", `indexed doc ${doc.doc_id}: source_id must be a non-empty string`);
  }
  if (typeof doc.source_path !== "string") {
    throw new VaerionError("E1600", `indexed doc ${doc.doc_id}: source_path must be a string`);
  }
  assertDocumentFingerprintShape(doc.fingerprint);
  if (!Number.isInteger(doc.length) || (doc.length as number) < 0) {
    throw new VaerionError("E1600", `indexed doc ${doc.doc_id}: length must be a non-negative integer`);
  }
  if (!Number.isInteger(doc.term_count) || (doc.term_count as number) < 0) {
    throw new VaerionError("E1600", `indexed doc ${doc.doc_id}: term_count must be a non-negative integer`);
  }
  if (!Array.isArray(doc.terms)) {
    throw new VaerionError("E1600", `indexed doc ${doc.doc_id}: terms must be an array`);
  }
  for (let i = 0; i < doc.terms.length; i++) {
    const term = doc.terms[i];
    if (typeof term !== "string" || term.length === 0) {
      throw new VaerionError("E1600", `indexed doc ${doc.doc_id}: terms[${i}] must be a non-empty string`);
    }
  }
  for (let i = 1; i < doc.terms.length; i++) {
    if ((doc.terms as string[])[i]! <= (doc.terms as string[])[i - 1]!) {
      throw new VaerionError("E1600", `indexed doc ${doc.doc_id}: terms must be sorted ascending and unique`);
    }
  }
  if (doc.term_count !== doc.terms.length) {
    throw new VaerionError("E1600", `indexed doc ${doc.doc_id}: term_count must equal terms.length`);
  }
}

interface Posting {
  docId: string;
  tf: number;
}

interface IndexedEntry {
  doc: IndexedDoc;
  tfByTerm: Map<string, number>;
}

/**
 * Deterministic BM25 index over local, declared sources. Adds are
 * content-addressed by doc_id: re-adding the same doc_id replaces the
 * previous entry (idempotent re-index); every add recomputes the doc record
 * from its inputs alone.
 */
export class LocalIndex {
  private readonly entries = new Map<string, IndexedEntry>();
  private readonly postings = new Map<string, Posting[]>();

  addDocument(input: {
    docId: string;
    sourceId: string;
    sourcePath: string;
    fingerprint: DocumentFingerprint;
    text: string;
  }): IndexedDoc {
    const fail = (why: string): never => {
      throw new VaerionError("E1600", `LocalIndex.addDocument: ${why}`);
    };
    if (!input || typeof input !== "object") fail("input must be an object");
    if (typeof input.docId !== "string" || input.docId.length === 0) fail("docId must be a non-empty string");
    if (typeof input.sourceId !== "string" || input.sourceId.length === 0) fail("sourceId must be a non-empty string");
    if (typeof input.sourcePath !== "string") fail("sourcePath must be a string");
    if (typeof input.text !== "string") fail("text must be a string");
    assertDocumentFingerprintShape(input.fingerprint);
    if (input.fingerprint.doc_id !== input.docId) {
      fail(`fingerprint.doc_id (${input.fingerprint.doc_id}) must equal docId (${input.docId})`);
    }

    // Replace-on-reindex: drop the old postings first so df stays exact.
    if (this.entries.has(input.docId)) this.removeDocument(input.docId);

    const tokens = tokenize(input.text);
    const tfByTerm = new Map<string, number>();
    for (const token of tokens) tfByTerm.set(token, (tfByTerm.get(token) ?? 0) + 1);
    const terms = [...tfByTerm.keys()].sort((a, z) => (a < z ? -1 : a > z ? 1 : 0));

    const doc: IndexedDoc = {
      doc_id: input.docId,
      source_id: input.sourceId,
      source_path: input.sourcePath,
      fingerprint: { ...input.fingerprint },
      length: tokens.length,
      term_count: terms.length,
      terms,
    };

    this.entries.set(doc.doc_id, { doc, tfByTerm });
    for (const [term, tf] of tfByTerm) {
      const list = this.postings.get(term);
      if (list) list.push({ docId: doc.doc_id, tf });
      else this.postings.set(term, [{ docId: doc.doc_id, tf }]);
    }
    return doc;
  }

  removeDocument(docId: string): boolean {
    const entry = this.entries.get(docId);
    if (!entry) return false;
    for (const term of entry.tfByTerm.keys()) {
      const list = this.postings.get(term);
      if (!list) continue;
      const next = list.filter((p) => p.docId !== docId);
      if (next.length === 0) this.postings.delete(term);
      else this.postings.set(term, next);
    }
    this.entries.delete(docId);
    return true;
  }

  get size(): number {
    return this.entries.size;
  }

  has(docId: string): boolean {
    return this.entries.has(docId);
  }

  /** All indexed documents, doc_id ascending — deterministic order. */
  docs(): IndexedDoc[] {
    return [...this.entries.values()].map((e) => e.doc).sort((a, z) => (a.doc_id < z.doc_id ? -1 : a.doc_id > z.doc_id ? 1 : 0));
  }

  documentCount(): number {
    return this.entries.size;
  }

  /**
   * Deterministic BM25 query. Documents containing at least one query term
   * are scored; ordering is score desc, then doc_id asc (total order).
   * limit defaults to 10 and must be an integer ≥ 1 (E1600 otherwise).
   */
  query(query: string, limit = 10): IndexHit[] {
    if (typeof query !== "string") {
      throw new VaerionError("E1600", "LocalIndex.query: query must be a string");
    }
    if (!Number.isInteger(limit) || limit < 1) {
      throw new VaerionError("E1600", `LocalIndex.query: limit must be an integer ≥ 1, got ${String(limit)}`);
    }
    const queryTerms = [...new Set(tokenize(query))];
    if (queryTerms.length === 0 || this.entries.size === 0) return [];

    const n = this.entries.size;
    const avgLen = [...this.entries.values()].reduce((sum, e) => sum + e.doc.length, 0) / n;

    const scores = new Map<string, { score: number; matched: Set<string> }>();
    for (const term of queryTerms) {
      const list = this.postings.get(term);
      if (!list || list.length === 0) continue;
      const df = list.length;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      for (const posting of list) {
        const entry = this.entries.get(posting.docId)!;
        const tf = posting.tf;
        const norm = 1 - BM25_B + BM25_B * (entry.doc.length / avgLen);
        const score = idf * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norm));
        const current = scores.get(posting.docId);
        if (current) {
          current.score += score;
          current.matched.add(term);
        } else {
          scores.set(posting.docId, { score, matched: new Set([term]) });
        }
      }
    }

    const hits: IndexHit[] = [...scores].map(([doc_id, agg]) => ({
      doc_id,
      score: agg.score,
      matched_terms: [...agg.matched].sort((a, z) => (a < z ? -1 : a > z ? 1 : 0)),
    }));
    hits.sort((a, z) => {
      if (z.score !== a.score) return z.score - a.score;
      if (a.doc_id < z.doc_id) return -1;
      if (a.doc_id > z.doc_id) return 1;
      return 0;
    });
    return hits.slice(0, limit);
  }
}
