"use client";

import { useRef, useEffect, useLayoutEffect, useState, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, SquarePen } from "lucide-react";
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
import { searchDocumentsByName } from "@/actions/documents";
import { parseFollowUps } from "@/lib/chat-utils";
import type { ChatSource, ChatMessage } from "@/lib/types";
import type { ContactCardData } from "@/lib/contacts/directory";

interface ChatInterfaceProps {
  /**
   * The chat this input sends into; null for a new chat, whose session the
   * server creates on the first question (and reports via onSessionCreated).
   * Sent explicitly with every question, so a new chat can never be appended
   * to an older one.
   */
  sessionId: string | null;
  initialMessages?: ChatMessage[];
  /** The server wrote into this session (a new chat's first question). */
  onSessionCreated?: (sessionId: string) => void;
  /** A question was sent (the chat's last activity is now). */
  onSend?: () => void;
  /** Shows a "New chat" button in the header on small screens. */
  onNewChat?: () => void;
  suggestedQuestions?: string[];
  welcomeMessage?: string | null;
  /** Header text: the chat's title. */
  heading?: string;
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
  onSend,
  onNewChat,
  suggestedQuestions,
  welcomeMessage,
  heading,
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
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track IDs of messages loaded from DB so we can skip their entrance animation
  // (captured once on mount, never updated)
  const [hydratedIds] = useState<Set<string>>(
    () => new Set(dbMessages?.map((m) => m.id) || [])
  );
  // The session the transport sends into: the prop on mount (this component
  // is remounted per chat), then whatever the server reports writing into.
  // A ref so the transport body function always reads the latest value;
  // synced from the prop in a layout effect (before any event handler can
  // send) rather than during render.
  const sessionIdRef = useRef<string | null>(sessionId);
  useLayoutEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

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
        body: () => ({ sessionId: sessionIdRef.current ?? null, schoolId }),
      }),
    [schoolId]
  );

  const { messages, sendMessage, regenerate, status, error, setMessages } = useChat({
    transport,
    // The server created this turn's session (a new chat, or the one sent
    // had been deleted or expired): send the next turn there too.
    onData: (part) => {
      if (part.type === "data-session-id" && typeof part.data === "string") {
        sessionIdRef.current = part.data;
        onSessionCreated?.(part.data);
      }
    },
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

  const isLoading = status === "streaming" || status === "submitted";

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

    // A new chat sends sessionId null; the server creates its session.
    onSend?.();
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

  function getMessageContact(
    message: (typeof messages)[number]
  ): ContactCardData | undefined {
    const part = message.parts.find((p) => p.type === "data-contact");
    return part
      ? (part as { type: "data-contact"; data: ContactCardData }).data
      : undefined;
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
                {heading || "Conversation"}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                {onNewChat && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onNewChat}
                    className="text-muted-foreground md:hidden"
                  >
                    <SquarePen className="size-4" />
                    New chat
                  </Button>
                )}
                <ChatExport
                  messages={messages.map((m) => ({
                    role: m.role,
                    content: parseFollowUps(getMessageText(m)).content,
                  }))}
                  sessionTitle={heading}
                />
              </div>
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
                        contact={
                          message.role === "assistant"
                            ? getMessageContact(message)
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
              {isLoading && (!messages[messages.length - 1] || messages[messages.length - 1].role === "user" || !getMessageText(messages[messages.length - 1])) && (
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
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 px-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] pt-12 bg-gradient-to-t from-background via-background/85 to-transparent">
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
