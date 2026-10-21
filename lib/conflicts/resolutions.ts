import type { ChunkMetadata, CitablePassage, KnownChunk } from "@/lib/ai/rag";
import { quoteAppearsIn } from "./quotes";

// How an admin's ruling on a conflict changes what the chat model sees.
// Pure; lib/conflicts/store.ts loads the rows and lib/ai/chat-turn.ts applies
// the plan around passage assembly.
//
// Only RESOLVED conflicts count, and only when one of their sides is in the
// turn's context. A context chunk IS a side when it belongs to that side's
// document and either is the chunk judged (same id) or contains the side's
// statement — so a ruling still applies after the document is re-processed
// and its chunks replaced (the stored chunk id is then gone, or NULL).
// - a_correct / b_correct: the losing chunk leaves the context. If the
//   winning chunk didn't make it in, a one-line "School clarification" quoting
//   it is cited as the winning document, like any other passage.
// - custom: both chunks leave the context; the admin's answer is added as an
//   "Admin clarification" source.
// - Any admin note is added as an Admin clarification too.
// Clarifications only ever carry text from the conflict row — never anything
// the model wrote.

export type ConflictResolution = "a_correct" | "b_correct" | "custom";

export interface ResolvedConflictSide {
  /** Null once the judged chunk was replaced (document re-processed). */
  chunk_id: string | null;
  document_id: string;
  chunk_index: number;
  page: number | null;
  statement: string | null;
  document_title: string;
  file_url?: string;
  file_type?: string;
  source_url?: string;
  source?: string;
}

export interface ResolvedConflict {
  id: string;
  status: string;
  resolution: ConflictResolution | null;
  admin_note: string | null;
  resolved_at: string | null;
  a: ResolvedConflictSide;
  b: ResolvedConflictSide;
}

/** At most this many clarifications join one turn's sources. */
export const MAX_CLARIFICATIONS = 3;
export const CLARIFICATION_TITLE = "School clarification";
const CLARIFICATION_PREFIX = "clarification:";

export function chunkKey(documentId: string, chunkIndex: number): string {
  return `${documentId}:${chunkIndex}`;
}

/** A source id for an admin note: never a real document id. */
export function isClarificationId(documentId: string): boolean {
  return documentId.startsWith(CLARIFICATION_PREFIX);
}

/** A chunk the turn may draw on. */
export interface ContextChunk {
  document_id: string;
  chunk_index: number;
  /** Known for vector hits; keyword hits and neighbours come without. */
  id?: string | null;
  content?: string;
}

/** A resolved conflict that touches the turn, with the context chunks that are its sides. */
export interface RelevantConflict extends ResolvedConflict {
  /** chunkKey()s of the context chunks matched to either side. */
  contextKeys: string[];
}

/**
 * The turn's context chunks for planConflictResolutions: every chunk passages
 * may draw on (fetchPassageChunks' map, keyed by chunkKey), with the ids the
 * vector hits carry.
 */
export function conflictContext(
  known: Map<string, KnownChunk>,
  withIds: { id: string; document_id: string; chunk_index: number }[]
): ContextChunk[] {
  const ids = new Map(withIds.map((c) => [chunkKey(c.document_id, c.chunk_index), c.id]));
  const out: ContextChunk[] = [];
  for (const [key, chunk] of known) {
    const sep = key.lastIndexOf(":");
    const chunkIndex = Number(key.slice(sep + 1));
    if (sep <= 0 || !Number.isInteger(chunkIndex)) continue;
    out.push({ document_id: key.slice(0, sep), chunk_index: chunkIndex, id: ids.get(key), content: chunk.content });
  }
  return out;
}

/** Is this context chunk this side of a conflict? */
export function isConflictSide(chunk: ContextChunk, side: ResolvedConflictSide): boolean {
  if (chunk.document_id !== side.document_id) return false;
  if (side.chunk_id && chunk.id && chunk.id === side.chunk_id) return true;
  return !!side.statement?.trim() && !!chunk.content && quoteAppearsIn(side.statement, chunk.content);
}

/**
 * Which resolved conflicts touch this turn, and which chunks (chunkKey form)
 * to leave out: the losing side's, or both sides' for a written answer.
 */
export function planConflictResolutions(
  conflicts: ResolvedConflict[],
  context: ContextChunk[]
): { relevant: RelevantConflict[]; drop: Set<string> } {
  const relevant: RelevantConflict[] = [];
  const drop = new Set<string>();
  const keep = new Set<string>();
  for (const c of conflicts) {
    if (c.status !== "resolved" || !c.resolution) continue;
    if (c.resolution === "custom" && !c.admin_note?.trim()) continue;
    const aKeys: string[] = [];
    const bKeys: string[] = [];
    for (const chunk of context) {
      const key = chunkKey(chunk.document_id, chunk.chunk_index);
      if (isConflictSide(chunk, c.a)) aKeys.push(key);
      if (isConflictSide(chunk, c.b)) bKeys.push(key);
    }
    if (aKeys.length === 0 && bKeys.length === 0) continue;
    relevant.push({ ...c, contextKeys: [...aKeys, ...bKeys] });
    const losing =
      c.resolution === "a_correct" ? bKeys : c.resolution === "b_correct" ? aKeys : [...aKeys, ...bKeys];
    const winning = c.resolution === "a_correct" ? aKeys : c.resolution === "b_correct" ? bKeys : [];
    for (const key of losing) drop.add(key);
    for (const key of winning) keep.add(key);
  }
  // A chunk that won one ruling stays even if it lost another: dropping it
  // would remove the statement an admin confirmed.
  for (const key of keep) drop.delete(key);
  return { relevant, drop };
}

/** Remove the planned chunks from anything keyed by document id and chunk index. */
export function withoutDropped<T extends { document_id: string; chunk_index: number }>(
  items: T[],
  drop: Set<string>
): T[] {
  if (drop.size === 0) return items;
  return items.filter((i) => !drop.has(chunkKey(i.document_id, i.chunk_index)));
}

function dateOnly(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

const normalizeNote = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The clarification passages to append after the turn's own passages:
 * a winning statement that no passage of its document contains, and every
 * admin note. Deduplicated, at most MAX_CLARIFICATIONS.
 */
export function clarificationPassages(
  relevant: (ResolvedConflict & { contextKeys?: string[] })[],
  passages: CitablePassage[],
  /** Similarity to report for each chunk key that was retrieved. */
  similarityByKey: Map<string, number> = new Map()
): CitablePassage[] {
  const out: CitablePassage[] = [];
  const seen = new Set<string>();
  const similarityOf = (c: ResolvedConflict & { contextKeys?: string[] }) =>
    Math.max(0, ...(c.contextKeys ?? []).map((k) => similarityByKey.get(k) ?? 0)) || 0.5;
  const inPassages = (side: ResolvedConflictSide) =>
    passages.some((p) => p.document_id === side.document_id && quoteAppearsIn(side.statement ?? "", p.content));

  for (const c of relevant) {
    if (out.length >= MAX_CLARIFICATIONS) break;
    const winner = c.resolution === "a_correct" ? c.a : c.resolution === "b_correct" ? c.b : null;

    if (winner && winner.statement?.trim() && !inPassages(winner)) {
      const key = `winner|${winner.document_id}|${normalizeNote(winner.statement)}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          document_id: winner.document_id,
          title: winner.document_title,
          content: `${CLARIFICATION_TITLE}: ${winner.statement.trim()} (from ${winner.document_title})`,
          similarity: similarityOf(c),
          chunk_index: winner.chunk_index,
          chunk_indexes: [winner.chunk_index],
          metadata: (winner.page != null ? { page: winner.page } : {}) as ChunkMetadata,
          file_url: winner.file_url,
          file_type: winner.file_type,
          source_url: winner.source_url,
          source: winner.source,
          clarification: "winner",
        });
      }
    }

    const note = c.admin_note?.trim();
    if (note && out.length < MAX_CLARIFICATIONS) {
      const key = `note|${normalizeNote(note)}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          document_id: `${CLARIFICATION_PREFIX}${c.id}`,
          title: CLARIFICATION_TITLE,
          content: note,
          similarity: similarityOf(c),
          chunk_index: 0,
          chunk_indexes: [],
          metadata: {},
          clarification: "note",
          resolved_at: dateOnly(c.resolved_at),
        });
      }
    }
  }
  return out;
}
