import crypto from "node:crypto";

// Change-detection decisions for website pages. Pure, so the rules that decide
// what gets re-embedded or deleted are unit-tested (change.test.ts).

/** Pages unseen for this many completed syncs in a row are deleted. */
export const MISSING_SYNCS_BEFORE_DELETE = 2;

/** Pages whose main text is shorter than this aren't worth a document. */
export const MIN_INGEST_CHARS = 80;

export interface KnownPage {
  content_hash: string | null;
  etag: string | null;
  last_modified: string | null;
  document_id: string | null;
}

export function sha256(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Hash of what the index would contain for an HTML page. Whitespace is
 * normalized so a re-indented template doesn't count as a change.
 */
export function htmlContentHash(title: string, text: string): string {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  return sha256(`${normalize(title)}\n${normalize(text)}`);
}

export type ResponseClass = "ok" | "not_modified" | "gone" | "error";

export function classifyStatus(status: number): ResponseClass {
  if (status === 304) return "not_modified";
  if (status === 404 || status === 410) return "gone";
  if (status >= 200 && status < 300) return "ok";
  return "error";
}

/**
 * Conditional-GET validators for a page we already hold. Only sent when the
 * stored copy is complete (indexed with a document), otherwise a 304 would
 * leave us with nothing to show for it.
 */
export function conditionalHeaders(page: KnownPage | null): Record<string, string> {
  if (!page?.document_id || !page.content_hash) return {};
  const headers: Record<string, string> = {};
  if (page.etag) headers["If-None-Match"] = page.etag;
  if (page.last_modified) headers["If-Modified-Since"] = page.last_modified;
  return headers;
}

/** Does fresh content need (re-)chunking and embedding? */
export function needsReingest(page: KnownPage | null, newHash: string): boolean {
  return !page || !page.document_id || page.content_hash !== newHash;
}

/**
 * Missed-sync bookkeeping when a run completes. A page not reached this run
 * has its counter bumped and is deleted once it reaches the threshold.
 */
export function nextMissingState(missingCount: number): { missingCount: number; remove: boolean } {
  const next = missingCount + 1;
  return { missingCount: next, remove: next >= MISSING_SYNCS_BEFORE_DELETE };
}

/**
 * Guard against a site outage (or a misconfigured pattern) wiping the index:
 * only count pages as missing when the run reached a reasonable share of what
 * the previous run had (capped at max_pages, which an admin may have lowered).
 */
export function shouldApplyMissing(
  seenThisRun: number,
  previousPageCount: number,
  maxPages: number
): boolean {
  if (seenThisRun === 0) return false;
  return seenThisRun >= Math.ceil(Math.min(previousPageCount, maxPages) * 0.5);
}
