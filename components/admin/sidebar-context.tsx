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
}

const SidebarContext = createContext<SidebarContextType | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);
  const [folders, setFolders] = useState<Folder[]>([]);

  useEffect(() => {
    // Auto-collapse on mobile
    const mq = window.matchMedia("(max-width: 768px)");
    if (mq.matches) setCollapsed(true);
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
      value={{ collapsed, setCollapsed, toggle, folders, setFolders }}
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
