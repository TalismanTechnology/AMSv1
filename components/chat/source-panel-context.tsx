"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { ChatSource } from "@/lib/types";

interface SourcePanelState {
  isOpen: boolean;
  activeSource: ChatSource | null;
  fullContent: string | null;
  isLoadingContent: boolean;
}

interface SourcePanelContextValue extends SourcePanelState {
  openSource: (source: ChatSource) => void;
  closePanel: () => void;
}

const SourcePanelContext = createContext<SourcePanelContextValue | null>(null);

export function SourcePanelProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<SourcePanelState>({
    isOpen: false,
    activeSource: null,
    fullContent: null,
    isLoadingContent: false,
  });

  const openSource = useCallback(async (source: ChatSource) => {
    setState({
      isOpen: true,
      activeSource: source,
      fullContent: null,
      isLoadingContent: true,
    });

    try {
      const res = await fetch(`/api/documents/${source.document_id}/content`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setState((prev) => ({
        ...prev,
        fullContent: data.content,
        isLoadingContent: false,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        isLoadingContent: false,
      }));
    }
  }, []);

  const closePanel = useCallback(() => {
    setState({
      isOpen: false,
      activeSource: null,
      fullContent: null,
      isLoadingContent: false,
    });
  }, []);

  return (
    <SourcePanelContext.Provider value={{ ...state, openSource, closePanel }}>
      {children}
    </SourcePanelContext.Provider>
  );
}

export function useSourcePanel() {
  const ctx = useContext(SourcePanelContext);
  if (!ctx)
    throw new Error("useSourcePanel must be used within SourcePanelProvider");
  return ctx;
}
