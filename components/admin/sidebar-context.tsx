"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { Folder } from "@/lib/types";

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
  folders: Folder[];
  setFolders: (folders: Folder[]) => void;
  /** Counts shown beside nav items, by item key (e.g. open conflicts). */
  badges: Record<string, number>;
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export function SidebarProvider({
  children,
  badges = {},
}: {
  children: React.ReactNode;
  badges?: Record<string, number>;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [folders, setFolders] = useState<Folder[]>([]);

  useEffect(() => {
    // Auto-collapse on mobile. It already starts collapsed, so only a later
    // switch to a narrow viewport needs handling.
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setCollapsed(true);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  return (
    <SidebarContext.Provider
      value={{ collapsed, setCollapsed, toggle, folders, setFolders, badges }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
