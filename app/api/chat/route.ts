import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { appendFileSync } from "fs";
const debugLog = (msg: string) => { const line = `[${new Date().toISOString()}] ${msg}\n`; console.log(line.trim()); try { appendFileSync("chat-debug.log", line); } catch {} };
import {
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { google } from "@ai-sdk/google";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { assignToCluster } from "@/lib/ai/cluster-assignment";
import { sendClusterAlert } from "@/lib/alerts/cluster-alerts";
import { fetchChildrenForContext } from "@/lib/ai/context";
import { CHAT_MODEL_ID, prepareChatTurn } from "@/lib/ai/chat-turn";
import { parseFollowUps } from "@/lib/chat-utils";
import type { ChatSource } from "@/lib/types";

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

    // Every search is scoped to one school; an unscoped request has nothing
    // it may legitimately read.
    if (!schoolId) {
      return new Response(JSON.stringify({ error: "schoolId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify access: super admins, or approved members of this school
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

    const lastMessage = messages[messages.length - 1];

    // AI SDK v6 sends UIMessages with `parts` array, not a `content` string
    const lastMessageText =
      lastMessage.parts
        ?.filter((p: { type: string }) => p.type === "text")
        .map((p: { text: string }) => p.text)
        .join("") || "";

    const adminSupabase = createAdminClient();
    const {
      searchQuery,
      systemPrompt,
      sources,
      relevantChunks,
      modelMessages,
      temperature,
    } = await prepareChatTurn({
      messages,
      lastMessageText,
      schoolId,
      children: fetchChildrenForContext(user.id, schoolId),
    });

    if (searchQuery !== lastMessageText) {
      debugLog(`Query rewritten: "${lastMessageText.slice(0, 60)}" → "${searchQuery.slice(0, 60)}"`);
    }
    if (relevantChunks.length > 0) {
      debugLog(`RAG: ${relevantChunks.length} chunks found. Top: "${relevantChunks[0].document_title}" (sim: ${relevantChunks[0].similarity.toFixed(3)})`);
    } else {
      debugLog(`RAG: 0 chunks found for query: "${lastMessageText.slice(0, 80)}"`);
    }

    // Documents are the only citable sources; the calendar never produces
    // cards, so what the client receives is exactly what [N] can resolve to.
    const allSources: ChatSource[] = sources;

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

    // Stream the response, save assistant message on finish
    const result = streamText({
      model: google(CHAT_MODEL_ID),
      system: systemPrompt,
      messages: modelMessages,
      temperature,
      maxRetries: 5,
      onFinish: async ({ text }) => {
        if (sessionId && text.trim()) {
          // Strip follow-up markers before saving to DB
          const cleanText = parseFollowUps(text).content;
          // Only document sources are persisted — the calendar is scanned for
          // every question but is never a citable card.
          const savedSources: ChatSource[] = sources;
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
