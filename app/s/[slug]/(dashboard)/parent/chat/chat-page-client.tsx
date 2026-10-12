"use client";

import { useState, useEffect, useCallback } from "react";
import { ChatInterface } from "@/components/chat/chat-interface";
import { ChatHistorySidebar } from "@/components/chat/chat-history-sidebar";
import { MagicBentoCard } from "@/components/magic-bento";
import { getChatMessages, getChatSessions } from "@/actions/chat";
import type { ChatSession, ChatMessage } from "@/lib/types";

interface ChatPageClientProps {
  sessions: ChatSession[];
  suggestedQuestions?: string[];
  welcomeMessage?: string | null;
  schoolId: string;
  schoolSlug: string;
  aiConsentGiven: boolean;
}

export function ChatPageClient({
  sessions: initialSessions,
  suggestedQuestions,
  welcomeMessage,
  schoolId,
  aiConsentGiven,
}: ChatPageClientProps) {
  const existingSessionId = initialSessions[0]?.id ?? null;

  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(existingSessionId);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [chatKey, setChatKey] = useState<string>(existingSessionId || "new");

  // A "new…" key needs no fetch: initialMessages starts empty and
  // handleNewChat clears it when it mints one.
  useEffect(() => {
    if (chatKey && !chatKey.startsWith("new")) {
      let cancelled = false;
      getChatMessages(chatKey).then(({ messages }) => {
        if (!cancelled) setInitialMessages(messages || []);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [chatKey]);

  const refreshSessions = useCallback(async () => {
    const { sessions: latest, error } = await getChatSessions(schoolId);
    if (!error) setSessions(latest as ChatSession[]);
  }, [schoolId]);

  // Start a fresh chat. Past chats stay in history (pruned server-side to the
  // last 10); nothing is deleted here.
  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setChatKey(`new-${Date.now()}`);
    setInitialMessages([]);
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setInitialMessages([]);
    setChatKey(sessionId);
  }, []);

  const handleSessionCreated = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      void refreshSessions();
    },
    [refreshSessions]
  );

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="relative flex h-full flex-col overflow-hidden md:flex-row">
      <ChatHistorySidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onDeleted={() => void refreshSessions()}
        schoolId={schoolId}
      />
      <MagicBentoCard enableParticles={false} className="flex-1 min-w-0 min-h-0 h-full">
        <ChatInterface
          key={chatKey}
          sessionId={activeSessionId || undefined}
          initialMessages={initialMessages}
          onSessionCreated={handleSessionCreated}
          onNewChat={handleNewChat}
          sessionTitle={activeSession?.title ?? undefined}
          suggestedQuestions={suggestedQuestions}
          welcomeMessage={welcomeMessage}
          schoolId={schoolId}
          aiConsentGiven={aiConsentGiven}
        />
      </MagicBentoCard>
    </div>
  );
}
