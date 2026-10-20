"use client";

import { useState, useEffect, useCallback } from "react";
import { ChatInterface } from "@/components/chat/chat-interface";
import { ChatHistorySidebar } from "@/components/chat/chat-history-sidebar";
import { MagicBentoCard } from "@/components/magic-bento";
import { getChatMessages, getChatSessions } from "@/actions/chat";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/logo-spinner";
import {
  applyLoadedMessages,
  bindCreatedSession,
  canMountChat,
  initialChatView,
  newChatView,
  openChatView,
  selectChatView,
  type ChatView,
} from "@/lib/chat/chat-view";
import type { ChatSession, ChatMessage } from "@/lib/types";

interface ChatPageClientProps {
  sessions: ChatSession[];
  suggestedQuestions?: string[];
  welcomeMessage?: string | null;
  schoolId: string;
  schoolSlug: string;
  aiConsentGiven: boolean;
  /** ?chat=<id>: reopen this chat instead of starting a fresh one. */
  initialChatId?: string | null;
}

export function ChatPageClient({
  sessions: initialSessions,
  suggestedQuestions,
  welcomeMessage,
  schoolId,
  aiConsentGiven,
  initialChatId,
}: ChatPageClientProps) {
  // Open on a fresh chat; a past chat only via ?chat=<id> or the sidebar.
  const [view, setView] = useState<ChatView<ChatMessage>>(() =>
    initialChatView(initialSessions, initialChatId)
  );
  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
  const activeSessionId = view.sessionId;

  // A reopened chat is fetched before ChatInterface mounts for it, so the
  // parent can never send into a chat whose history isn't on screen.
  const loadingId = view.messages === null && !view.error ? view.key : null;
  useEffect(() => {
    if (!loadingId) return;
    let cancelled = false;
    getChatMessages(loadingId)
      .catch(() => ({ error: "Please try again.", messages: [] }))
      .then((result) => {
        if (!cancelled) {
          setView((v) =>
            applyLoadedMessages(v, loadingId, {
              messages: result.messages as ChatMessage[],
              error: result.error,
            })
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadingId]);

  // Keep ?chat= in step so a reload reopens the same chat (or a fresh one).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeSessionId) url.searchParams.set("chat", activeSessionId);
    else url.searchParams.delete("chat");
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, "", url.href);
    }
  }, [activeSessionId]);

  const refreshSessions = useCallback(async () => {
    const { sessions: latest, error } = await getChatSessions(schoolId);
    if (!error) setSessions(latest as ChatSession[]);
  }, [schoolId]);

  // Start a fresh chat. Past chats stay in history (pruned server-side to the
  // last 10); nothing is deleted here.
  const handleNewChat = useCallback(() => {
    setView(newChatView(`new-${Date.now()}`));
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    setView((v) => selectChatView(v, sessionId));
  }, []);

  const handleRetry = useCallback(() => {
    setView((v) => (v.sessionId ? openChatView(v.sessionId) : v));
  }, []);

  const handleSessionCreated = useCallback(
    (sessionId: string) => {
      setView((v) => bindCreatedSession(v, sessionId));
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
        {canMountChat(view) ? (
          <ChatInterface
            key={view.key}
            sessionId={activeSessionId || undefined}
            initialMessages={view.messages ?? []}
            onSessionCreated={handleSessionCreated}
            onNewChat={handleNewChat}
            sessionTitle={activeSession?.title ?? undefined}
            suggestedQuestions={suggestedQuestions}
            welcomeMessage={welcomeMessage}
            schoolId={schoolId}
            aiConsentGiven={aiConsentGiven}
          />
        ) : view.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load this chat. {view.error}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Try again
              </Button>
              <Button size="sm" onClick={handleNewChat}>
                New chat
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <LogoSpinner size={24} />
          </div>
        )}
      </MagicBentoCard>
    </div>
  );
}
