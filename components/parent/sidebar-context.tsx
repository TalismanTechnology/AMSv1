"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";

interface ParentSidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
  userName?: string;
}

const ParentSidebarContext = createContext<ParentSidebarContextType | null>(null);

interface ParentSidebarProviderProps {
  children: React.ReactNode;
  userName?: string;
}

export function ParentSidebarProvider({
  children,
  userName,
}: ParentSidebarProviderProps) {
  const [collapsed, setCollapsed] = useState(true);

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
    <ParentSidebarContext.Provider
      value={{ collapsed, setCollapsed, toggle, userName }}
    >
      {children}
    </ParentSidebarContext.Provider>
  );
}

export function useParentSidebar() {
  const ctx = useContext(ParentSidebarContext);
  if (!ctx)
    throw new Error(
      "useParentSidebar must be used within ParentSidebarProvider"
    );
  return ctx;
}
