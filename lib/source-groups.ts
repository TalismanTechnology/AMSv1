import type { ChatSource } from "@/lib/types";

export interface SourceGroup {
  key: string;
  title: string;
  /** Passages to show, in [N] order. */
  passages: ChatSource[];
  isCited: boolean;
}

/**
 * One row per document, not per [N]. A document now contributes several
 * numbered passages; listing each as its own card would repeat the title once
 * per passage. The row shows the passages the answer actually cited, so every
 * chip opens the page its fact came from.
 */
export function groupSources(sources: ChatSource[], citedNumbers: Set<number>): SourceGroup[] {
  const sorted = [...sources].sort((a, b) => (a.source_number ?? 0) - (b.source_number ?? 0));
  const groups = new Map<string, { title: string; all: ChatSource[] }>();

  for (const source of sorted) {
    const isDocument = (source.source_type ?? "document") === "document";
    // Legacy calendar/announcement sources are only listed when cited.
    if (!isDocument && !(source.source_number != null && citedNumbers.has(source.source_number))) {
      continue;
    }
    const key = isDocument ? source.document_id : `${source.source_type}-${source.source_number}`;
    const group = groups.get(key);
    if (group) group.all.push(source);
    else groups.set(key, { title: source.title, all: [source] });
  }

  const result = [...groups.entries()].map(([key, { title, all }]) => {
    const cited = all.filter((s) => s.source_number != null && citedNumbers.has(s.source_number));
    return {
      key,
      title,
      // Uncited documents still get a row (the parent may want to browse
      // them), opening at their strongest passage.
      passages: cited.length > 0 ? cited : [strongest(all)],
      isCited: cited.length > 0,
    };
  });

  // Documents the answer relies on first, in the order it first cites them.
  return [
    ...result.filter((g) => g.isCited),
    ...result.filter((g) => !g.isCited),
  ];
}

function strongest(passages: ChatSource[]): ChatSource {
  return passages.reduce((best, s) => (s.similarity > best.similarity ? s : best));
}
