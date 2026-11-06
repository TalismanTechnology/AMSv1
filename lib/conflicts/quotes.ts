// The model quotes each side of a conflict. A quote that isn't in the chunk
// would show admins (and, once resolved, parents) words no document says, so
// every quote is checked against its chunk before a conflict is kept.

/** Fold the differences PDF text layers and models introduce: spacing, case, curly quotes, dashes. */
export function normalizeQuoteText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Does `quote` appear in `text`, whitespace (and case/quote style) aside? */
export function quoteAppearsIn(quote: string, text: string): boolean {
  const q = normalizeQuoteText(quote).replace(/^["']+|["']+$/g, "").trim();
  // Too short to pin anything to the chunk ("3", "yes").
  if (q.length < 4) return false;
  return normalizeQuoteText(text).includes(q);
}

/**
 * Where `quote` sits in `text`, as [start, end) offsets into the original
 * text, for highlighting. Spacing in the original may differ from the quote's.
 */
export function findQuoteRange(quote: string, text: string): [number, number] | null {
  const words = normalizeQuoteText(quote)
    .replace(/^["']+|["']+$/g, "")
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return null;
  const escape = (w: string) =>
    w
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/'/g, "['‘’‚‛′]")
      .replace(/"/g, '["“”„‟″]')
      .replace(/-/g, "[-‐-―−]");
  const re = new RegExp(words.map(escape).join("\\s+"), "iu");
  const match = re.exec(text);
  return match ? [match.index, match.index + match[0].length] : null;
}

export interface HighlightedExcerpt {
  before: string;
  match: string;
  after: string;
  /** Text was cut before `before` / after `after`. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

/**
 * A readable window of `text` around `quote`, split for highlighting: about
 * `radius` characters either side, cut at word boundaries. Without the quote
 * (or when it can't be found) the window is the start of the text.
 */
export function excerptAround(text: string, quote: string | null, radius = 280): HighlightedExcerpt {
  const range = quote ? findQuoteRange(quote, text) : null;
  const [start, end] = range ?? [0, 0];
  let from = Math.max(0, start - radius);
  let to = Math.min(text.length, (range ? end : 0) + radius * (range ? 1 : 2));
  if (from > 0) {
    const space = text.indexOf(" ", from);
    if (space >= 0 && space < start) from = space + 1;
  }
  if (to < text.length) {
    const space = text.lastIndexOf(" ", to);
    if (space > end) to = space;
  }
  const tidy = (s: string) => s.replace(/\s+/g, " ");
  return {
    before: tidy(text.slice(from, start)).trimStart(),
    match: tidy(text.slice(start, end)),
    after: tidy(text.slice(end, to)).trimEnd(),
    clippedStart: from > 0,
    clippedEnd: to < text.length,
  };
}

/**
 * The chunk text to store with a judged pair, so the conflict still reads
 * once the chunk is replaced: the whole text when short, else about
 * `radius` characters either side of the statement, "…" marking cuts.
 */
export function storedExcerpt(text: string, statement: string | null, radius = 700): string {
  const e = excerptAround(text, statement, radius);
  return `${e.clippedStart ? "… " : ""}${e.before}${e.match}${e.after}${e.clippedEnd ? " …" : ""}`;
}

// ── Neighbouring chunks ──────────────────────────────────────────────────────
// A chunk is ~1000 characters, split with ~200 of overlap. The sentence that
// decides a conflict is often in the chunk above or below the one that
// matched ("Winter dress code begins Monday, November 23 through Thursday,
// February 25" heading chunk 0, the clothing list in chunk 1), so the judge
// reads each side as the matched chunk with its neighbours.

/** Normalized seam overlap, in characters, below which two chunks are just joined. */
export const MIN_SEAM_OVERLAP = 25;
/** The chunker's overlap is 200 characters; look a little further for safety. */
const MAX_SEAM_SEARCH = 600;

/**
 * Lowercased, whitespace-collapsed text and, for each of its characters, the
 * offset of that character in the original.
 */
function normalizeWithOffsets(text: string): { norm: string; offsets: number[] } {
  let norm = "";
  const offsets: number[] = [];
  let pendingSpace = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (norm.length > 0 && pendingSpace < 0) pendingSpace = i;
      continue;
    }
    if (pendingSpace >= 0) {
      norm += " ";
      offsets.push(pendingSpace);
      pendingSpace = -1;
    }
    norm += ch.toLowerCase();
    offsets.push(i);
  }
  return { norm, offsets };
}

/**
 * Where `head` stops repeating the end of `tail`: the offset into `head` just
 * after the longest overlap of at least MIN_SEAM_OVERLAP normalized
 * characters, or 0 when they don't overlap.
 */
export function seamOverlapEnd(tail: string, head: string): number {
  const t = normalizeWithOffsets(tail.slice(-MAX_SEAM_SEARCH)).norm;
  const { norm: h, offsets } = normalizeWithOffsets(head);
  if (t.length < MIN_SEAM_OVERLAP || h.length < MIN_SEAM_OVERLAP) return 0;
  const probe = h.slice(0, MIN_SEAM_OVERLAP);
  // Earliest start in the tail = longest overlap.
  for (let p = t.indexOf(probe); p >= 0 && t.length - p >= MIN_SEAM_OVERLAP; p = t.indexOf(probe, p + 1)) {
    const overlap = t.slice(p);
    if (!h.startsWith(overlap)) continue;
    return overlap.length >= h.length ? head.length : offsets[overlap.length];
  }
  return 0;
}

/**
 * The matched chunk with the chunks either side of it, as one text, the text
 * the chunker repeated at each seam kept once. Chunks that don't overlap are
 * separated by a blank line.
 */
export function stitchChunkWindow(prev: string | null, current: string, next: string | null): string {
  let out = current.trim();
  if (prev?.trim()) {
    const p = prev.trim();
    const cut = seamOverlapEnd(p, out);
    out = cut > 0 ? p + out.slice(cut) : `${p}\n\n${out}`;
  }
  if (next?.trim()) {
    const n = next.trim();
    const cut = seamOverlapEnd(out, n);
    out = cut > 0 ? out + n.slice(cut) : `${out}\n\n${n}`;
  }
  return out;
}

export type WindowPart = "prev" | "current" | "next";

/**
 * Which chunk of a window holds `quote`: the matched chunk when it does,
 * else the neighbour that does. A quote across a seam (in neither chunk
 * alone) stays with the matched chunk.
 */
export function locateQuoteInWindow(
  quote: string,
  prev: string | null,
  current: string,
  next: string | null
): WindowPart {
  if (quoteAppearsIn(quote, current)) return "current";
  if (prev && quoteAppearsIn(quote, prev)) return "prev";
  if (next && quoteAppearsIn(quote, next)) return "next";
  return "current";
}

/** A matched chunk with its neighbours, and the three stitched into one text. */
export interface QuoteWindow<T extends { content: string }> {
  prev: T | null;
  current: T;
  next: T | null;
  /** stitchChunkWindow() of the three. */
  text: string;
}

/**
 * The chunk of a window that holds `statement`, and the excerpt to store for
 * it: that chunk's text around the quote, or the stitched window's when the
 * quote runs across a seam (so the admin page can still highlight it). With
 * no statement, the matched chunk.
 */
export function pinQuoteToWindow<T extends { content: string }>(
  w: QuoteWindow<T>,
  statement: string | null
): { chunk: T; part: WindowPart; excerpt: string } {
  if (!statement) return { chunk: w.current, part: "current", excerpt: storedExcerpt(w.current.content, null) };
  const part = locateQuoteInWindow(statement, w.prev?.content ?? null, w.current.content, w.next?.content ?? null);
  const chunk = (part === "prev" ? w.prev : part === "next" ? w.next : null) ?? w.current;
  const acrossSeam = !quoteAppearsIn(statement, chunk.content) && quoteAppearsIn(statement, w.text);
  return { chunk, part, excerpt: storedExcerpt(acrossSeam ? w.text : chunk.content, statement) };
}
