// Choosing which near-duplicate chunk pairs are worth a model's judgment.
// Pure, so the rules are unit-tested; lib/conflicts/scan.ts does the I/O.
//
// find_conflict_candidates (046) returns chunk pairs from different documents
// whose embeddings are nearly the same. Most are not conflicts: the same
// boilerplate on every web page, the same paragraph in two copies of a
// handbook. Each pair dropped here is a Gemini call not made.

import { quoteAppearsIn } from "./quotes";

/** A row from find_conflict_candidates. */
export interface CandidatePair {
  chunk_a_id: string;
  chunk_b_id: string;
  document_a_id: string;
  document_b_id: string;
  similarity: number;
}

export interface CandidateDocument {
  source?: string | null;
  source_url?: string | null;
}

export interface CandidateChunk {
  content: string;
}

export interface CandidateFilterOptions {
  /** Pairs to keep, best first. */
  limit: number;
  /** At most this many pairs from any one pair of documents. */
  maxPerDocumentPair?: number;
  /** Pairs at least this similar are copies of one text, not a disagreement. */
  identicalSimilarity?: number;
}

/**
 * A row already in document_conflicts (any status), by its documents and
 * statements: what survives its chunks being replaced.
 */
export interface ReviewedConflict {
  document_a_id: string;
  document_b_id: string;
  statement_a: string | null;
  statement_b: string | null;
}

export type SkipReason =
  | "same_document"
  | "already_judged"
  | "already_reviewed"
  | "website_pair"
  | "identical"
  | "different_year"
  | "missing_text"
  | "document_pair_cap"
  | "over_limit";

export interface CandidateFilterResult {
  selected: CandidatePair[];
  /** Pairs from different school years: auto-dismissed without judging. */
  differentYear: CandidatePair[];
  skipped: Record<SkipReason, number>;
}

export const DEFAULT_MAX_PER_DOCUMENT_PAIR = 3;
export const DEFAULT_IDENTICAL_SIMILARITY = 0.98;

/** One key per unordered chunk pair — matches document_conflicts.pair_key. */
export function pairKey(chunkA: string, chunkB: string): string {
  return chunkA < chunkB ? `${chunkA}:${chunkB}` : `${chunkB}:${chunkA}`;
}

function documentPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Reviewed conflicts with both statements, by unordered document pair. */
export function indexReviewedConflicts(rows: ReviewedConflict[]): Map<string, ReviewedConflict[]> {
  const index = new Map<string, ReviewedConflict[]>();
  for (const r of rows) {
    if (!r.statement_a?.trim() || !r.statement_b?.trim()) continue;
    const key = documentPairKey(r.document_a_id, r.document_b_id);
    const list = index.get(key);
    if (list) list.push(r);
    else index.set(key, [r]);
  }
  return index;
}

/**
 * Is this candidate a conflict already in document_conflicts under other
 * chunk ids? True when a row for the same two documents has each document's
 * statement in this candidate's chunk of that document — the same conflict,
 * found again after a document was re-chunked.
 */
export function isReviewedConflict(
  candidate: CandidatePair,
  textA: string,
  textB: string,
  reviewed: Map<string, ReviewedConflict[]>
): boolean {
  const rows = reviewed.get(documentPairKey(candidate.document_a_id, candidate.document_b_id));
  if (!rows) return false;
  const textOf = (documentId: string) => (documentId === candidate.document_a_id ? textA : textB);
  return rows.some(
    (r) =>
      quoteAppearsIn(r.statement_a ?? "", textOf(r.document_a_id)) &&
      quoteAppearsIn(r.statement_b ?? "", textOf(r.document_b_id))
  );
}

/** Case, punctuation and spacing aside, is this the same text? */
export function normalizeForComparison(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function isWebsiteDocument(doc: CandidateDocument | undefined): boolean {
  return !!doc && (doc.source === "website" || !!doc.source_url);
}

/**
 * Keep the pairs worth judging, most similar first:
 * - never two chunks of one document, nor a pair judged before (any status),
 *   by chunk ids or — after re-chunking — by the statements it was judged on;
 * - never two website pages — sites repeat headers, footers and sidebars on
 *   every page, and those near-copies would swamp the budget;
 * - never near-identical text: two copies of one sentence can't disagree;
 * - never two school years (`differentYear`, e.g. years.ts): returned apart,
 *   to be stored auto-dismissed without a model call;
 * - at most `maxPerDocumentPair` pairs per document pair, so two long
 *   overlapping handbooks can't take the whole run;
 * - at most `limit` in total.
 */
export function filterCandidates(
  candidates: CandidatePair[],
  {
    documents,
    chunks,
    judged,
    reviewed = new Map(),
    differentYear,
  }: {
    documents: Map<string, CandidateDocument>;
    chunks: Map<string, CandidateChunk>;
    /** pairKey()s already in document_conflicts. */
    judged: Set<string>;
    /** indexReviewedConflicts() of document_conflicts. */
    reviewed?: Map<string, ReviewedConflict[]>;
    /** Are these two chunks from different school years? */
    differentYear?: (candidate: CandidatePair, textA: string, textB: string) => boolean;
  },
  {
    limit,
    maxPerDocumentPair = DEFAULT_MAX_PER_DOCUMENT_PAIR,
    identicalSimilarity = DEFAULT_IDENTICAL_SIMILARITY,
  }: CandidateFilterOptions
): CandidateFilterResult {
  const skipped: Record<SkipReason, number> = {
    same_document: 0,
    already_judged: 0,
    already_reviewed: 0,
    website_pair: 0,
    identical: 0,
    different_year: 0,
    missing_text: 0,
    document_pair_cap: 0,
    over_limit: 0,
  };

  // Each unordered pair once, at its best similarity.
  const unique = new Map<string, CandidatePair>();
  for (const c of candidates) {
    const key = pairKey(c.chunk_a_id, c.chunk_b_id);
    const seen = unique.get(key);
    if (!seen || c.similarity > seen.similarity) unique.set(key, c);
  }

  const ranked = [...unique.entries()].sort(
    ([ka, a], [kb, b]) => b.similarity - a.similarity || (ka < kb ? -1 : ka > kb ? 1 : 0)
  );

  const selected: CandidatePair[] = [];
  const otherYear: CandidatePair[] = [];
  const perDocumentPair = new Map<string, number>();
  for (const [key, c] of ranked) {
    if (c.document_a_id === c.document_b_id || c.chunk_a_id === c.chunk_b_id) {
      skipped.same_document++;
      continue;
    }
    if (judged.has(key)) {
      skipped.already_judged++;
      continue;
    }
    if (
      isWebsiteDocument(documents.get(c.document_a_id)) &&
      isWebsiteDocument(documents.get(c.document_b_id))
    ) {
      skipped.website_pair++;
      continue;
    }
    const a = chunks.get(c.chunk_a_id)?.content;
    const b = chunks.get(c.chunk_b_id)?.content;
    if (!a?.trim() || !b?.trim()) {
      skipped.missing_text++;
      continue;
    }
    if (isReviewedConflict(c, a, b, reviewed)) {
      skipped.already_reviewed++;
      continue;
    }
    if (c.similarity >= identicalSimilarity || normalizeForComparison(a) === normalizeForComparison(b)) {
      skipped.identical++;
      continue;
    }
    if (differentYear?.(c, a, b)) {
      skipped.different_year++;
      otherYear.push(c);
      continue;
    }
    const docKey = documentPairKey(c.document_a_id, c.document_b_id);
    const used = perDocumentPair.get(docKey) ?? 0;
    if (used >= maxPerDocumentPair) {
      skipped.document_pair_cap++;
      continue;
    }
    if (selected.length >= limit) {
      skipped.over_limit++;
      continue;
    }
    perDocumentPair.set(docKey, used + 1);
    selected.push(c);
  }

  return { selected, differentYear: otherYear, skipped };
}
