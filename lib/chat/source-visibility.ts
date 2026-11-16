import type { ChatSource } from "@/lib/types";

// Saved chats replay their citations, which hold passage text. A parent's
// view can shrink after the answer was saved (a document's grades changed, a
// child graduated or moved up), so on replay citations of documents they can
// no longer read are blanked. The entry stays so [n] still lines up. Pure.

export const HIDDEN_SOURCE_TITLE = "Document no longer available";

/** Document ids cited by these messages (not calendar entries or admin notes). */
export function citedDocumentIds(messages: { sources?: ChatSource[] | null }[]): string[] {
  const ids = new Set<string>();
  for (const m of messages) {
    for (const s of m.sources ?? []) {
      if (s.source_type === "event") continue;
      if (/^[0-9a-f-]{36}$/i.test(s.document_id)) ids.add(s.document_id);
    }
  }
  return [...ids];
}

/**
 * Which documents to hide: restricted ones (documents.visible_grades set)
 * the viewer's own session can't read.
 */
export function hiddenDocumentIds(restricted: Iterable<string>, readable: Iterable<string>): Set<string> {
  const ok = new Set(readable);
  return new Set([...restricted].filter((id) => !ok.has(id)));
}

export function blankHiddenSources<M extends { sources?: ChatSource[] | null }>(
  messages: M[],
  hidden: ReadonlySet<string>
): M[] {
  if (hidden.size === 0) return messages;
  return messages.map((m) =>
    m.sources?.some((s) => hidden.has(s.document_id))
      ? {
          ...m,
          sources: m.sources.map((s) =>
            hidden.has(s.document_id)
              ? {
                  document_id: s.document_id,
                  title: HIDDEN_SOURCE_TITLE,
                  chunk_content: "",
                  similarity: s.similarity,
                  ...(s.source_number !== undefined ? { source_number: s.source_number } : {}),
                }
              : s
          ),
        }
      : m
  );
}
