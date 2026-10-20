"use client";

import { useState, useCallback } from "react";
import { ChatInterface } from "@/components/chat/chat-interface";
import { MagicBentoCard } from "@/components/magic-bento";
import { clearChat } from "@/actions/chat";
import type { ChatSession, ChatMessage } from "@/lib/types";

interface ChatPageClientProps {
  /** The parent's one chat for this school (lib/chat/current-chat.ts). */
  session: Pick<ChatSession, "id">;
  /** Its messages from the last 30 minutes, loaded server-side. */
  messages: ChatMessage[];
  suggestedQuestions?: string[];
  welcomeMessage?: string | null;
  schoolId: string;
  /** Header text (parentChatHeading); parent chats show no per-session title. */
  heading: string;
  aiConsentGiven: boolean;
}

interface View {
  /** Remount key for ChatInterface. */
  key: string;
  sessionId: string;
  messages: ChatMessage[];
}

export function ChatPageClient({
  session,
  messages,
  suggestedQuestions,
  welcomeMessage,
  schoolId,
  heading,
  aiConsentGiven,
}: ChatPageClientProps) {
  // The history arrives with the page, so ChatInterface never mounts on a
  // session whose messages aren't on screen.
  const [view, setView] = useState<View>(() => ({
    key: session.id,
    sessionId: session.id,
    messages,
  }));

  const handleClear = useCallback(async () => {
    const result = await clearChat(schoolId);
    if (result.error || !result.sessionId) {
      return result.error || "Couldn't clear the chat. Please try again.";
    }
    setView({
      key: `${result.sessionId}-${Date.now()}`,
      sessionId: result.sessionId,
      messages: [],
    });
    return null;
  }, [schoolId]);

  // The server moved this chat to another session (e.g. the old one expired
  // while the page was open): keep sending there, without remounting.
  const handleSessionCreated = useCallback((sessionId: string) => {
    setView((v) => (v.sessionId === sessionId ? v : { ...v, sessionId }));
  }, []);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <MagicBentoCard enableParticles={false} className="flex-1 min-w-0 min-h-0 h-full">
        <ChatInterface
          key={view.key}
          sessionId={view.sessionId}
          initialMessages={view.messages}
          onSessionCreated={handleSessionCreated}
          onClearChat={handleClear}
          heading={heading}
          suggestedQuestions={suggestedQuestions}
          welcomeMessage={welcomeMessage}
          schoolId={schoolId}
          aiConsentGiven={aiConsentGiven}
        />
      </MagicBentoCard>
    </div>
  );
}
