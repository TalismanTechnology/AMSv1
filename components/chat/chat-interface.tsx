"use client";

import { useRef, useEffect, useLayoutEffect, useState, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { motion } from "framer-motion";
import { messageEntrance } from "@/lib/motion";
import { RetrievalLoadingStrip } from "./retrieval-loading-strip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { MessageBubble } from "./message-bubble";
import { preloadMarkdownRenderer } from "./lazy-markdown-renderer";
import { SuggestedQuestions } from "./suggested-questions";
import { SourcePanel } from "./source-panel";
import { SourcePanelProvider } from "./source-panel-context";
import { ChatExport } from "./chat-export";
import { AiConsentDialog } from "./ai-consent-dialog";
import { isAiConsentError } from "@/lib/ai/consent";
import { createChatSession } from "@/actions/chat";
import { searchDocumentsByName } from "@/actions/documents";
import { parseFollowUps } from "@/lib/chat-utils";
import type { ChatSource, ChatMessage } from "@/lib/types";

interface ChatInterfaceProps {
  sessionId?: string;
  initialMessages?: ChatMessage[];
  onSessionCreated?: (sessionId: string) => void;
  onNewChat?: () => void;
  suggestedQuestions?: string[];
  welcomeMessage?: string | null;
  sessionTitle?: string;
  schoolId?: string;
  /**
   * Whether the user has agreed to the current AI-processing notice. When
   * false, the first question opens the consent dialog instead of sending.
   * The chat API enforces the same rule server-side.
   */
  aiConsentGiven?: boolean;
}

export function ChatInterface({
  sessionId,
  initialMessages: dbMessages,
  onSessionCreated,
  suggestedQuestions,
  welcomeMessage,
  sessionTitle,
  schoolId,
  aiConsentGiven = false,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [hasAiConsent, setHasAiConsent] = useState(aiConsentGiven);
  const [consentOpen, setConsentOpen] = useState(false);
  // The question that was waiting on the consent dialog.
  const consentPendingRef = useRef<string | null>(null);
  // The consent-gate error the parent closed with "Not now" (so it doesn't
  // re-open on every render).
  const [dismissedConsentError, setDismissedConsentError] = useState<Error | undefined>();
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<string | null>(null);
  // Track IDs of messages loaded from DB so we can skip their entrance animation
  // (captured once on mount, never updated)
  const [hydratedIds] = useState<Set<string>>(
    () => new Set(dbMessages?.map((m) => m.id) || [])
  );
  // Keep a ref for sessionId so the transport body function always reads the
  // latest value. Synced in a layout effect (before any passive effect or
  // event handler can send) rather than during render.
  const sessionIdRef = useRef(currentSessionId);
  useLayoutEffect(() => {
    sessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Convert DB messages to UIMessage format for useChat hydration
  const hydratedMessages = useMemo(() => {
    if (!dbMessages?.length) return undefined;
    return dbMessages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [
        { type: "text" as const, text: m.content },
        ...(m.sources?.length
          ? [{ type: "data-sources" as const, data: m.sources }]
          : []),
        ...(m.role === "assistant"
          ? [{ type: "data-message-id" as const, data: m.id }]
          : []),
      ],
    }));
  }, [dbMessages]);

  // Use a function for body so it always reads the latest sessionId from the ref
  // (DefaultChatTransport supports Resolvable<object> which accepts () => object)
  const transport = useMemo(
    () =>
      // body() runs only when a message is sent, never during render.
      // eslint-disable-next-line react-hooks/refs
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ sessionId: sessionIdRef.current, schoolId }),
      }),
    [schoolId]
  );

  const { messages, sendMessage, regenerate, status, error, setMessages } = useChat({
    transport,
  });

  // Fetch the markdown chunk right after first paint, before any message
  // needs it.
  useEffect(() => {
    preloadMarkdownRenderer();
  }, []);

  // Hydrate with DB messages on mount
  useEffect(() => {
    if (hydratedMessages?.length) {
      setMessages(hydratedMessages);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading =
    status === "streaming" || status === "submitted" || creatingSession;

  // The server refused for missing consent (e.g. it was withdrawn in another
  // tab): show the notice again rather than a raw error.
  const consentError = isAiConsentError(error?.message);
  const consentDialogOpen =
    consentOpen || (consentError && dismissedConsentError !== error);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Find last assistant message index
  const lastAssistantIndex = messages.reduce(
    (acc, m, i) => (m.role === "assistant" ? i : acc),
    -1
  );

  // Send pending message after transport recreates with new sessionId
  useEffect(() => {
    if (pendingMessageRef.current && currentSessionId) {
      const text = pendingMessageRef.current;
      pendingMessageRef.current = null;
      sendMessage({ text });
    }
  }, [currentSessionId, sendMessage]);

  async function handlePreviewCommand(query: string) {
    if (!schoolId) return;

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    // Inject user message and loading assistant message
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user" as const,
        parts: [{ type: "text" as const, text: `/preview ${query}` }],
      },
      {
        id: assistantMsgId,
        role: "assistant" as const,
        parts: [
          {
            type: "text" as const,
            text: `Searching for documents matching "${query}"...`,
          },
        ],
      },
    ]);

    const result = await searchDocumentsByName(query, schoolId);

    if (result.error || !result.documents?.length) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                parts: [
                  {
                    type: "text" as const,
                    text: `No documents found matching "${query}".`,
                  },
                ],
              }
            : m
        )
      );
      return;
    }

    const previewSources: ChatSource[] = result.documents.map((doc) => ({
      document_id: doc.document_id,
      title: doc.title,
      chunk_content: doc.chunk_preview || doc.description || "",
      similarity: 1,
      file_url: doc.file_url,
      file_type: doc.file_type,
    }));

    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId
          ? {
              ...m,
              parts: [
                {
                  type: "text" as const,
                  text: `Found ${result.documents.length} document(s) matching "${query}":`,
                },
                { type: "data-sources" as const, data: previewSources },
              ],
            }
          : m
      )
    );
  }

  async function submitText(text: string, { consented = false } = {}) {
    if (!text.trim() || isLoading) return;
    setSendError(null);

    // Intercept /preview command
    if (text.trim().startsWith("/preview ")) {
      const query = text.trim().slice("/preview ".length).trim();
      if (query) {
        await handlePreviewCommand(query);
      }
      return;
    }

    // Nothing is sent to the AI until the parent has agreed to the notice.
    // `consented` covers the call made right after "Agree", before the state
    // update lands; the server has the consent row by then.
    if (!consented && (!hasAiConsent || consentError)) {
      consentPendingRef.current = text;
      setConsentOpen(true);
      return;
    }

    // Auto-create session on first message if none exists
    if (!currentSessionId) {
      setCreatingSession(true);
      const result = await createChatSession(schoolId!, text);
      setCreatingSession(false);
      if (result.error || !result.sessionId) {
        setSendError(
          result.error || "Couldn't start the chat session. Please try again."
        );
        setInput(text); // restore the message instead of silently dropping it
        return;
      }
      // Queue the message — it will be sent by the useEffect above
      // after React re-renders with the new transport
      pendingMessageRef.current = text;
      setCurrentSessionId(result.sessionId);
      onSessionCreated?.(result.sessionId);
      return;
    }

    sendMessage({ text });
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input;
    setInput("");
    await submitText(text);
  }

  function handleConsentAgree() {
    setHasAiConsent(true);
    setConsentOpen(false);
    const pending = consentPendingRef.current;
    consentPendingRef.current = null;
    if (pending) {
      submitText(pending, { consented: true });
    } else if (consentError) {
      // Re-send the question the server refused.
      regenerate();
    }
  }

  function handleConsentDecline() {
    setConsentOpen(false);
    if (consentError) setDismissedConsentError(error);
    const pending = consentPendingRef.current;
    consentPendingRef.current = null;
    // Give the question back rather than dropping it.
    if (pending && !input) setInput(pending);
  }

  function handleSuggestedQuestion(question: string) {
    submitText(question);
  }

  function handleFollowUpSelect(question: string) {
    submitText(question);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function getMessageText(message: (typeof messages)[number]): string {
    return message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  function getMessageSources(
    message: (typeof messages)[number]
  ): ChatSource[] {
    return message.parts
      .filter((p) => p.type === "data-sources")
      .flatMap(
        (p) => (p as { type: "data-sources"; data: ChatSource[] }).data
      );
  }

  function getDbMessageId(
    message: (typeof messages)[number]
  ): string | undefined {
    const part = message.parts.find((p) => p.type === "data-message-id");
    return part
      ? (part as { type: "data-message-id"; data: string }).data
      : undefined;
  }

  return (
    <SourcePanelProvider>
      <div className="flex h-full">
        {/* Chat column */}
        <div className="relative flex flex-1 flex-col min-w-0">
          {/* Header with export */}
          {messages.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5">
              <p className="truncate text-sm font-medium text-ink">
                {sessionTitle || "Conversation"}
              </p>
              <ChatExport
                messages={messages.map((m) => ({
                  role: m.role,
                  content: parseFollowUps(getMessageText(m)).content,
                }))}
                sessionTitle={sessionTitle}
              />
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 flex flex-col" ref={scrollRef}>
            <div className="mx-auto max-w-3xl w-full space-y-10 py-8 pb-32">
              {messages.length === 0 ? (
                <SuggestedQuestions
                  onSelect={handleSuggestedQuestion}
                  questions={suggestedQuestions}
                  welcomeMessage={welcomeMessage}
                />
              ) : (
                messages.map((message, index) => {
                  const text = getMessageText(message);
                  // Hide empty assistant messages (waiting for first token, or failed stream)
                  if (message.role === "assistant" && !text) {
                    return null;
                  }
                  return (
                    <motion.div
                      key={message.id}
                      initial={hydratedIds.has(message.id) ? false : "hidden"}
                      animate="visible"
                      variants={messageEntrance}
                    >
                      <MessageBubble
                        role={message.role as "user" | "assistant"}
                        content={text}
                        messageId={getDbMessageId(message)}
                        schoolId={schoolId}
                        sources={
                          message.role === "assistant"
                            ? getMessageSources(message)
                            : undefined
                        }
                        isLastAssistant={index === lastAssistantIndex && !isLoading}
                        isStreaming={
                          index === lastAssistantIndex &&
                          index === messages.length - 1 &&
                          message.role === "assistant" &&
                          status === "streaming"
                        }
                        skipAnimations={hydratedIds.has(message.id)}
                        onFollowUpSelect={handleFollowUpSelect}
                      />
                    </motion.div>
                  );
                })
              )}
              {creatingSession && (
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <LogoSpinner size={20} />
                  Starting chat session...
                </div>
              )}
              {isLoading && !creatingSession && (!messages[messages.length - 1] || messages[messages.length - 1].role === "user" || !getMessageText(messages[messages.length - 1])) && (
                <RetrievalLoadingStrip />
              )}
              {consentError && !consentDialogOpen && (
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-ink-soft">
                  To get answers, agree to AI processing — send your question
                  again to see the notice.
                </div>
              )}
              {((error && !consentError) || sendError) && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  Something went wrong: {error?.message || sendError}
                </div>
              )}
            </div>
          </div>

          {/* Floating Input */}
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 px-4 pb-4 pt-12 bg-gradient-to-t from-background via-background/85 to-transparent">
            <form
              onSubmit={handleSubmit}
              className="pointer-events-auto mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-background p-2 pl-4 transition-colors focus-within:border-ink/20"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask a question about your school…"
                rows={1}
                className="min-h-[36px] resize-none border-0 bg-transparent px-0 py-1.5 text-ink shadow-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !input.trim()}
                className="size-9 shrink-0 rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        </div>

        {/* Artifact panel */}
        <SourcePanel />

        <AiConsentDialog
          open={consentDialogOpen}
          onAgree={handleConsentAgree}
          onDecline={handleConsentDecline}
        />
      </div>
    </SourcePanelProvider>
  );
}
