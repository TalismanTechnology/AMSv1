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
  buildSystemPrompt,
  type RelevantChunk,
} from "@/lib/ai/rag";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { assignToCluster } from "@/lib/ai/cluster-assignment";
import { sendClusterAlert } from "@/lib/alerts/cluster-alerts";
import {
  fetchEventsForContext,
  fetchAnnouncementsForContext,
  fetchChildrenForContext,
  formatEventsContext,
  formatAnnouncementsContext,
  formatChildrenContext,
  getTodayString,
} from "@/lib/ai/context";

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
    const lastMessage = messages[messages.length - 1];

    // AI SDK v6 sends UIMessages with `parts` array, not a `content` string
    const lastMessageText =
      lastMessage.parts
        ?.filter((p: { type: string }) => p.type === "text")
        .map((p: { text: string }) => p.text)
        .join("") || "";

    // Search for relevant document chunks (non-fatal — continue without sources on failure)
    let relevantChunks: RelevantChunk[] = [];
    try {
      relevantChunks = await searchDocuments(lastMessageText, 8, 0.5, schoolId);
    } catch (error) {
      console.error("RAG search failed (continuing without sources):", error);
    }

    // Debug: log RAG results
    if (relevantChunks.length > 0) {
      debugLog(`RAG: ${relevantChunks.length} chunks found. Top: "${relevantChunks[0].document_title}" (sim: ${relevantChunks[0].similarity.toFixed(3)})`);
    } else {
      debugLog(`RAG: 0 chunks found for query: "${lastMessageText.slice(0, 80)}"`);
    }

    // Fetch events, announcements, children, and settings in parallel (all non-fatal)
    const adminSupabase = createAdminClient();
    const [eventsResult, announcementsResult, settingsResult, childrenResult] =
      await Promise.allSettled([
        fetchEventsForContext(schoolId),
        fetchAnnouncementsForContext(schoolId),
        adminSupabase
          .from("settings")
          .select("custom_system_prompt, ai_temperature")
          .eq("school_id", schoolId)
          .single()
          .then((r) => r.data),
        fetchChildrenForContext(user.id, schoolId),
      ]);

    const events =
      eventsResult.status === "fulfilled" ? eventsResult.value : [];
    const announcements =
      announcementsResult.status === "fulfilled"
        ? announcementsResult.value
        : [];
    const settings =
      settingsResult.status === "fulfilled" ? settingsResult.value : null;
    const children =
      childrenResult.status === "fulfilled" ? childrenResult.value : [];

    let customPrompt = "";
    let aiTemperature = 0.7;
    if (settings?.custom_system_prompt) {
      customPrompt = "\n\n" + settings.custom_system_prompt;
    }
    if (settings?.ai_temperature != null) {
      aiTemperature = Number(settings.ai_temperature);
    }

    // Log context availability for debugging
    console.log(`[Chat] Context for school ${schoolId}: ${relevantChunks.length} doc chunks, ${events.length} events, ${announcements.length} announcements`);

    // Build system prompt with documents, events, announcements, and children context
    const systemPrompt =
      buildSystemPrompt(relevantChunks, {
        eventsContext: formatEventsContext(events),
        announcementsContext: formatAnnouncementsContext(announcements),
        childrenContext: formatChildrenContext(children),
        todayString: getTodayString(),
      }) + customPrompt;

    // Prepare sources for the response — only show document sources that
    // were actually found via RAG. Deduplicate by document (keep highest
    // similarity chunk per document) and cap at 3.
    const sources: {
      document_id: string;
      title: string;
      chunk_content: string;
      similarity: number;
      file_url?: string;
      file_type?: string;
      chunk_index: number;
      source_number: number;
      source_type: "document";
    }[] = [];

    if (relevantChunks.length > 0) {
      // Deduplicate: keep the highest-similarity chunk per document
      const bestByDoc = new Map<string, (typeof relevantChunks)[number]>();
      for (const chunk of relevantChunks) {
        const existing = bestByDoc.get(chunk.document_id);
        if (!existing || chunk.similarity > existing.similarity) {
          bestByDoc.set(chunk.document_id, chunk);
        }
      }

      // Only show sources that are genuinely relevant (similarity >= 0.65),
      // sort by similarity descending, cap at 3
      const uniqueChunks = [...bestByDoc.values()]
        .filter((c) => c.similarity >= 0.65)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3);

      for (let i = 0; i < uniqueChunks.length; i++) {
        const chunk = uniqueChunks[i];
        let excerpt = chunk.content;
        if (excerpt.length > 200) {
          const truncated = excerpt.slice(0, 200);
          const lastPeriod = truncated.lastIndexOf(". ");
          excerpt = lastPeriod > 80 ? truncated.slice(0, lastPeriod + 1) : truncated.replace(/\s+\S*$/, "") + "…";
        }
        sources.push({
          document_id: chunk.document_id,
          title: chunk.document_title || "Unknown",
          chunk_content: excerpt,
          similarity: chunk.similarity,
          file_url: chunk.document_file_url,
          file_type: chunk.document_file_type,
          chunk_index: chunk.chunk_index,
          source_number: i + 1,
          source_type: "document" as const,
        });
      }
    }

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
      // (sources is empty when no chunks pass the 0.65 similarity threshold)
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
      model: google("gemini-2.0-flash"),
      system: systemPrompt,
      messages: modelMessages,
      temperature: aiTemperature,
      maxRetries: 5,
      onFinish: async ({ text }) => {
        if (sessionId && text.trim()) {
          // Strip follow-up markers before saving to DB
          const markerIdx = text.indexOf("---FOLLOW_UPS---");
          const cleanText = markerIdx !== -1 ? text.slice(0, markerIdx).trimEnd() : text;
          adminSupabase
            .from("chat_messages")
            .insert({
              id: assistantMessageId,
              session_id: sessionId,
              role: "assistant",
              content: cleanText,
              sources,
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
        if (sources.length > 0) {
          writer.write({ type: "data-sources", data: sources });
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
