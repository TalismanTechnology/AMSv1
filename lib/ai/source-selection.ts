import type { CitablePassage } from "./rag";

/**
 * Narrowing between retrieval and the prompt. Retrieval is deliberately wide
 * (see assemblePassages), but every passage the model sees is one it may cite,
 * and it cites generously: a question about one event came back citing five
 * near-identical "Calendar Details" pages. Fewer, stronger passages in means
 * fewer, truer citations out.
 */

// assemblePassages' own floor (MIN_CITABLE_SIMILARITY); repeated so this
// module stays pure.
export const MIN_PASSAGE_SIMILARITY = 0.5;
// A passage must score at least this fraction of the best passage. Close to
// the top is supporting material; far below it is merely on-topic.
export const RELATIVE_SIMILARITY_FLOOR = 0.75;
// Website pages sharing a title are usually different pages of one template
// (one "Calendar Details" page per event), so a couple may both be relevant.
export const MAX_SAME_TITLE_WEBSITE_PAGES = 2;

const normalizeTitle = (title: string) =>
  title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Query strings stay: calendar pages often differ only by `?event=…`.
const normalizeUrl = (url: string) => url.trim().replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();

const isWebsite = (p: CitablePassage) => p.source === "website" || !!p.source_url;

/**
 * Drop passages that score well below the best one, then collapse documents
 * that duplicate each other: one per web page URL, one per title for
 * non-website documents from the same source (a re-uploaded handbook), and
 * MAX_SAME_TITLE_WEBSITE_PAGES per title for website pages. The most relevant
 * copy wins. The single strongest passage is always kept, and order is
 * preserved so [N] numbering follows the input.
 */
export function selectPassages(passages: CitablePassage[]): CitablePassage[] {
  if (passages.length === 0) return [];

  const top = passages.reduce((best, p) => (p.similarity > best.similarity ? p : best));
  const floor = Math.max(MIN_PASSAGE_SIMILARITY, top.similarity * RELATIVE_SIMILARITY_FLOOR);
  const relevant = passages.filter((p) => p === top || p.similarity >= floor);

  // Each document's strength is its best surviving passage.
  const docScore = new Map<string, number>();
  for (const p of relevant) {
    docScore.set(p.document_id, Math.max(docScore.get(p.document_id) ?? 0, p.similarity));
  }
  const firstPassage = new Map<string, CitablePassage>();
  for (const p of relevant) if (!firstPassage.has(p.document_id)) firstPassage.set(p.document_id, p);

  // Strongest document first, so it claims its URL / title before any copy;
  // the top passage's document has the highest score and is never displaced.
  const documents = [...firstPassage.keys()].sort(
    (a, b) =>
      (b === top.document_id ? 1 : 0) - (a === top.document_id ? 1 : 0) ||
      docScore.get(b)! - docScore.get(a)!
  );

  const kept = new Set<string>();
  const seenUrls = new Set<string>();
  const titleCounts = new Map<string, number>();
  for (const id of documents) {
    const p = firstPassage.get(id)!;
    const url = p.source_url ? normalizeUrl(p.source_url) : null;
    if (url && seenUrls.has(url)) continue;

    const title = normalizeTitle(p.title);
    const website = isWebsite(p);
    const titleKey = title ? `${website ? "website" : (p.source ?? "")}|${title}` : null;
    const limit = website ? MAX_SAME_TITLE_WEBSITE_PAGES : 1;
    if (titleKey && (titleCounts.get(titleKey) ?? 0) >= limit) continue;

    kept.add(id);
    if (url) seenUrls.add(url);
    if (titleKey) titleCounts.set(titleKey, (titleCounts.get(titleKey) ?? 0) + 1);
  }

  return relevant.filter((p) => kept.has(p.document_id));
}
