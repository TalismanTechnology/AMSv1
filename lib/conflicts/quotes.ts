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
