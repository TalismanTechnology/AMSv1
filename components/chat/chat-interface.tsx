"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { motion } from "framer-motion";
import { messageEntrance } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { MessageBubble } from "./message-bubble";
import { SuggestedQuestions } from "./suggested-questions";
import { SourcePanel } from "./source-panel";
import { SourcePanelProvider } from "./source-panel-context";
import { TypingIndicator } from "@/components/ui/typing-indicator";
import { ChatExport } from "./chat-export";
import { NewChatFab } from "./new-chat-fab";
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
}

export function ChatInterface({
  sessionId,
  initialMessages: dbMessages,
  onSessionCreated,
  onNewChat,
  suggestedQuestions,
  welcomeMessage,
  sessionTitle,
  schoolId,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);
  const [creatingSession, setCreatingSession] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<string | null>(null);
  // Track IDs of messages loaded from DB so we can skip their entrance animation
  const hydratedIdsRef = useRef<Set<string>>(new Set(dbMessages?.map((m) => m.id) || []));
  // Keep a ref for sessionId so the transport body function always reads the latest value
  const sessionIdRef = useRef(currentSessionId);
  sessionIdRef.current = currentSessionId;

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
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ sessionId: sessionIdRef.current, schoolId }),
      }),
    [schoolId]
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
  });

  // Hydrate with DB messages on mount
  useEffect(() => {
    if (hydratedMessages?.length) {
      setMessages(hydratedMessages);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading =
    status === "streaming" || status === "submitted" || creatingSession;

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

  async function submitText(text: string) {
    if (!text.trim() || isLoading) return;

    // Intercept /preview command
    if (text.trim().startsWith("/preview ")) {
      const query = text.trim().slice("/preview ".length).trim();
      if (query) {
        await handlePreviewCommand(query);
      }
      return;
    }

    // Auto-create session on first message if none exists
    if (!currentSessionId) {
      setCreatingSession(true);
      const result = await createChatSession(schoolId!, text);
      setCreatingSession(false);
      if (result.error || !result.sessionId) return;
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
        <div className="flex flex-1 flex-col min-w-0">
          {/* Header with export */}
          {messages.length > 0 && (
            <div className="flex items-center justify-end border-b neon-divider px-4 py-1.5">
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
            <div className="mx-auto max-w-3xl w-full space-y-6 py-6 pb-32">
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
                      initial={hydratedIdsRef.current.has(message.id) ? false : "hidden"}
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
                        onFollowUpSelect={handleFollowUpSelect}
                      />
                    </motion.div>
                  );
                })
              )}
              {creatingSession && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LogoSpinner size={20} />
                  Starting chat session...
                </div>
              )}
              {isLoading && !creatingSession && (!messages[messages.length - 1] || messages[messages.length - 1].role === "user" || !getMessageText(messages[messages.length - 1])) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TypingIndicator />
                  Searching documents...
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  Something went wrong: {error.message}
                </div>
              )}
            </div>
          </div>

          {/* Floating Input */}
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 px-4 pb-4 pt-10 bg-gradient-to-t from-background via-background/80 to-transparent">
            <form
              onSubmit={handleSubmit}
              className="pointer-events-auto mx-auto flex max-w-3xl items-end gap-2"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask a question about your school..."
                rows={1}
                className="min-h-[44px] resize-none border-0 bg-muted/80 backdrop-blur-md shadow-lg"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !input.trim()}
                className="shadow-lg"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        {/* Artifact panel */}
        <SourcePanel />

        {/* Floating new chat button */}
        {onNewChat && (
          <NewChatFab visible={messages.length > 2} onClick={onNewChat} />
        )}
      </div>
    </SourcePanelProvider>
  );
}
