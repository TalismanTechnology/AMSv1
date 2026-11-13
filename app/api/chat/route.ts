import { NextRequest, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { schoolLockError } from "@/lib/school-lock/access";
import { appendFileSync } from "fs";
const debugLog = (msg: string) => { const line = `[${new Date().toISOString()}] ${msg}\n`; console.log(line.trim()); if (process.env.NODE_ENV !== "production") { try { appendFileSync("chat-debug.log", line); } catch {} } };
import {
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageChunk,
} from "ai";
import { google } from "@ai-sdk/google";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { assignToCluster } from "@/lib/ai/cluster-assignment";
import { sendClusterAlert } from "@/lib/alerts/cluster-alerts";
import { fetchChildrenForContext } from "@/lib/ai/context";
import { prepareChatTurn } from "@/lib/ai/chat-turn";
import { aiConsentGate } from "@/lib/ai/consent";
import { parseFollowUps } from "@/lib/chat-utils";
import { citedEventSources, renumberCitations } from "@/lib/ai/citations";
import { PARENT_AI_ERROR_MESSAGE, isAiProviderError } from "@/lib/ai/provider-errors";
import { reportAiFailure } from "@/lib/alerts/ai-failure-alert";
import { createTimer } from "@/lib/ai/timing";
import type { ChatSource } from "@/lib/types";
import {
  contactCardPrompt,
  contactDirectoryPrompt,
  loadApprovedContacts,
  routeUnansweredQuestion,
} from "@/lib/contacts/route-contact";
import type { ContactCardData } from "@/lib/contacts/directory";
import { shouldAutoTitle } from "@/lib/chat/chat-view";
import {
  MAX_HISTORY_MESSAGES,
  buildModelHistory,
  claimParentSession,
  createParentSession,
  parseRequestedSessionId,
  truncateTitle,
  type StoredMessage,
} from "@/lib/chat/retention";

// A write the response doesn't depend on: already running, never awaited, and
// kept alive past the end of the response by after().
const inBackground = (task: PromiseLike<unknown>) => after(Promise.resolve(task));

/**
 * Calendar entries are numbered in the prompt but only the ones the answer
 * cites are sent: each as its own data-sources part (the client concatenates
 * them), written just before the text that first cites it so its marker
 * never renders without a source behind it.
 */
function withCitedEvents(eventSources: ChatSource[]) {
  let text = "";
  const sent = new Set<number>();
  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === "text-delta" && eventSources.length > 0) {
        text += chunk.delta;
        const fresh = citedEventSources(text, eventSources).filter(
          (s) => !sent.has(s.source_number!)
        );
        for (const s of fresh) sent.add(s.source_number!);
        if (fresh.length > 0) controller.enqueue({ type: "data-sources", data: fresh });
      }
      controller.enqueue(chunk);
    },
  });
}

export async function POST(request: NextRequest) {
  // Per-stage latency, logged once per turn as `[chat-timing] {...}` when the
  // stream ends (or the turn fails before it starts). Ids, counts and timings
  // only — never the question, the answer or anything about the family.
  const timer = createTimer();
  const logTiming = (fields: Record<string, unknown>) => {
    const line = timer.line(fields);
    if (line) console.log(line);
  };
  // A new chat's session, created while the turn is prepared. Cleared once
  // the stream is about to start; still set if the turn fails before that.
  let pendingSession: { created: Promise<string>; userId: string } | null = null;
  try {
    const supabase = await createClient();
    // Read the body while auth is verified; a bad body still only surfaces
    // (as before) once the caller is known to be signed in.
    const body = request.json();
    body.catch(() => {});
    const authed = timer.start("auth");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authed();

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const parsedBody = await body;
    const { messages, schoolId } = parsedBody;
    // The chat this question belongs to: an id, or null for a new chat. Never
    // inferred — a missing field is a client bug, not "the latest chat".
    const requested = parseRequestedSessionId(parsedBody);
    if (!requested.ok) {
      return new Response(
        JSON.stringify({ error: "sessionId is required (null for a new chat)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const requestedSessionId = requested.sessionId;
    debugLog(`REQUEST: sessionId=${requestedSessionId}, schoolId=${schoolId}, messageCount=${messages?.length}`);

    // Every search is scoped to one school; an unscoped request has nothing
    // it may legitimately read.
    if (!schoolId) {
      return new Response(JSON.stringify({ error: "schoolId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only the requesting user's own children are read before access is
    // verified, so that read overlaps the checks below. It stays on our server
    // — nothing reaches the AI provider before the consent gate — and is
    // dropped unread if access is refused. School-wide context (calendar,
    // announcements, settings) is read only once access is granted, inside
    // prepareChatTurn.
    const children = fetchChildrenForContext(user.id, schoolId);
    // A refused request never awaits this; don't let a failure there surface
    // as an unhandled rejection. prepareChatTurn's await still sees the error.
    children.catch(() => {});
    timer.observe("children", children);

    // Verify access: super admins, or approved members of this school. Both
    // rows are read in parallel; they are still checked in the original order
    // (consent first, then membership) below.
    const accessChecked = timer.start("access");
    const [{ data: profile }, { data: membership }] = await Promise.all([
      supabase
        .from("profiles")
        .select("role, ai_consent_at, ai_consent_version")
        .eq("id", user.id)
        .single(),
      supabase
        .from("school_memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("school_id", schoolId)
        .eq("approved", true)
        .single(),
    ]);
    accessChecked();

    // Nothing reaches the AI provider until this user has agreed to the
    // current AI-processing notice (App Store 5.1.2(i)). Enforced here, not
    // only in the chat UI, so the dialog can't be bypassed. Applies to every
    // role: staff previewing the chat send the same data to the same place.
    const consentDenied = aiConsentGate(profile);
    if (consentDenied) return consentDenied;

    if (profile?.role !== "super_admin") {
      if (!membership) {
        return new Response(JSON.stringify({ error: "Access denied" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    } else if (!membership) {
      // A super-admin without their own membership is held to the school's
      // owner lock. Members (parents, staff) never reach this.
      const locked = await schoolLockError(schoolId, "member", user.id);
      if (locked) {
        return new Response(JSON.stringify({ error: locked }), {
          status: 423,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const lastMessage = Array.isArray(messages) ? messages[messages.length - 1] : undefined;
    if (!lastMessage || lastMessage.role !== "user") {
      return new Response(JSON.stringify({ error: "A question is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // AI SDK v6 sends UIMessages with `parts` array, not a `content` string
    const lastMessageText =
      lastMessage.parts
        ?.filter((p: { type: string }) => p.type === "text")
        .map((p: { text: string }) => p.text)
        .join("") || "";

    const adminSupabase = createAdminClient();

    // The session the client named, only if it is still this parent's
    // visible chat in this school (touched now, so the purge can't remove it
    // mid-request). Otherwise — a new chat (null), or one deleted, hidden,
    // expired or not theirs — a new session is created below, once the
    // question is ready to be saved. Never another existing session.
    const claimed = timer.start("sessionClaim");
    const claimedSessionId = requestedSessionId
      ? await claimParentSession(adminSupabase, user.id, schoolId, requestedSessionId)
      : null;
    claimed();

    // A new chat gets its session, titled from its first question. Created
    // now, alongside retrieval, rather than after it; awaited just before the
    // stream starts, so a failure here still fails the turn as before. If the
    // turn fails first, the catch below deletes it again — a failed question
    // never leaves an empty chat behind.
    if (!claimedSessionId) {
      const created = createParentSession(
        adminSupabase,
        user.id,
        schoolId,
        truncateTitle(lastMessageText)
      );
      created.catch(() => {});
      timer.observe("sessionCreate", created);
      pendingSession = { created, userId: user.id };
    }

    // Model context is the session's latest stored messages plus this
    // question — never the history the client sent, which may hold deleted
    // (or invented) turns. Read before this turn is saved.
    let storedRows: StoredMessage[] = [];
    const historyLoaded = timer.start("historyLoad");
    if (claimedSessionId) {
      const { data, error: storedError } = await adminSupabase
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("session_id", claimedSessionId)
        .order("created_at", { ascending: false })
        // One extra: a retried question's stored copy, or an assistant
        // reply whose question fell outside the limit, is dropped.
        .limit(MAX_HISTORY_MESSAGES + 1);
      if (storedError) throw new Error(storedError.message);
      storedRows = (data ?? []) as StoredMessage[];
    }
    historyLoaded();
    const contextMessages = buildModelHistory(storedRows, lastMessage);
    timer.note(
      "firstQuestion",
      contextMessages.filter((m) => m.role === "user").length <= 1
    );
    // The school's approved staff contacts (migration 044), read alongside
    // retrieval and used only if nothing answers the question. Never rejects:
    // a missing table or any error is "no contacts".
    const approvedContacts = loadApprovedContacts(adminSupabase, schoolId);
    // The same contacts as a directory in the answer prompt, so an answer
    // that sends the parent to someone gives their real email / phone. Built
    // alongside retrieval; never rejects ("" = prompt unchanged).
    const contactDirectory = approvedContacts.then((contacts) =>
      contactDirectoryPrompt(adminSupabase, schoolId, contacts)
    );
    timer.observe("contactDirectory", contactDirectory);
    // The session's stored title and message count, read before this turn's
    // user message is saved, so auto-titling goes by what's in the DB rather
    // than how much history the client happened to send. Never rejects: an
    // unknown state is "don't retitle".
    const titleCheck: Promise<boolean> = claimedSessionId
      ? Promise.all([
          adminSupabase
            .from("chat_sessions")
            .select("title")
            .eq("id", claimedSessionId)
            .maybeSingle(),
          adminSupabase
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("session_id", claimedSessionId),
        ]).then(
          ([session, prior]) =>
            !session.error &&
            !!session.data &&
            !prior.error &&
            shouldAutoTitle({
              title: session.data.title,
              priorMessageCount: prior.count,
            }),
          () => false
        )
      : Promise.resolve(false);
    const prepared = timer.start("prepareChatTurn");
    const {
      searchQuery,
      systemPrompt,
      sources,
      eventSources,
      relevantChunks,
      modelMessages,
      temperature,
      providerQuestion,
      answer: routing,
    } = await prepareChatTurn({
      messages: contextMessages,
      lastMessageText,
      schoolId,
      children,
      timer,
    });
    prepared();

    if (searchQuery !== lastMessageText) {
      debugLog(`Query rewritten: "${lastMessageText.slice(0, 60)}" → "${searchQuery.slice(0, 60)}"`);
    }
    if (relevantChunks.length > 0) {
      debugLog(`RAG: ${relevantChunks.length} chunks found. Top: "${relevantChunks[0].document_title}" (sim: ${relevantChunks[0].similarity.toFixed(3)})`);
    } else {
      debugLog(`RAG: 0 chunks found for query: "${lastMessageText.slice(0, 80)}"`);
    }

    // Unanswered: route the parent to the right approved staff contact, shown
    // as a card. No approved contacts (or no table yet) → no card, and the
    // answer is exactly what it was before contacts existed.
    let contactCard: ContactCardData | null = null;
    let answerSystemPrompt = systemPrompt;
    if (sources.length === 0) {
      const contactRouted = timer.start("contactRouting");
      try {
        const routed = await routeUnansweredQuestion({
          supabase: adminSupabase,
          schoolId,
          contacts: await approvedContacts,
          providerQuestion,
          divisionHints: [lastMessageText, searchQuery],
        });
        if (routed) {
          contactCard = routed.card;
          answerSystemPrompt = `${systemPrompt}\n\n${contactCardPrompt(routed.card)}`;
          debugLog(`Contact routing: topic=${routed.topic ?? "none"} → contact ${routed.card.id}`);
        }
      } catch (err) {
        debugLog(`Contact routing failed (continuing without a card): ${err}`);
      }
      contactRouted();
    }
    // No card: list the approved directory instead. (With a card, the model
    // is told not to write contact details — the card shows them.)
    if (!contactCard) {
      const directoryWaited = timer.start("contactDirectoryWait");
      const directory = await contactDirectory;
      directoryWaited();
      if (directory) answerSystemPrompt = `${answerSystemPrompt}\n\n${directory}`;
    }

    // The new chat's session (started above, usually long since created).
    const sessionWaited = timer.start("sessionCreateWait");
    const sessionId = claimedSessionId ?? (await pendingSession!.created);
    sessionWaited();
    // From here the turn either streams or fails inside the stream; the
    // session is kept either way, as before.
    pendingSession = null;
    const sessionMoved = sessionId !== requestedSessionId;

    // Save user message in the background. Each write starts now and never
    // blocks the stream; after() keeps the function alive until it lands.
    // The question's row waits only for the auto-title check (started before
    // retrieval, so long since done), whose message count must not include
    // it. Never rejects; the assistant reply's save waits for it, so the two
    // land in order.
    let userSaved: Promise<void> = Promise.resolve();
    if (sessionId) {
      userSaved = titleCheck.then(async () => {
        const { error } = await adminSupabase
          .from("chat_messages")
          .insert({
            session_id: sessionId,
            role: "user",
            content: lastMessageText,
            sources: [],
            school_id: schoolId,
            // Flags this exchange for school staff (no school sources found) —
            // the same condition that logs an unanswered question below.
            unanswered: sources.length === 0,
          });
        if (error) console.error("Failed to save user message:", error);
      });
      inBackground(userSaved);

      // Update session timestamp
      inBackground(adminSupabase
        .from("chat_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", sessionId)
        .then(({ error }) => { if (error) console.error("Failed to update session timestamp:", error); }));

      // Auto-title: only the session's first stored question titles it. The
      // check was read before this turn's message is saved; the stream
      // doesn't wait for it.
      inBackground(titleCheck.then(async (autoTitle) => {
        if (!autoTitle) return;
        const title = truncateTitle(lastMessageText) || "New chat";
        const { error } = await adminSupabase
          .from("chat_sessions")
          .update({ title })
          .eq("id", sessionId);
        if (error) console.error("Failed to auto-title session:", error);
      }));

      // Analytics event
      inBackground(adminSupabase
        .from("analytics_events")
        .insert({
          event_type: "question",
          user_id: user.id,
          school_id: schoolId,
          metadata: {
            question: lastMessageText,
            source_count: relevantChunks.length,
            // Same condition as the unanswered_questions log below; read by
            // the admin Analytics answer rate (lib/metrics).
            unanswered: sources.length === 0,
            source_document_ids: [
              ...new Set(relevantChunks.map((c) => c.document_id)),
            ],
            session_id: sessionId,
          },
        })
        .then(({ error }) => { if (error) console.error("Failed to save analytics event:", error); }));

      // Record unanswered question if no quality sources were found
      // (sources is empty when no chunks pass the 0.55 similarity threshold)
      debugLog(`Unanswered check: sources=${sources.length}, sessionId=${sessionId}, schoolId=${schoolId}`);
      if (sources.length === 0) {
        debugLog(`Recording unanswered question: "${lastMessageText.slice(0, 80)}"`);
        inBackground((async () => {
          try {
            // Embedded via the provider, so the name-redacted text is used.
            const embedding = await generateEmbedding(providerQuestion);
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
            reportAiFailure(err, { source: "chat.unanswered-embedding", schoolId });
          }
        })());
      }
    }

    // Pre-generate the assistant message ID so we can send it to the client for feedback
    const assistantMessageId = crypto.randomUUID();

    // Stream the response, save assistant message on finish. The next turn's
    // model history is read from the DB, so this save must land before the
    // parent can ask again: onFinish runs in the stream's flush, after the
    // client already has the finish event, and an un-awaited write there is
    // also not kept alive past the response. Awaiting it holds the stream
    // open until the row is written; after() (registered here, in the request
    // scope) covers a client that disconnects. Settled on every outcome so
    // after() never waits out the function timeout.
    let assistantSaved!: () => void;
    inBackground(new Promise<void>((resolve) => { assistantSaved = resolve; }));
    const turnFields = {
      schoolId,
      sessionId,
      messageId: assistantMessageId,
      // Routing (lib/ai/question-complexity.ts): a simple question gets a low
      // thinking level; a complex one passes no provider options, so the
      // provider's defaults (thinking included) apply.
      complexity: routing.complexity,
      thinkingLevel: routing.thinkingLevel,
      model: routing.modelId,
      providerOptions: routing.providerOptions ?? null,
      sources: sources.length,
      eventSources: eventSources.length,
      contactCard: !!contactCard,
    };
    timer.mark("streamStart");
    const result = streamText({
      model: google(routing.modelId),
      system: answerSystemPrompt,
      messages: modelMessages,
      temperature,
      providerOptions: routing.providerOptions,
      maxRetries: 5,
      onChunk: ({ chunk }) => {
        timer.mark("firstChunk");
        if (chunk.type === "reasoning-delta") timer.mark("firstReasoning");
        if (chunk.type === "text-delta") timer.mark("firstText");
      },
      onError: ({ error }) => {
        timer.mark("error");
        logTiming({ ...turnFields, outcome: "error" });
        // Logged and alerted on; the parent only sees PARENT_AI_ERROR_MESSAGE
        // (toUIMessageStream's onError below).
        reportAiFailure(error, { source: "chat.stream", schoolId }).alerted.finally(
          () => assistantSaved()
        );
      },
      onAbort: () => {
        timer.mark("abort");
        logTiming({ ...turnFields, outcome: "abort" });
        assistantSaved();
      },
      onFinish: async ({ text, finishReason, totalUsage, providerMetadata }) => {
        timer.mark("finish");
        logTiming({
          ...turnFields,
          outcome: "finish",
          finishReason,
          usage: {
            inputTokens: totalUsage.inputTokens,
            outputTokens: totalUsage.outputTokens,
            reasoningTokens: totalUsage.outputTokenDetails?.reasoningTokens,
            textTokens: totalUsage.outputTokenDetails?.textTokens,
            cacheReadTokens: totalUsage.inputTokenDetails?.cacheReadTokens,
            totalTokens: totalUsage.totalTokens,
          },
          // Gemini's own token counts (thoughtsTokenCount etc.) — numbers only.
          providerUsage: providerMetadata?.google?.usageMetadata ?? null,
        });
        try {
          if (!sessionId || !text.trim()) return;
          // Strip follow-up markers, keep the calendar entries the answer
          // cites, and save it renumbered [1], [2]… as the parent saw it.
          const answer = parseFollowUps(text).content;
          const { content: cleanText, sources: savedSources } = renumberCitations(answer, [
            ...sources,
            ...citedEventSources(answer, eventSources),
          ]);
          await userSaved;
          const { error } = await adminSupabase
            .from("chat_messages")
            .insert({
              id: assistantMessageId,
              session_id: sessionId,
              role: "assistant",
              content: cleanText,
              sources: savedSources,
              school_id: schoolId,
              unanswered: sources.length === 0,
            });
          if (error) console.error("Failed to save assistant message:", error);
        } finally {
          assistantSaved();
        }
      },
    });
    // Read to the end even if the client goes away, so onFinish (and the
    // save) always runs and the after() above always settles.
    void result.consumeStream();

    // Use createUIMessageStream so we can send sources as a data part
    // alongside the streamed text (DefaultChatTransport parses these on the client)
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        if (sessionMoved) {
          writer.write({ type: "data-session-id", data: sessionId, transient: true });
        }
        if (sources.length > 0) {
          writer.write({ type: "data-sources", data: sources });
        }
        // Contact details come only from the approved row, never the model.
        if (contactCard) {
          writer.write({ type: "data-contact", data: contactCard });
        }
        // No school documents matched (the same condition that flags it for
        // staff). The client offers a web search link only if the model's
        // reply also carries the NOT_FOUND flag (lib/chat-utils.ts).
        if (sources.length === 0) {
          writer.write({ type: "data-unanswered", data: true });
        }
        writer.write({ type: "data-message-id", data: assistantMessageId });
        // The SDK's default sends error.message to the browser; parents must
        // never see the provider's words.
        writer.merge(
          result
            .toUIMessageStream({ onError: () => PARENT_AI_ERROR_MESSAGE })
            .pipeThrough(withCitedEvents(eventSources))
        );
      },
      onError: () => PARENT_AI_ERROR_MESSAGE,
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    // A session created for this question would be an empty chat: remove it.
    if (pendingSession) {
      const { created, userId } = pendingSession;
      inBackground(created.then(
        async (id) => {
          const { error: deleteError } = await createAdminClient()
            .from("chat_sessions")
            .delete()
            .eq("id", id)
            .eq("user_id", userId);
          if (deleteError) console.error("Failed to remove unused chat session:", deleteError);
        },
        () => {}
      ));
    }
    // Before the stream starts: an AI call that must succeed (none today —
    // rewrite, retrieval and routing all fall back), a database error, or a
    // bad request body. Whatever it is, the parent sees one friendly line;
    // the details stay in the logs (and the owner alert, if it's the AI).
    const fromProvider = isAiProviderError(error);
    logTiming({ outcome: "prepare-error", fromProvider });
    if (fromProvider) reportAiFailure(error, { source: "chat.prepare" });
    else console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: PARENT_AI_ERROR_MESSAGE }), {
      status: fromProvider ? 503 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
