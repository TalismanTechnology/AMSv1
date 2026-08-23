import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appendFileSync } from "fs";
const debugLog = (msg: string) => { const line = `[${new Date().toISOString()}] ${msg}\n`; console.log(line.trim()); try { appendFileSync("chat-debug.log", line); } catch {} };
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { google } from "@ai-sdk/google";
import {
  searchDocuments,
  keywordSearchChunks,
  buildCitableDocuments,
  buildSystemPrompt,
  formatChunkLocation,
  type RelevantChunk,
  type KeywordHit,
} from "@/lib/ai/rag";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { assignToCluster } from "@/lib/ai/cluster-assignment";
import { sendClusterAlert } from "@/lib/alerts/cluster-alerts";
import {
  fetchEventsForContext,
  fetchAnnouncementsForContext,
  fetchChildrenForContext,
  formatEventsContext,
  groupEventOccurrences,
  buildEventSources,
  formatAnnouncementsContext,
  formatChildrenContext,
  getTodayString,
} from "@/lib/ai/context";
import type { ChatSource } from "@/lib/types";
import { rewriteQueryWithContext } from "@/lib/ai/rewrite-query";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { messages, sessionId, schoolId } = await request.json();
    debugLog(`REQUEST: sessionId=${sessionId}, schoolId=${schoolId}, messageCount=${messages?.length}`);

    // Verify access: super admins, or approved members of this school
    if (schoolId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role !== "super_admin") {
        const { data: membership } = await supabase
          .from("school_memberships")
          .select("id")
          .eq("user_id", user.id)
          .eq("school_id", schoolId)
          .eq("approved", true)
          .single();

        if (!membership) {
          return new Response(JSON.stringify({ error: "Access denied" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }

    const lastMessage = messages[messages.length - 1];

    // AI SDK v6 sends UIMessages with `parts` array, not a `content` string
    const lastMessageText =
      lastMessage.parts
        ?.filter((p: { type: string }) => p.type === "text")
        .map((p: { text: string }) => p.text)
        .join("") || "";

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
    const children = await fetchChildrenForContext(user.id, schoolId);

    // Rewrite follow-up questions into standalone queries for better RAG
    // search. Children are passed so "and my other kid?" resolves to a grade
    // level the documents are actually organised by.
    const searchQuery = await rewriteQueryWithContext(
      messages,
      lastMessageText,
      children
    );
    if (searchQuery !== lastMessageText) {
      debugLog(`Query rewritten: "${lastMessageText.slice(0, 60)}" → "${searchQuery.slice(0, 60)}"`);
    }

    // Retrieve with both strategies in parallel (non-fatal — continue without
    // sources on failure). Semantic search finds passages that mean the same
    // thing; keyword search finds the reference pages (directories, fee tables)
    // that embeddings consistently under-rank. Recall is deliberately wide —
    // buildCitableDocuments does the narrowing.
    let relevantChunks: RelevantChunk[] = [];
    let keywordHits: KeywordHit[] = [];
    const [vectorResult, keywordResult] = await Promise.allSettled([
      searchDocuments(searchQuery, 40, 0.45, schoolId),
      schoolId
        ? keywordSearchChunks(searchQuery, schoolId)
        : Promise.resolve([] as KeywordHit[]),
    ]);
    if (vectorResult.status === "fulfilled") relevantChunks = vectorResult.value;
    else console.error("RAG search failed (continuing without sources):", vectorResult.reason);
    if (keywordResult.status === "fulfilled") keywordHits = keywordResult.value;
    else console.error("Keyword search failed (continuing without it):", keywordResult.reason);

    // Debug: log RAG results
    if (relevantChunks.length > 0) {
      debugLog(`RAG: ${relevantChunks.length} chunks found. Top: "${relevantChunks[0].document_title}" (sim: ${relevantChunks[0].similarity.toFixed(3)})`);
    } else {
      debugLog(`RAG: 0 chunks found for query: "${lastMessageText.slice(0, 80)}"`);
    }

    // Events, announcements and settings were kicked off before the rewrite
    // (all non-fatal — an empty result just means less context)
    const [eventsResult, announcementsResult, settingsResult] =
      await restOfContext;

    const events =
      eventsResult.status === "fulfilled" ? eventsResult.value : [];
    const announcements =
      announcementsResult.status === "fulfilled"
        ? announcementsResult.value
        : [];
    const settings =
      settingsResult.status === "fulfilled" ? settingsResult.value : null;

    let customPrompt = "";
    let aiTemperature = 0.2;
    if (settings?.custom_system_prompt) {
      customPrompt = "\n\n" + settings.custom_system_prompt;
    }
    if (settings?.ai_temperature != null) {
      aiTemperature = Number(settings.ai_temperature);
    }

    // Log context availability for debugging
    console.log(`[Chat] Context for school ${schoolId}: ${relevantChunks.length} doc chunks, ${events.length} events, ${announcements.length} announcements`);

    // Assemble one citable excerpt per relevant document: its best matching
    // passages plus their neighbours, stitched in document order. The same
    // ordered set is fed to the LLM as [Source 1..N] AND returned to the client
    // as sources[N-1], so inline [N] citations always map to a real source card.
    const citableChunks = await buildCitableDocuments(relevantChunks, keywordHits);

    // Events are citable sources numbered continuously after the documents.
    // The same numbering is used for the [Source N] labels in the prompt AND
    // the source cards returned to the client, so [N] citations always resolve.
    // Multi-day events are stored one row per day; collapse each run into a
    // single dated entry first so a two-week recess is one citable source
    // rather than ten identical ones.
    const calendar = groupEventOccurrences(events);
    const eventStartNumber = citableChunks.length + 1;
    const eventSources = buildEventSources(calendar, eventStartNumber);

    // Build system prompt with documents, events, announcements, and children context
    const systemPrompt =
      buildSystemPrompt(citableChunks, {
        eventsContext: formatEventsContext(calendar, eventStartNumber),
        announcementsContext: formatAnnouncementsContext(announcements),
        childrenContext: formatChildrenContext(children),
        childCount: children.length,
        todayString: getTodayString(),
      }) + customPrompt;

    // Prepare document sources for the response — same set + same numbering as
    // the labels in the system prompt above.
    const sources: ChatSource[] = citableChunks.map((chunk, i) => {
      return {
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
      };
    });

    // Documents (always shown as cards) + the full numbered calendar. Event
    // cards are only surfaced client-side when their [N] is actually cited, so
    // the whole calendar isn't dumped as cards. Sent to the client for citation
    // resolution; the DB save below keeps docs + only the cited events.
    const allSources: ChatSource[] = [...sources, ...eventSources];

    // Save user message in the background (fire and forget)
    if (sessionId) {
      adminSupabase
        .from("chat_messages")
        .insert({
          session_id: sessionId,
          role: "user",
          content: lastMessageText,
          sources: [],
          school_id: schoolId,
        })
        .then(({ error }) => { if (error) console.error("Failed to save user message:", error); });

      // Update session timestamp
      adminSupabase
        .from("chat_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", sessionId)
        .then(({ error }) => { if (error) console.error("Failed to update session timestamp:", error); });

      // Auto-title: if this looks like the first message, set session title
      const userMessages = messages.filter(
        (m: { role: string }) => m.role === "user"
      );
      if (userMessages.length <= 1) {
        const title =
          lastMessageText.slice(0, 60) +
          (lastMessageText.length > 60 ? "..." : "");
        adminSupabase
          .from("chat_sessions")
          .update({ title })
          .eq("id", sessionId)
          .then(({ error }) => { if (error) console.error("Failed to auto-title session:", error); });
      }

      // Analytics event
      adminSupabase
        .from("analytics_events")
        .insert({
          event_type: "question",
          user_id: user.id,
          school_id: schoolId,
          metadata: {
            question: lastMessageText,
            source_count: relevantChunks.length,
            source_document_ids: [
              ...new Set(relevantChunks.map((c) => c.document_id)),
            ],
            session_id: sessionId,
          },
        })
        .then(({ error }) => { if (error) console.error("Failed to save analytics event:", error); });

      // Record unanswered question if no quality sources were found
      // (sources is empty when no chunks pass the 0.55 similarity threshold)
      debugLog(`Unanswered check: sources=${sources.length}, sessionId=${sessionId}, schoolId=${schoolId}`);
      if (sources.length === 0) {
        debugLog(`Recording unanswered question: "${lastMessageText.slice(0, 80)}"`);
        (async () => {
          try {
            const embedding = await generateEmbedding(lastMessageText);
            debugLog(`Embedding generated (${embedding.length} dims), inserting...`);
            const { data: inserted, error: uqError } = await adminSupabase
              .from("unanswered_questions")
              .insert({
                school_id: schoolId,
                question: lastMessageText,
                embedding: JSON.stringify(embedding),
                session_id: sessionId,
                user_id: user.id,
              })
              .select("id")
              .single();
            if (uqError) {
              debugLog(`FAILED to save unanswered question: ${uqError.message}`);
            } else {
              debugLog("Unanswered question saved successfully");
              // Assign to persistent cluster + check alert threshold
              try {
                const { crossedThreshold, clusterId } = await assignToCluster(
                  adminSupabase,
                  inserted.id,
                  embedding,
                  schoolId
                );
                debugLog(`Assigned to cluster ${clusterId}`);
                if (crossedThreshold) {
                  debugLog(`Cluster ${clusterId} crossed alert threshold — sending alerts`);
                  sendClusterAlert(adminSupabase, clusterId, schoolId).catch(
                    (err: unknown) => debugLog(`Alert dispatch failed: ${err}`)
                  );
                }
              } catch (clusterErr) {
                debugLog(`Cluster assignment failed: ${clusterErr}`);
              }
            }
          } catch (err) {
            debugLog(`FAILED to embed unanswered question: ${err}`);
          }
        })();
      }
    }

    // Pre-generate the assistant message ID so we can send it to the client for feedback
    const assistantMessageId = crypto.randomUUID();

    // Sanitize messages: strip custom stream parts (data-sources, data-message-id)
    // that the client sends back in conversation history — these are not valid
    // UIMessage part types and cause Gemini to reject the request.
    const sanitizedMessages = messages
      .map((m: Record<string, unknown>) => ({
        ...m,
        parts: Array.isArray(m.parts)
          ? m.parts.filter((p: { type: string }) =>
              ["text", "reasoning", "tool-invocation", "file", "source-url", "step-start"].includes(p.type)
            )
          : [],
      }))
      .filter((m: { parts: unknown[] }) => m.parts.length > 0);

    // Convert UIMessages to ModelMessages for streamText
    const modelMessages = await convertToModelMessages(sanitizedMessages);

    // Stream the response, save assistant message on finish
    const result = streamText({
      model: google("gemini-2.5-flash"),
      system: systemPrompt,
      messages: modelMessages,
      temperature: aiTemperature,
      maxRetries: 5,
      onFinish: async ({ text }) => {
        if (sessionId && text.trim()) {
          // Strip follow-up markers before saving to DB
          const markerIdx = text.indexOf("---FOLLOW_UPS---");
          const cleanText = markerIdx !== -1 ? text.slice(0, markerIdx).trimEnd() : text;
          // Persist all document sources plus only the events the answer
          // actually cited — the full calendar is scanned but not stored per
          // message. Historical messages then replay exactly the cited cards.
          const citedNumbers = new Set(
            [...cleanText.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))
          );
          const savedSources: ChatSource[] = [
            ...sources,
            ...eventSources.filter(
              (s) => s.source_number != null && citedNumbers.has(s.source_number)
            ),
          ];
          adminSupabase
            .from("chat_messages")
            .insert({
              id: assistantMessageId,
              session_id: sessionId,
              role: "assistant",
              content: cleanText,
              sources: savedSources,
              school_id: schoolId,
            })
            .then(({ error }) => { if (error) console.error("Failed to save assistant message:", error); });
        }
      },
    });

    // Use createUIMessageStream so we can send sources as a data part
    // alongside the streamed text (DefaultChatTransport parses these on the client)
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        if (allSources.length > 0) {
          writer.write({ type: "data-sources", data: allSources });
        }
        writer.write({ type: "data-message-id", data: assistantMessageId });
        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : "";
    const isRateLimit =
      message.includes("Resource exhausted") ||
      message.includes("429") ||
      message.includes("rate");
    return new Response(
      JSON.stringify({
        error: isRateLimit
          ? "The AI is receiving too many requests right now. Please wait a moment and try again."
          : message || "An unexpected error occurred",
      }),
      { status: isRateLimit ? 429 : 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
