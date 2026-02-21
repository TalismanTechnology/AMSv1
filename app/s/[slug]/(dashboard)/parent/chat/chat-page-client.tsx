"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ChatInterface } from "@/components/chat/chat-interface";
import { ChatHistorySidebar } from "@/components/chat/chat-history-sidebar";
import { MagicBentoCard } from "@/components/magic-bento";
import { getChatMessages } from "@/actions/chat";
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
  schoolSlug,
}: ChatPageClientProps) {
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState(initialSessions);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Active session for sidebar highlighting (changes freely)
  const urlSessionId = searchParams.get("session");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(urlSessionId);

  // Chat instance key — only changes on EXPLICIT user navigation (sidebar click,
  // new chat button), NOT when a session is auto-created from the first message.
  // This prevents ChatInterface from remounting and losing the in-flight stream.
  const [chatKey, setChatKey] = useState<string>(urlSessionId || "new");
  const isAutoCreatingRef = useRef(false);

  // Sync from URL when it changes (e.g. browser back/forward)
  useEffect(() => {
    setActiveSessionId(urlSessionId);
    // Only update chat key if this wasn't an auto-creation
    if (!isAutoCreatingRef.current) {
      setChatKey(urlSessionId || "new");
    }
    isAutoCreatingRef.current = false;
  }, [urlSessionId]);

  // Load messages when chat key changes (explicit navigation only)
  useEffect(() => {
    if (chatKey && !chatKey.startsWith("new")) {
      setLoadingMessages(true);
      getChatMessages(chatKey).then(({ messages }) => {
        setInitialMessages(messages || []);
        setLoadingMessages(false);
      });
    } else {
      setInitialMessages([]);
    }
  }, [chatKey]);

  // Sync sessions from server on revalidation
  useEffect(() => {
    setSessions(initialSessions);
  }, [initialSessions]);

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setChatKey(`new-${Date.now()}`);
    setInitialMessages([]);
    window.history.pushState(null, "", `/s/${schoolSlug}/parent/chat`);
  }, [schoolSlug]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      setChatKey(sessionId); // forces remount with new session's messages
      window.history.pushState(null, "", `/s/${schoolSlug}/parent/chat?session=${sessionId}`);
    },
    [schoolSlug]
  );

  const handleSessionCreated = useCallback(
    (sessionId: string) => {
      isAutoCreatingRef.current = true;
      // Update sidebar + URL, but do NOT change chatKey — ChatInterface stays alive
      setSessions((prev) => [
        { id: sessionId, user_id: "", school_id: schoolId, title: "New chat", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ...prev,
      ]);
      setActiveSessionId(sessionId);
      window.history.replaceState(null, "", `/s/${schoolSlug}/parent/chat?session=${sessionId}`);
    },
    [schoolSlug, schoolId]
  );

  return (
    <div className="relative flex h-full overflow-hidden">
      <MagicBentoCard enableBorderGlow enableParticles={false} className="h-full">
        <ChatHistorySidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          schoolId={schoolId}
        />
      </MagicBentoCard>
      <MagicBentoCard enableBorderGlow enableParticles={false} className="flex-1 min-w-0 h-full">
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
