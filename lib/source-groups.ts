import type { ChatSource } from "@/lib/types";

export interface SourceGroup {
  key: string;
  title: string;
  /** Passages to show, in [N] order. */
  passages: ChatSource[];
  isCited: boolean;
  /** A page from the school's website: listed by its page, not its passages. */
  isWebsite: boolean;
  /** A calendar entry: opens the calendar, not a document. */
  isEvent: boolean;
}

/** "Calendar Details - Collegiate School" and "calendar details – collegiate school" match. */
export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * One row per document, not per [N], and only the documents the answer
 * cites. A document contributes several numbered passages; the row shows the
 * ones the answer cited, so every chip opens the page its fact came from.
 *
 * Rows that are the same document in all but id — the same web page, or the
 * same title — merge into the one cited first. There is no row cap: every
 * cited [N] the parent sees lands in some row, so the list always accounts
 * for every inline number. Numbering is untouched: an inline [N] still opens
 * sources[N-1] even when its row was merged.
 *
 * Calendar entries are never merged by title: "Early Dismissal" on two dates
 * is two events, each with its own row.
 *
 * `citedNumbers` is read in insertion order, which is the order the answer
 * first cites each number.
 */
export function groupSources(sources: ChatSource[], citedNumbers: Set<number>): SourceGroup[] {
  const byNumber = new Map<number, ChatSource>();
  for (const source of sources) {
    if (source.source_number != null) byNumber.set(source.source_number, source);
  }

  const groups: (SourceGroup & { documentIds: Set<string>; urls: Set<string>; titles: Set<string> })[] = [];

  for (const n of citedNumbers) {
    const source = byNumber.get(n);
    if (!source) continue;
    const isDocument = (source.source_type ?? "document") === "document";
    const isEvent = source.source_type === "event";
    const title = isEvent ? "" : normalizeTitle(source.title);
    const url = source.source_url?.trim() || null;

    const existing = groups.find((g) =>
      isEvent
        ? g.isEvent && g.documentIds.has(source.document_id)
        : (isDocument && g.documentIds.has(source.document_id)) ||
          (url != null && g.urls.has(url)) ||
          (title !== "" && g.titles.has(title))
    );
    if (existing) {
      if (!existing.passages.includes(source)) existing.passages.push(source);
      if (isDocument) existing.documentIds.add(source.document_id);
      if (url) existing.urls.add(url);
      if (title) existing.titles.add(title);
      continue;
    }

    groups.push({
      key: isDocument ? source.document_id : `${source.source_type}-${n}`,
      title: source.title,
      passages: [source],
      isCited: true,
      isWebsite: url != null,
      isEvent,
      documentIds: new Set(isDocument || isEvent ? [source.document_id] : []),
      urls: new Set(url ? [url] : []),
      titles: new Set(title ? [title] : []),
    });
  }

  if (groups.length > 0) {
    return groups.map(({ key, title, passages, isCited, isWebsite, isEvent }) => ({
      key,
      title,
      passages: [...passages].sort((a, b) => (a.source_number ?? 0) - (b.source_number ?? 0)),
      isCited,
      isWebsite,
      isEvent,
    }));
  }

  // The answer cites nothing: list only the strongest document, so the parent
  // can still see where the answer most likely came from.
  const documents = sources.filter((s) => (s.source_type ?? "document") === "document");
  if (documents.length === 0) return [];
  const best = strongest(documents);
  return [
    {
      key: best.document_id,
      title: best.title,
      passages: [best],
      isCited: false,
      isWebsite: !!best.source_url,
      isEvent: false,
    },
  ];
}

function strongest(passages: ChatSource[]): ChatSource {
  return passages.reduce((best, s) => (s.similarity > best.similarity ? s : best));
}
