"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ChatInterface } from "@/components/chat/chat-interface";
import {
  ChatHistorySidebar,
  type ChatHistoryPanelProps,
} from "@/components/chat/chat-history-sidebar";
import { usePublishChatHistoryPanel } from "@/components/parent/chat-history-bridge";
import { MagicBentoCard } from "@/components/magic-bento";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/logo-spinner";
import {
  deleteChatSession,
  getChatMessages,
  getChatSessions,
  renameChatSession,
} from "@/actions/chat";
import {
  applyLoadedMessages,
  bindCreatedSession,
  canMountChat,
  chatDisplayTitle,
  loadedChatView,
  newChatView,
  openChatView,
  selectChatView,
  sortChatsByActivity,
  type ChatView,
} from "@/lib/chat/chat-view";
import type { ChatListItem } from "@/lib/chat/history";
import type { ChatMessage } from "@/lib/types";

interface ChatPageClientProps {
  /** The parent's chats in this school, most recent first (lib/chat/history.ts). */
  chats: ChatListItem[];
  /** The chat ?chat=<id> opened, with its messages; null opens a new chat. */
  openChat: { session: ChatListItem; messages: ChatMessage[] } | null;
  suggestedQuestions?: string[];
  welcomeMessage?: string | null;
  schoolId: string;
  /** Header text for a new chat (parentChatHeading). */
  heading: string;
  aiConsentGiven: boolean;
}

export function ChatPageClient({
  chats,
  openChat,
  suggestedQuestions,
  welcomeMessage,
  schoolId,
  heading,
  aiConsentGiven,
}: ChatPageClientProps) {
  const [view, setView] = useState<ChatView<ChatMessage>>(() =>
    openChat ? loadedChatView(openChat.session.id, openChat.messages) : newChatView()
  );
  // The opened chat is listed even if it fell outside the list's limit.
  const [sessions, setSessions] = useState<ChatListItem[]>(() =>
    openChat && !chats.some((s) => s.id === openChat.session.id)
      ? sortChatsByActivity([openChat.session, ...chats])
      : chats
  );
  const activeSessionId = view.sessionId;

  // A reopened chat is fetched before ChatInterface mounts for it, so the
  // parent can never send into a chat whose history isn't on screen.
  const loadingId = view.messages === null && !view.error ? view.key : null;
  useEffect(() => {
    if (!loadingId) return;
    let cancelled = false;
    getChatMessages(loadingId, schoolId)
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
  }, [loadingId, schoolId]);

  // Keep ?chat= in step so a reload reopens the same chat (or a new one).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeSessionId) url.searchParams.set("chat", activeSessionId);
    else url.searchParams.delete("chat");
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, "", url.href);
    }
  }, [activeSessionId]);

  // Only the latest list fetch lands.
  const refreshSeq = useRef(0);
  const refreshSessions = useCallback(async () => {
    const seq = ++refreshSeq.current;
    const { sessions: latest, error } = await getChatSessions(schoolId);
    if (!error && seq === refreshSeq.current) setSessions(latest);
  }, [schoolId]);

  const startNewChat = useCallback(() => {
    setView(newChatView(`new-${Date.now()}`));
  }, []);

  const handleSelect = useCallback((sessionId: string) => {
    setView((v) => selectChatView(v, sessionId));
  }, []);

  const handleRename = useCallback(
    async (sessionId: string, title: string) => {
      const result = await renameChatSession(sessionId, schoolId, title).catch(() => null);
      if (!result || "error" in result) {
        return result?.error ?? "Couldn't rename the chat. Please try again.";
      }
      setSessions((list) =>
        list.map((s) => (s.id === sessionId ? { ...s, title: result.title } : s))
      );
      return null;
    },
    [schoolId]
  );

  const handleDelete = useCallback(
    async (sessionId: string) => {
      const result = await deleteChatSession(sessionId, schoolId).catch(() => ({
        error: "Couldn't delete the chat. Please try again.",
      }));
      if ("error" in result && result.error) return result.error;
      setSessions((list) => list.filter((s) => s.id !== sessionId));
      const key = `new-${Date.now()}`;
      setView((v) => (v.sessionId === sessionId ? newChatView(key) : v));
      return null;
    },
    [schoolId]
  );

  // The server reported the session the chat mounted as `key` wrote into (a
  // new chat's first question). Bound only if that chat is still open.
  const handleSessionCreated = useCallback(
    (key: string, sessionId: string) => {
      setView((v) => bindCreatedSession(v, key, sessionId));
      void refreshSessions();
    },
    [refreshSessions]
  );

  // A question was sent: the open chat moves to the top of the list.
  const handleSend = useCallback(() => {
    if (!activeSessionId) return;
    const now = new Date().toISOString();
    setSessions((list) =>
      sortChatsByActivity(
        list.map((s) => (s.id === activeSessionId ? { ...s, updated_at: now } : s))
      )
    );
  }, [activeSessionId]);

  const handleRetry = useCallback(() => {
    setView((v) => (v.sessionId ? openChatView(v.sessionId) : v));
  }, []);

  const panel = useMemo<ChatHistoryPanelProps>(
    () => ({
      sessions,
      activeSessionId,
      onNewChat: startNewChat,
      onSelect: handleSelect,
      onRename: handleRename,
      onDelete: handleDelete,
    }),
    [sessions, activeSessionId, startNewChat, handleSelect, handleRename, handleDelete]
  );
  // Small screens: the same list, in the navigation drawer.
  usePublishChatHistoryPanel(panel);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const viewKey = view.key;

  return (
    <div className="relative flex h-full overflow-hidden">
      <ChatHistorySidebar {...panel} />
      <MagicBentoCard enableParticles={false} className="flex-1 min-w-0 min-h-0 h-full">
        {canMountChat(view) ? (
          <ChatInterface
            key={view.key}
            sessionId={activeSessionId}
            initialMessages={view.messages ?? []}
            onSessionCreated={(sessionId) => handleSessionCreated(viewKey, sessionId)}
            onSend={handleSend}
            onNewChat={startNewChat}
            heading={activeSession ? chatDisplayTitle(activeSession.title) : heading}
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
              <Button size="sm" onClick={startNewChat}>
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
