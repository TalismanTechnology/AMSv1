import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  searchDocuments,
  keywordSearchChunks,
  buildCitableDocuments,
  formatChunkLocation,
  type RelevantChunk,
  type KeywordHit,
} from "@/lib/ai/rag";
import {
  fetchEventsForContext,
  fetchAnnouncementsForContext,
  formatEventsContext,
  groupEventOccurrences,
  formatAnnouncementsContext,
  formatChildrenContext,
  getTodayString,
  type ChildContext,
} from "@/lib/ai/context";
import { rewriteQueryWithContext } from "@/lib/ai/rewrite-query";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import type { ChatSource } from "@/lib/types";

/** The model that writes parent-facing answers. Shared with the eval harness. */
export const CHAT_MODEL_ID = "gemini-2.5-flash";

// Grounded Q&A wants near-deterministic output; a school's configured
// temperature is honoured but never allowed above this.
const DEFAULT_TEMPERATURE = 0.2;
const MAX_TEMPERATURE = 0.5;

export interface ChatTurn {
  searchQuery: string;
  systemPrompt: string;
  /** Citable document sources, in [N] order. */
  sources: ChatSource[];
  /** Raw vector hits, for analytics. */
  relevantChunks: RelevantChunk[];
  modelMessages: ModelMessage[];
  temperature: number;
}

/**
 * Everything the chat route does before calling the model: query rewrite,
 * hybrid retrieval, calendar/announcement context, and system prompt assembly.
 *
 * Lives outside the route so scripts/eval-chat.ts runs the exact pipeline
 * production runs — an eval over a copy would drift from what parents see.
 */
export async function prepareChatTurn({
  messages,
  lastMessageText,
  schoolId,
  children,
  now,
}: {
  messages: UIMessage[];
  lastMessageText: string;
  schoolId: string;
  /** May be a pending fetch — it is awaited after the other context starts. */
  children: ChildContext[] | Promise<ChildContext[]>;
  /** Pinned by the eval so date-relative answers are reproducible. */
  now?: Date;
}): Promise<ChatTurn> {
  // Start the context fetches now; only the children are needed before the
  // rewrite, so the rest stay in flight through retrieval.
  const adminSupabase = createAdminClient();
  const restOfContext = Promise.allSettled([
    fetchEventsForContext(schoolId),
    fetchAnnouncementsForContext(schoolId),
    adminSupabase
      .from("settings")
      .select("custom_system_prompt, ai_temperature")
      .eq("school_id", schoolId)
      .single()
      .then((r) => r.data),
  ]);
  const resolvedChildren = await children;

  // Rewrite follow-up questions into standalone queries for better RAG
  // search. Children are passed so "and my other kid?" resolves to a grade
  // level the documents are actually organised by.
  const searchQuery = await rewriteQueryWithContext(
    messages,
    lastMessageText,
    resolvedChildren
  );

  // Retrieve with both strategies in parallel (non-fatal — continue without
  // sources on failure). Semantic search finds passages that mean the same
  // thing; keyword search finds the reference pages (directories, fee tables)
  // that embeddings consistently under-rank. Recall is deliberately wide —
  // buildCitableDocuments does the narrowing.
  let relevantChunks: RelevantChunk[] = [];
  let keywordHits: KeywordHit[] = [];
  const [vectorResult, keywordResult] = await Promise.allSettled([
    searchDocuments(searchQuery, 40, 0.45, schoolId),
    keywordSearchChunks(searchQuery, schoolId),
  ]);
  if (vectorResult.status === "fulfilled") relevantChunks = vectorResult.value;
  else console.error("RAG search failed (continuing without sources):", vectorResult.reason);
  if (keywordResult.status === "fulfilled") keywordHits = keywordResult.value;
  else console.error("Keyword search failed (continuing without it):", keywordResult.reason);

  // Events, announcements and settings were kicked off before the rewrite
  // (all non-fatal — an empty result just means less context)
  const [eventsResult, announcementsResult, settingsResult] = await restOfContext;
  const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
  const announcements =
    announcementsResult.status === "fulfilled" ? announcementsResult.value : [];
  const settings = settingsResult.status === "fulfilled" ? settingsResult.value : null;

  // Assemble one citable excerpt per relevant document: its best matching
  // passages plus their neighbours, stitched in document order. The same
  // ordered set is fed to the LLM as [Source 1..N] AND returned to the client
  // as sources[N-1], so inline [N] citations always map to a real source card.
  const citableChunks = await buildCitableDocuments(relevantChunks, keywordHits);

  // The calendar is prompt context, not a citable source — see
  // formatEventsContext. Multi-day events are still collapsed from their
  // one-row-per-day storage into single dated entries so the prompt reads as
  // one line per event rather than ten identical ones.
  const calendar = groupEventOccurrences(events);

  const systemPrompt = buildSystemPrompt(citableChunks, {
    eventsContext: formatEventsContext(calendar),
    announcementsContext: formatAnnouncementsContext(announcements),
    childrenContext: formatChildrenContext(resolvedChildren),
    childCount: resolvedChildren.length,
    todayString: getTodayString(now),
    schoolInstructions: settings?.custom_system_prompt ?? undefined,
  });

  const sources: ChatSource[] = citableChunks.map((chunk, i) => ({
    document_id: chunk.document_id,
    title: chunk.title,
    // The matching passage, not the full stitched excerpt the model saw —
    // this is what the sidebar highlights inside the document.
    chunk_content: chunk.best_chunk_content,
    similarity: chunk.similarity,
    file_url: chunk.file_url,
    file_type: chunk.file_type,
    chunk_index: chunk.chunk_index,
    source_number: i + 1,
    source_type: "document" as const,
    location: formatChunkLocation(chunk.metadata),
  }));

  const configured =
    settings?.ai_temperature != null ? Number(settings.ai_temperature) : NaN;
  const temperature = Number.isFinite(configured)
    ? Math.min(Math.max(configured, 0), MAX_TEMPERATURE)
    : DEFAULT_TEMPERATURE;

  const modelMessages = await convertToModelMessages(sanitizeMessages(messages));

  return { searchQuery, systemPrompt, sources, relevantChunks, modelMessages, temperature };
}

const MODEL_PART_TYPES = new Set([
  "text",
  "reasoning",
  "tool-invocation",
  "file",
  "source-url",
  "step-start",
]);

/**
 * Strip custom stream parts (data-sources, data-message-id) that the client
 * sends back in conversation history — these are not valid UIMessage part
 * types and cause Gemini to reject the request.
 */
function sanitizeMessages(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((m) => ({
      ...m,
      parts: Array.isArray(m.parts)
        ? m.parts.filter((p) => MODEL_PART_TYPES.has(p.type))
        : [],
    }))
    .filter((m) => m.parts.length > 0);
}
