"use client";

import { useState, useEffect, useCallback } from "react";
import { ChatInterface } from "@/components/chat/chat-interface";
import { MagicBentoCard } from "@/components/magic-bento";
import { getChatMessages, deleteAllChatSessions } from "@/actions/chat";
import type { ChatSession, ChatMessage } from "@/lib/types";

interface ChatPageClientProps {
  sessions: ChatSession[];
  suggestedQuestions?: string[];
  welcomeMessage?: string | null;
  schoolId: string;
  schoolSlug: string;
}

export function ChatPageClient({
  sessions: initialSessions,
  suggestedQuestions,
  welcomeMessage,
  schoolId,
}: ChatPageClientProps) {
  const existingSessionId = initialSessions[0]?.id ?? null;

  const [activeSessionId, setActiveSessionId] = useState<string | null>(existingSessionId);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [chatKey, setChatKey] = useState<string>(existingSessionId || "new");

  useEffect(() => {
    if (chatKey && !chatKey.startsWith("new")) {
      getChatMessages(chatKey).then(({ messages }) => {
        setInitialMessages(messages || []);
      });
    } else {
      setInitialMessages([]);
    }
  }, [chatKey]);

  const handleNewChat = useCallback(async () => {
    await deleteAllChatSessions(schoolId);
    setActiveSessionId(null);
    setChatKey(`new-${Date.now()}`);
    setInitialMessages([]);
  }, [schoolId]);

  const handleSessionCreated = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
  }, []);

  return (
    <div className="relative flex h-full overflow-hidden">
      <MagicBentoCard enableParticles={false} className="flex-1 min-w-0 h-full">
        <ChatInterface
          key={chatKey}
          sessionId={activeSessionId || undefined}
          initialMessages={initialMessages}
          onSessionCreated={handleSessionCreated}
          onNewChat={handleNewChat}
          suggestedQuestions={suggestedQuestions}
          welcomeMessage={welcomeMessage}
          schoolId={schoolId}
        />
      </MagicBentoCard>
    </div>
  );
}
