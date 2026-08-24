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
  email_subject?: string; // EML subject line
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
  const emailSubject = metadata.email_subject;
  if (typeof emailSubject === "string" && emailSubject.trim()) {
    const subject = emailSubject.trim();
    // Subjects run long; a citation chip has to stay readable.
    const trimmed = subject.length > 60 ? `${subject.slice(0, 57)}…` : subject;
    return { label: `Email: ${trimmed}`, section: subject };
  }
  return null;
}

/** A chunk surfaced by full-text search rather than by embedding similarity. */
export interface KeywordHit {
  document_id: string;
  chunk_index: number;
  content: string;
  rank: number;
}

// Question words and filler that would either match everything or nothing.
const KEYWORD_STOPWORDS = new Set([
  "a", "about", "am", "an", "and", "any", "are", "at", "be", "by", "can", "could",
  "do", "does", "did", "for", "from", "get", "has", "have", "how", "i", "if", "in",
  "is", "it", "its", "know", "me", "my", "need", "of", "on", "or", "our", "please",
  "see", "should", "so", "tell", "that", "the", "their", "there", "they", "this",
  "to", "up", "want", "was", "we", "what", "when", "where", "which", "who", "whom",
  "why", "will", "with", "would", "you", "your",
]);

function extractKeywords(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !KEYWORD_STOPWORDS.has(w))
    ),
  ];
}

/**
 * Full-text search over chunk content, complementing the embedding search.
 *
 * Embeddings under-rank reference material — a phone directory or a fee table
 * is mostly proper nouns and digits, so it matches a conversational question
 * weakly no matter how squarely it answers it. Literal term matching finds
 * exactly those pages.
 *
 * Runs all terms together (precise) AND each term on its own, then interleaves
 * the per-term results. The single-term passes matter most: in "what's the
 * phone number for the nurse?", the rare word is "nurse", but a whole-phrase
 * search ranks chatty passages about phones above the one line that pairs the
 * nurse with her extension. Giving every term its own slate guarantees the
 * distinctive one is represented.
 */
const MAX_KEYWORD_TERMS = 6;
const HITS_PER_TERM = 8;

export async function keywordSearchChunks(
  query: string,
  schoolId: string,
  limit = 30
): Promise<KeywordHit[]> {
  const keywords = extractKeywords(query).slice(0, MAX_KEYWORD_TERMS);
  if (keywords.length === 0) return [];

  const supabase = createAdminClient();

  const run = async (tsQuery: string, rowLimit: number): Promise<KeywordHit[]> => {
    const { data, error } = await supabase.rpc("search_document_chunks", {
      p_school_id: schoolId,
      p_query: tsQuery,
      p_limit: rowLimit,
    });
    if (error) {
      console.error(`Keyword search error for "${tsQuery}":`, error);
      return [];
    }
    return (data || []) as KeywordHit[];
  };

  const [allTerms, ...perTerm] = await Promise.all([
    keywords.length > 1
      ? run(keywords.join(" "), limit)
      : Promise.resolve([] as KeywordHit[]),
    ...keywords.map((k) => run(k, HITS_PER_TERM)),
  ]);

  // Chunks matching every term come first, then one hit per term in turn so no
  // single common word ("school") monopolises the budget.
  const merged: KeywordHit[] = [];
  const seen = new Set<string>();
  const take = (hit: KeywordHit) => {
    const key = `${hit.document_id}:${hit.chunk_index}`;
    if (seen.has(key) || merged.length >= limit) return;
    seen.add(key);
    merged.push(hit);
  };

  allTerms.forEach(take);
  for (let round = 0; round < HITS_PER_TERM; round++) {
    for (const hits of perTerm) {
      if (hits[round]) take(hits[round]);
    }
  }

  return merged;
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

/**
 * One document's contribution to the prompt: several stitched-together excerpts
 * presented under a single [Source N]. Grouping at the document level (rather
 * than one source per chunk) lets a long handbook contribute several passages
 * without producing a stack of identically-titled source cards.
 */
export interface CitableDocument {
  document_id: string;
  title: string;
  content: string; // stitched excerpts, in document order — for the prompt
  // The single best-matching chunk, verbatim. The source sidebar locates this
  // inside the full document to highlight it, which the stitched excerpt (gap
  // markers, trimmed seams) would defeat — and it keeps the payload we stream
  // and store per message small.
  best_chunk_content: string;
  similarity: number; // best matching chunk's score
  chunk_index: number; // best matching chunk, for the source card
  metadata: ChunkMetadata;
  file_url?: string;
  file_type?: string;
  tags?: string[];
  category?: string;
  folder?: string;
}

// How much of each document reaches the model. Deliberately generous: a missed
// answer that was sitting in the handbook costs far more than a longer prompt.
const MAX_CITED_DOCUMENTS = 5;
const MAX_VECTOR_SEEDS_PER_DOCUMENT = 5;
const MAX_KEYWORD_SEEDS_PER_DOCUMENT = 4;
const MAX_CHUNKS_PER_DOCUMENT = 12;
// A document must have at least one genuinely similar chunk to be cited at all.
// Keyword hits then decide *which* of its passages are shown, but can't promote
// an unrelated document — that would also mask genuinely unanswered questions.
const MIN_CITABLE_SIMILARITY = 0.5;
// Chunks are split with overlap, so neighbours repeat text at the seam.
const MAX_SEAM_OVERLAP = 400;

/**
 * Join consecutive excerpts, removing the duplicated text where two adjacent
 * chunks overlap, and marking real gaps so the model doesn't read skipped
 * material as continuous prose.
 */
function stitchChunks(ordered: { content: string; chunk_index: number }[]): string {
  let out = "";
  let prevIndex: number | null = null;

  for (const chunk of ordered) {
    if (out === "") {
      out = chunk.content;
      prevIndex = chunk.chunk_index;
      continue;
    }

    if (prevIndex != null && chunk.chunk_index > prevIndex + 1) {
      out += "\n[...]\n" + chunk.content;
      prevIndex = chunk.chunk_index;
      continue;
    }

    // Adjacent: drop the longest suffix of what we have that repeats as a
    // prefix of the next chunk.
    const window = Math.min(MAX_SEAM_OVERLAP, out.length, chunk.content.length);
    let overlap = 0;
    for (let len = window; len > 20; len--) {
      if (out.endsWith(chunk.content.slice(0, len))) {
        overlap = len;
        break;
      }
    }
    out += chunk.content.slice(overlap);
    prevIndex = chunk.chunk_index;
  }

  return out;
}

/**
 * Turn ranked chunk hits into per-document citable excerpts.
 *
 * Semantic ranking alone is unreliable for lookup-style facts: a phone
 * directory page matches "what's the nurse's number?" weakly because it is
 * mostly names and digits. So each document's best chunks are expanded to
 * include their immediate neighbours, which is where the specific detail
 * usually sits relative to the passage that matched.
 */
export async function buildCitableDocuments(
  chunks: RelevantChunk[],
  keywordHits: KeywordHit[] = []
): Promise<CitableDocument[]> {
  const relevant = chunks.filter((c) => c.similarity >= MIN_CITABLE_SIMILARITY);
  if (relevant.length === 0) return [];

  // Group hits by document, strongest document first.
  const byDocument = new Map<string, RelevantChunk[]>();
  for (const chunk of relevant) {
    const existing = byDocument.get(chunk.document_id);
    if (existing) existing.push(chunk);
    else byDocument.set(chunk.document_id, [chunk]);
  }

  const documents = [...byDocument.entries()]
    .map(([documentId, hits]) => ({
      documentId,
      hits: [...hits].sort((a, b) => b.similarity - a.similarity),
    }))
    .sort((a, b) => b.hits[0].similarity - a.hits[0].similarity)
    .slice(0, MAX_CITED_DOCUMENTS);

  const keywordsByDocument = new Map<string, KeywordHit[]>();
  for (const hit of keywordHits) {
    const existing = keywordsByDocument.get(hit.document_id);
    if (existing) existing.push(hit);
    else keywordsByDocument.set(hit.document_id, [hit]);
  }

  // Decide which chunk indexes each document contributes: its best semantic
  // matches, its best literal matches, and the chunk either side of each — the
  // specific detail (a number, a deadline) often sits just past the boundary of
  // the passage that matched.
  const wanted = documents.map(({ documentId, hits }) => {
    const vectorSeeds = hits
      .slice(0, MAX_VECTOR_SEEDS_PER_DOCUMENT)
      .map((h) => h.chunk_index);
    const keywordSeeds = (keywordsByDocument.get(documentId) || [])
      .slice(0, MAX_KEYWORD_SEEDS_PER_DOCUMENT)
      .map((h) => h.chunk_index);

    // Alternate the two rankings so neither strategy monopolises the budget,
    // and pull each seed's neighbours in with it — otherwise the cap is spent
    // entirely on seeds and the adjacent detail is never fetched.
    const seeds: number[] = [];
    for (let i = 0; i < Math.max(vectorSeeds.length, keywordSeeds.length); i++) {
      if (vectorSeeds[i] != null) seeds.push(vectorSeeds[i]);
      if (keywordSeeds[i] != null) seeds.push(keywordSeeds[i]);
    }

    const indexes = new Set<number>();
    for (const seed of seeds) {
      if (indexes.size >= MAX_CHUNKS_PER_DOCUMENT) break;
      for (const index of [seed, seed - 1, seed + 1]) {
        if (index >= 0 && indexes.size < MAX_CHUNKS_PER_DOCUMENT) indexes.add(index);
      }
    }
    return { documentId, hits, indexes };
  });

  // Fetch the text we don't already have — one round trip for all documents;
  // the (document, index) pairs are matched up after.
  const known = new Map<string, string>();
  for (const chunk of relevant) {
    known.set(`${chunk.document_id}:${chunk.chunk_index}`, chunk.content);
  }
  for (const hit of keywordHits) {
    known.set(`${hit.document_id}:${hit.chunk_index}`, hit.content);
  }
  const missingIndexes = new Set<number>();
  for (const { documentId, indexes } of wanted) {
    for (const index of indexes) {
      if (!known.has(`${documentId}:${index}`)) missingIndexes.add(index);
    }
  }

  if (missingIndexes.size > 0) {
    const supabase = createAdminClient();
    const { data: neighbours, error } = await supabase
      .from("document_chunks")
      .select("document_id, chunk_index, content")
      .in("document_id", wanted.map((w) => w.documentId))
      .in("chunk_index", [...missingIndexes]);

    if (error) {
      // Non-fatal: fall back to the matched chunks alone.
      console.error("Failed to fetch neighbouring chunks:", error);
    } else {
      for (const n of neighbours || []) {
        known.set(`${n.document_id}:${n.chunk_index}`, n.content);
      }
    }
  }

  return wanted.map(({ documentId, hits, indexes }) => {
    const best = hits[0];
    const ordered = [...indexes]
      .sort((a, b) => a - b)
      .map((chunk_index) => ({
        chunk_index,
        content: known.get(`${documentId}:${chunk_index}`) || "",
      }))
      .filter((c) => c.content !== "");

    return {
      document_id: documentId,
      title: best.document_title || "Unknown Document",
      content: stitchChunks(ordered),
      best_chunk_content: best.content,
      similarity: best.similarity,
      chunk_index: best.chunk_index,
      metadata: best.metadata,
      file_url: best.document_file_url,
      file_type: best.document_file_type,
      tags: best.document_tags,
      category: best.document_category,
      folder: best.document_folder,
    };
  });
}

export function buildSystemPrompt(
  chunks: CitableDocument[],
  options?: {
    eventsContext?: string;
    announcementsContext?: string;
    childrenContext?: string;
    /** How many children the parent has — drives the disambiguation rules. */
    childCount?: number;
    todayString?: string;
  }
): string {
  const { eventsContext, announcementsContext, childrenContext, childCount, todayString } =
    options || {};

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
  if (chunks.length > 0) {
    citationRules +=
      "- CITATIONS ARE REQUIRED FOR DOCUMENTS. Every sentence that contains a fact drawn from DOCUMENT CONTEXT MUST end with an inline citation in square brackets that matches the [Source N] number above — for example [1] or [1][2]. Do this even when the fact feels obvious. An answer that uses DOCUMENT CONTEXT but contains zero [N] citations is wrong; rewrite it with citations.\n";
    citationRules +=
      "- Place each citation immediately after the sentence or clause it supports — never bunch citations at the end of the answer. If a single claim is supported by multiple sources, list them adjacently like [1][2]. Do not invent source numbers and do not cite a number that is not shown above.\n";
    citationRules +=
      "- Do NOT add citations to follow-up questions, greetings, or clarifying questions back to the parent.\n";
  }
  if (hasEvents) {
    citationRules +=
      "- NEVER cite SCHOOL EVENTS. Calendar facts (dates, times, locations of events) carry NO citation at all — write them as plain sentences with no [N] anywhere. The calendar entries are not numbered and have no source card, so any bracketed number attached to a calendar fact is broken. If a sentence mixes a document fact with a calendar fact, cite only the document part.\n";
  }
  if (chunks.length > 0 || hasEvents) {
    citationRules +=
      "- DO NOT fabricate specifics that aren't in DOCUMENT CONTEXT, EVENTS, or ANNOUNCEMENTS. Never invent contact methods (email addresses, phone numbers, portal names, app names), policies, dates, or procedures. If the context only partially answers the question, share what IS in the context (with citations where the fact came from a document) and say plainly that the rest isn't covered — then suggest contacting the school office. It is better to give a short, honest answer than a longer answer padded with plausible-sounding but unsourced details.\n";
  }
  if (chunks.length > 0) {
    citationRules +=
      "- Worked example of correct citation behavior:\n  Question: \"When does school start?\"\n  DOCUMENT CONTEXT: [Source 1: \"Daily Schedule\"] First bell rings at 8:25 AM. Classes begin at 8:30 AM.\n  Good answer: \"Classes begin at 8:30 AM, with the first bell at 8:25 AM [1].\"\n  Bad answer (no citation): \"Classes begin at 8:30 AM, with the first bell at 8:25 AM.\"\n  Bad answer (fabrication): \"Classes begin at 8:30 AM [1]. The school day ends at 3:15 PM.\" (the second sentence isn't in DOCUMENT CONTEXT — drop it or say it isn't covered)\n";
  }
  if (hasEvents) {
    citationRules +=
      "- Worked example for calendar facts:\n  Question: \"When is winter break?\"\n  SCHOOL EVENTS: \"Winter Break\" from 2025-12-22 through 2026-01-02 (holiday)\n  Good answer: \"Winter break runs from December 22 through January 2, with classes resuming January 5.\"\n  Bad answer (citing the calendar): \"Winter break runs from December 22 through January 2 [16][17][18].\"\n";
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
          if (chunk.tags?.length) meta.push(`Tags: ${chunk.tags.join(", ")}`);
          if (chunk.category) meta.push(`Category: ${chunk.category}`);
          if (chunk.folder) meta.push(`Folder: ${chunk.folder}`);
          const metaStr = meta.length > 0 ? ` | ${meta.join(" | ")}` : "";
          return `[Source ${i + 1}: "${chunk.title}"${metaStr}]\n${chunk.content}`;
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

  // With more than one child, the failure mode isn't missing information — it's
  // attributing one child's answer to the other, or inventing a gender for a
  // child the school record describes only by name and grade.
  const multiChildRules =
    childrenContext && (childCount ?? 0) > 1
      ? `
MULTIPLE CHILDREN — KEEP THEM STRAIGHT:
- This parent has ${childCount} children, listed above. Treat them as distinct people and always refer to each one BY NAME. Never write "your child" when you mean a specific one, and never merge two children's answers into one statement.
- You do NOT know any child's gender. Never use "he", "she", "his", "her", "son", or "daughter" for them — use the child's name, or "they/their". This holds even if the parent used a gendered word: they know which child they mean, you do not.
- If the parent names a child, or names a grade or division, answer for that child only.
- If the parent says "my son", "my daughter", or "my child" without naming one, do not guess. If the answer is the same for every child, give it once. If it differs, give each child's answer labelled by name.
- Only ask which child they mean when the answer genuinely differs AND you cannot simply answer for each of them.
- Carry the child forward across turns: a follow-up like "what about the other one?" refers to the child you did NOT just answer about — name them explicitly in your reply so the parent can see which one you mean.
`
      : "";

  return `You are a helpful school assistant that answers parents' questions using official school documents, events, and announcements.
${dateInfo}
${contextBlock}
${multiChildRules}
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
