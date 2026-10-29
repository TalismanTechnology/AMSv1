import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  matchDocumentChunks,
  attachDocumentInfo,
  keywordSearchChunks,
  fetchPassageChunks,
  assemblePassages,
  formatChunkLocation,
  type RelevantChunk,
  type KeywordHit,
} from "@/lib/ai/rag";
import {
  fetchEventsForContext,
  fetchAnnouncementsForContext,
  formatEventLine,
  formatEventsContext,
  groupEventOccurrences,
  formatAnnouncementsContext,
  formatChildrenContext,
  getTodayString,
  type ChildContext,
} from "@/lib/ai/context";
import { rewriteQueryWithContext } from "@/lib/ai/rewrite-query";
import { reportAiFailure } from "@/lib/alerts/ai-failure-alert";
import {
  redactChildNames,
  redactChildNamesInMessages,
  splitGraduatedChildren,
} from "@/lib/ai/child-privacy";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { selectPassages } from "@/lib/ai/source-selection";
import { loadResolvedConflicts } from "@/lib/conflicts/store";
import {
  chunkKey,
  clarificationPassages,
  conflictContext,
  planConflictResolutions,
  withoutDropped,
} from "@/lib/conflicts/resolutions";
import { eventSource } from "@/lib/ai/citations";
import type { ChatSource } from "@/lib/types";
import { TEXT_MODEL_ID } from "@/lib/ai/models";

/** The model that writes parent-facing answers. Shared with the eval harness. */
export const CHAT_MODEL_ID = TEXT_MODEL_ID;

// Grounded Q&A wants near-deterministic output; a school's configured
// temperature is honoured but never allowed above this.
const DEFAULT_TEMPERATURE = 0.2;
const MAX_TEMPERATURE = 0.5;

export interface ChatTurn {
  searchQuery: string;
  systemPrompt: string;
  /** Citable passages, in [N] order — sources[N-1] is what [N] opens. */
  sources: ChatSource[];
  /**
   * Every calendar entry, numbered after the passages (sources.length + 1…).
   * Only the ones an answer cites are sent to the parent — see
   * citedEventSources.
   */
  eventSources: ChatSource[];
  /** Raw vector hits, for analytics. */
  relevantChunks: RelevantChunk[];
  modelMessages: ModelMessage[];
  temperature: number;
  /**
   * The parent's question as sent to the AI provider — children's names
   * replaced by grade labels. Use this, not the raw text, for any other
   * provider call (e.g. embedding an unanswered question).
   */
  providerQuestion: string;
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
  // rewrite, so the rest stay in flight through retrieval. These are
  // school-wide reads, so they must not start before the route's access
  // checks — the route only calls this once those pass.
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
  // Graduated children are left out of the context (the assistant shouldn't
  // answer about them as 12th graders) but their names are still redacted.
  const { current: resolvedChildren, redactable } = splitGraduatedChildren(await children);

  // Children's names never leave for the AI provider: every name in the
  // conversation becomes that child's grade label before anything below
  // (rewrite, embedding, answer model) sees it. See lib/ai/child-privacy.ts.
  const providerMessages = redactChildNamesInMessages(messages, redactable);
  const providerQuestion = redactChildNames(lastMessageText, redactable);

  // Rewrite follow-up questions into standalone queries for better RAG
  // search. Children are passed so "and my other kid?" resolves to a grade
  // level the documents are actually organised by. First questions skip the
  // model call entirely (see shouldRewriteQuery).
  const searchQuery = await rewriteQueryWithContext(
    providerMessages,
    providerQuestion,
    resolvedChildren
  );

  // Retrieve with both strategies in parallel (non-fatal — continue without
  // sources on failure). Semantic search finds passages that mean the same
  // thing; keyword search finds the reference pages (directories, fee tables)
  // that embeddings consistently under-rank. Recall is deliberately wide —
  // assemblePassages does the narrowing.
  let matchedChunks: RelevantChunk[] = [];
  let keywordHits: KeywordHit[] = [];
  const [vectorResult, keywordResult] = await Promise.allSettled([
    matchDocumentChunks(searchQuery, 40, 0.45, schoolId),
    keywordSearchChunks(searchQuery, schoolId),
  ]);
  if (vectorResult.status === "fulfilled") matchedChunks = vectorResult.value;
  else reportAiFailure(vectorResult.reason, { source: "chat.retrieval-embedding", schoolId });
  if (keywordResult.status === "fulfilled") keywordHits = keywordResult.value;
  else console.error("Keyword search failed (continuing without it):", keywordResult.reason);

  // Document info (titles, divisions…) and the passage text around each hit
  // both depend only on the hits, so fetch them together. Losing the document
  // info drops the vector hits, exactly as a failed searchDocuments would.
  // Admins' rulings on conflicting documents (lib/conflicts) ride along; that
  // read never throws and is empty until migration 046 is applied.
  const [infoResult, knownChunks, resolvedConflicts] = await Promise.all([
    attachDocumentInfo(matchedChunks).then(
      (chunks) => ({ ok: true as const, chunks }),
      (reason: unknown) => ({ ok: false as const, reason })
    ),
    fetchPassageChunks(matchedChunks, keywordHits),
    loadResolvedConflicts(adminSupabase, schoolId, [
      ...matchedChunks.map((c) => c.document_id),
      ...keywordHits.map((h) => h.document_id),
    ]),
  ]);
  let relevantChunks: RelevantChunk[] = [];
  if (infoResult.ok) relevantChunks = infoResult.chunks;
  else console.error("RAG search failed (continuing without sources):", infoResult.reason);

  // A resolved conflict with a side in reach takes the losing side's chunks
  // (both sides', for a written answer) out of the passages — matched by
  // chunk id or by the statement, so rulings survive re-processing. With no
  // resolved conflicts this changes nothing.
  const conflictPlan = planConflictResolutions(
    resolvedConflicts,
    conflictContext(knownChunks, matchedChunks)
  );
  if (conflictPlan.drop.size > 0) {
    relevantChunks = withoutDropped(relevantChunks, conflictPlan.drop);
    keywordHits = withoutDropped(keywordHits, conflictPlan.drop);
    for (const key of conflictPlan.drop) knownChunks.delete(key);
  }

  // Events, announcements and settings were kicked off before the rewrite
  // (all non-fatal — an empty result just means less context)
  const [eventsResult, announcementsResult, settingsResult] = await restOfContext;
  const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
  const announcements =
    announcementsResult.status === "fulfilled" ? announcementsResult.value : [];
  const settings = settingsResult.status === "fulfilled" ? settingsResult.value : null;

  // Assemble citable passages: each document's best matching chunks plus their
  // neighbours, cut into short runs that each get their own number. The same
  // ordered set is fed to the LLM as [Source 1..N] AND returned to the client
  // as sources[N-1], so every inline [N] opens the passage the fact came from.
  // selectPassages then drops the weak and the duplicate, so the model isn't
  // handed near-copies it will cite side by side.
  const passages = selectPassages(assemblePassages(relevantChunks, keywordHits, knownChunks));
  // Then the admin's ruling itself, numbered after the documents: the chosen
  // statement when its chunk didn't make the cut, and any note the admin
  // wrote. Only text from the conflict rows — never model output.
  if (conflictPlan.relevant.length > 0) {
    const similarityByKey = new Map(
      matchedChunks.map((c) => [chunkKey(c.document_id, c.chunk_index), c.similarity])
    );
    passages.push(...clarificationPassages(conflictPlan.relevant, passages, similarityByKey));
  }

  // Calendar entries are citable too, numbered after the passages. Multi-day
  // events are collapsed from their one-row-per-day storage into single dated
  // entries first, so a recess is one number rather than ten.
  const calendar = groupEventOccurrences(events);
  const firstEventNumber = passages.length + 1;
  const eventSources = calendar.map((entry, i) =>
    eventSource(entry, firstEventNumber + i, formatEventLine(entry))
  );

  const systemPrompt = buildSystemPrompt(passages, {
    eventsContext: formatEventsContext(calendar, firstEventNumber),
    announcementsContext: formatAnnouncementsContext(announcements),
    childrenContext: formatChildrenContext(resolvedChildren),
    childCount: resolvedChildren.length,
    todayString: getTodayString(now),
    schoolInstructions: settings?.custom_system_prompt ?? undefined,
    hasHistory: messages.length > 1,
  });

  const sources: ChatSource[] = passages.map((passage, i) => ({
    document_id: passage.document_id,
    title: passage.title,
    // The passage exactly as the model saw it under [N].
    chunk_content: passage.content,
    similarity: passage.similarity,
    file_url: passage.file_url,
    file_type: passage.file_type,
    source_url: passage.source_url,
    chunk_index: passage.chunk_index,
    source_number: i + 1,
    // An admin's note has no document behind it: it renders as "School
    // clarification", without a link.
    source_type: passage.clarification === "note" ? ("clarification" as const) : ("document" as const),
    location: passage.clarification === "note" ? null : formatChunkLocation(passage.metadata),
  }));

  const configured =
    settings?.ai_temperature != null ? Number(settings.ai_temperature) : NaN;
  const temperature = Number.isFinite(configured)
    ? Math.min(Math.max(configured, 0), MAX_TEMPERATURE)
    : DEFAULT_TEMPERATURE;

  const modelMessages = await convertToModelMessages(sanitizeMessages(providerMessages));

  return {
    searchQuery,
    systemPrompt,
    sources,
    eventSources,
    relevantChunks,
    modelMessages,
    temperature,
    providerQuestion,
  };
}

const MODEL_PART_TYPES = new Set([
  "text",
  "reasoning",
  "tool-invocation",
  "file",
  "source-url",
  "step-start",
]);

// Inline citations, current ([3]) and legacy ([Source 3]) forms.
const CITATION_MARKER_RE = /\s?\[(?:Source\s+)?\d+\]/gi;

/**
 * Remove [N] citations from a past answer. Sources are renumbered every turn,
 * so a [2] carried over from history refers to last turn's source 2 — a model
 * that copies it links the fact to whatever document is [2] now.
 */
export function stripCitationMarkers(text: string): string {
  return text.replace(CITATION_MARKER_RE, "");
}

/**
 * Strip custom stream parts (data-sources, data-message-id) that the client
 * sends back in conversation history — these are not valid UIMessage part
 * types and cause Gemini to reject the request — and stale citation numbers
 * from earlier answers.
 */
export function sanitizeMessages(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((m) => ({
      ...m,
      parts: Array.isArray(m.parts)
        ? m.parts
            .filter((p) => MODEL_PART_TYPES.has(p.type))
            .map((p) =>
              m.role === "assistant" && p.type === "text"
                ? { ...p, text: stripCitationMarkers(p.text) }
                : p
            )
        : [],
    }))
    .filter((m) => m.parts.length > 0);
}
