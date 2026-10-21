"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ChatHistoryPanelProps } from "@/components/chat/chat-history-sidebar";

// Lets the chat page put its chat list into the mobile navigation drawer
// (ParentMobileHeader's existing hamburger menu) while it is mounted.

interface Bridge {
  panel: ChatHistoryPanelProps | null;
  setPanel: (panel: ChatHistoryPanelProps | null) => void;
}

const ChatHistoryBridgeContext = createContext<Bridge | null>(null);

export function ChatHistoryBridgeProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<ChatHistoryPanelProps | null>(null);
  return (
    <ChatHistoryBridgeContext.Provider value={{ panel, setPanel }}>
      {children}
    </ChatHistoryBridgeContext.Provider>
  );
}

/** The chat list to show in the drawer, if the chat page is open. */
export function useChatHistoryPanel(): ChatHistoryPanelProps | null {
  return useContext(ChatHistoryBridgeContext)?.panel ?? null;
}

/** Chat page: publish its (memoized) list to the drawer while mounted. */
export function usePublishChatHistoryPanel(panel: ChatHistoryPanelProps) {
  const setPanel = useContext(ChatHistoryBridgeContext)?.setPanel;
  useEffect(() => {
    setPanel?.(panel);
  }, [panel, setPanel]);
  useEffect(() => () => setPanel?.(null), [setPanel]);
}
