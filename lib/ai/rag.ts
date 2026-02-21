import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding } from "./embeddings";

export interface RelevantChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown>;
  similarity: number;
  document_title?: string;
  document_file_url?: string;
  document_file_type?: string;
  document_tags?: string[];
  document_category?: string;
  document_folder?: string;
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
    citationRules +=
      "- Do NOT use [Source N] citations or any inline citation markers. The sources will be displayed automatically alongside your answer.\n";
  }

  // Build context sections — placed BEFORE rules so the model sees data first
  const contextParts: string[] = [];

  if (chunks.length > 0) {
    contextParts.push(
      `DOCUMENT CONTEXT:\n${chunks
        .map((chunk, i) => {
          const meta: string[] = [];
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
