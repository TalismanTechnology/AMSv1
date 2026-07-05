import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding } from "./embeddings";

export interface RelevantChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: ChunkMetadata;
  similarity: number;
  document_title?: string;
  document_file_url?: string;
  document_file_type?: string;
  document_tags?: string[];
  document_category?: string;
  document_folder?: string;
}

// Structured metadata stored on each chunk. All fields optional — populated by
// the parser when the source file type carries that structure. The DB column
// is JSONB so older chunks without these fields continue to work.
export interface ChunkMetadata {
  page?: number;          // PDF page number (1-indexed)
  page_end?: number;      // when a chunk spans more than one page
  sheet?: string;         // XLSX sheet name
  slide?: number;         // PPTX slide number (1-indexed)
  section?: string;       // DOCX section heading text
  [key: string]: unknown;
}

// Build the user-facing location label shown beside the source title,
// e.g. "p. 14" or "Sheet: Q3 Sales" or "Slide 5" or "§3 Cafeteria".
// Returns null when there's no structural metadata.
export function formatChunkLocation(
  metadata: ChunkMetadata | null | undefined
): { label: string; page?: number; sheet?: string; slide?: number; section?: string } | null {
  if (!metadata) return null;
  const { page, page_end, sheet, slide, section } = metadata;
  if (typeof page === "number") {
    const label =
      typeof page_end === "number" && page_end > page
        ? `p. ${page}–${page_end}`
        : `p. ${page}`;
    return { label, page };
  }
  if (typeof slide === "number") {
    return { label: `Slide ${slide}`, slide };
  }
  if (typeof sheet === "string" && sheet.trim()) {
    return { label: `Sheet: ${sheet.trim()}`, sheet: sheet.trim() };
  }
  if (typeof section === "string" && section.trim()) {
    return { label: `§ ${section.trim()}`, section: section.trim() };
  }
  return null;
}

export async function searchDocuments(
  query: string,
  matchCount = 8,
  matchThreshold = 0.7,
  schoolId?: string
): Promise<RelevantChunk[]> {
  const supabase = createAdminClient();

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Use the database function for semantic search
  const { data: chunks, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: JSON.stringify(queryEmbedding),
    p_school_id: schoolId,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    console.error("Search error:", error);
    return [];
  }

  if (!chunks || chunks.length === 0) return [];

  // Fetch document metadata for the matched chunks (including tags, category, folder)
  const docIds = [...new Set(chunks.map((c: RelevantChunk) => c.document_id))];
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, file_url, file_type, tags, category:categories(name), folder:folders(name)")
    .in("id", docIds);

  const docInfoMap = new Map(
    docs?.map((d) => [d.id, {
      title: d.title,
      file_url: d.file_url,
      file_type: d.file_type,
      tags: (d.tags as string[]) || [],
      category: (d.category as unknown as { name: string } | null)?.name,
      folder: (d.folder as unknown as { name: string } | null)?.name,
    }]) || []
  );

  return chunks.map((chunk: RelevantChunk) => {
    const info = docInfoMap.get(chunk.document_id);
    return {
      ...chunk,
      document_title: info?.title || "Unknown Document",
      document_file_url: info?.file_url,
      document_file_type: info?.file_type,
      document_tags: info?.tags,
      document_category: info?.category,
      document_folder: info?.folder,
    };
  });
}

export function buildSystemPrompt(
  chunks: RelevantChunk[],
  options?: {
    eventsContext?: string;
    announcementsContext?: string;
    childrenContext?: string;
    todayString?: string;
  }
): string {
  const { eventsContext, announcementsContext, childrenContext, todayString } = options || {};

  const dateInfo = todayString ? `\n${todayString}\n` : "";
  const hasEvents = !!eventsContext;
  const hasAnnouncements = !!announcementsContext;
  const hasAdditionalContext = hasEvents || hasAnnouncements;

  const followUpInstruction = `After your answer, ALWAYS add exactly 3 follow-up questions a parent might ask next. Format them EXACTLY like this (on new lines after your answer):

---FOLLOW_UPS---
1. First follow-up question?
2. Second follow-up question?
3. Third follow-up question?`;

  if (chunks.length === 0 && !hasAdditionalContext) {
    return `You are a helpful school assistant that answers parents' questions using official school documents, events, and announcements.
${dateInfo}
No relevant information was found for this question. Let the parent know that you couldn't find specific information in the school documents, events, or announcements, and suggest they contact the school directly for more details. Be friendly and helpful.

${followUpInstruction}`;
  }

  // Build citation rules based on available context
  let citationRules = "";
  if (chunks.length > 0 || hasEvents || hasAnnouncements) {
    citationRules +=
      "- Answer in your own words. Do NOT quote documents word-for-word. Paraphrase and summarize the information naturally.\n";
  }
  if (chunks.length > 0 || hasEvents) {
    citationRules +=
      "- CITATIONS ARE REQUIRED. Every sentence that contains a fact drawn from DOCUMENT CONTEXT or SCHOOL EVENTS MUST end with an inline citation in square brackets that matches the [Source N] number above — for example [1] or [1][2]. This applies equally to calendar/event facts (dates, times, locations). Do this even when the fact feels obvious. An answer that uses this context but contains zero [N] citations is wrong; rewrite it with citations.\n";
    citationRules +=
      "- Place each citation immediately after the sentence or clause it supports — never bunch citations at the end of the answer. If a single claim is supported by multiple sources, list them adjacently like [1][2]. Do not invent source numbers and do not cite a number that is not shown above.\n";
    citationRules +=
      "- Do NOT add citations to follow-up questions, greetings, or clarifying questions back to the parent.\n";
    citationRules +=
      "- DO NOT fabricate specifics that aren't in DOCUMENT CONTEXT, EVENTS, or ANNOUNCEMENTS. Never invent contact methods (email addresses, phone numbers, portal names, app names), policies, dates, or procedures. If the context only partially answers the question, share what IS in the context (with citations) and say plainly that the rest isn't covered — then suggest contacting the school office. It is better to give a short, honest answer than a longer answer padded with plausible-sounding but unsourced details.\n";
    citationRules +=
      "- Worked example of correct citation behavior:\n  Question: \"When does school start?\"\n  DOCUMENT CONTEXT: [Source 1: \"Daily Schedule\"] First bell rings at 8:25 AM. Classes begin at 8:30 AM.\n  Good answer: \"Classes begin at 8:30 AM, with the first bell at 8:25 AM [1].\"\n  Bad answer (no citation): \"Classes begin at 8:30 AM, with the first bell at 8:25 AM.\"\n  Bad answer (fabrication): \"Classes begin at 8:30 AM [1]. The school day ends at 3:15 PM.\" (the second sentence isn't in DOCUMENT CONTEXT — drop it or say it isn't covered)\n";
  }

  // Build context sections — placed BEFORE rules so the model sees data first
  const contextParts: string[] = [];

  if (chunks.length > 0) {
    contextParts.push(
      `DOCUMENT CONTEXT:\n${chunks
        .map((chunk, i) => {
          const meta: string[] = [];
          const loc = formatChunkLocation(chunk.metadata);
          if (loc) meta.push(loc.label);
          if (chunk.document_tags?.length) meta.push(`Tags: ${chunk.document_tags.join(", ")}`);
          if (chunk.document_category) meta.push(`Category: ${chunk.document_category}`);
          if (chunk.document_folder) meta.push(`Folder: ${chunk.document_folder}`);
          const metaStr = meta.length > 0 ? ` | ${meta.join(" | ")}` : "";
          return `[Source ${i + 1}: "${chunk.document_title}"${metaStr}]\n${chunk.content}`;
        })
        .join("\n\n---\n\n")}`
    );
  }

  if (eventsContext) contextParts.push(eventsContext);
  if (announcementsContext) contextParts.push(announcementsContext);
  if (childrenContext) contextParts.push(childrenContext);

  const contextBlock = contextParts.join("\n\n");

  // When no documents match but events/announcements exist, tell the model explicitly
  const noDocsNote =
    chunks.length === 0 && hasAdditionalContext
      ? "- No matching documents were found, but school events and/or announcements below may contain the answer. Use them.\n"
      : "";

  return `You are a helpful school assistant that answers parents' questions using official school documents, events, and announcements.
${dateInfo}
${contextBlock}

IMPORTANT RULES:
- Answer based on ALL the provided context above (documents, events, and announcements)
${noDocsNote}- If the context doesn't contain enough information to answer, say so honestly
${citationRules}- Be concise and parent-friendly in your responses
- If a question is not related to school, politely redirect

DIVISION/GRADE-LEVEL CLARIFICATION:
- Documents may come from different school divisions (e.g., elementary, middle school, high school). Pay attention to document tags, categories, folders, and titles to identify which division a document applies to.
- If the retrieved documents contain CONFLICTING information that appears to apply to different divisions or grade levels, ask the parent a brief clarifying question before answering (e.g., "I found different policies for elementary and middle school. Which division are you asking about?").
- If the parent's children are listed above, use their grade levels to determine the most relevant division. If the parent has only one child, assume the question is about that child's division unless they say otherwise.
- If the parent has children in multiple divisions and the answer differs between them, mention the differences or ask which child they're asking about.
- Do NOT ask for clarification when the answer is the same across all divisions, when only one division's documents were found, or when the question is clearly unambiguous.
- ${followUpInstruction}`;
}
