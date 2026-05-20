"use client";

import { useState } from "react";
import { Plus, History, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { deleteChatSession } from "@/actions/chat";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "sonner";
import { ChatSearch } from "./chat-search";
import type { ChatSession } from "@/lib/types";

interface ChatHistorySidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  schoolId?: string;
}

function SessionRow({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <div
      className={cn(
        "group relative grid cursor-pointer grid-cols-[1fr_24px] items-center gap-1 py-2.5 pl-3 pr-2 transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
      )}
      onClick={onSelect}
    >
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-sm bg-primary"
        />
      )}
      <div className="overflow-hidden">
        <p className="truncate text-[13px] font-medium">
          {session.title || "New chat"}
        </p>
        <p className="mt-0.5 truncate text-[10px] font-mono uppercase tracking-[0.12em] text-sidebar-foreground/40">
          <TimeAgo date={session.updated_at} />
        </p>
      </div>
      <button
        type="button"
        className="flex h-6 w-6 items-center justify-center rounded-sm text-sidebar-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete chat"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SidebarContent({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  schoolId,
}: ChatHistorySidebarProps) {
  const [showSearch, setShowSearch] = useState(false);

  if (showSearch) {
    return (
      <ChatSearch
        onSelectSession={(id) => {
          setShowSearch(false);
          onSelectSession(id);
        }}
        onClose={() => setShowSearch(false)}
        schoolId={schoolId}
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-3 py-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-sidebar-foreground/50">
          Chat History
        </p>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-sidebar-foreground/55 hover:text-sidebar-foreground"
            onClick={() => setShowSearch(true)}
            title="Search chats"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-sidebar-foreground/55 hover:text-sidebar-foreground"
            onClick={onNewChat}
            title="New chat"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {sessions.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-sidebar-foreground/40">
            No past conversations
          </div>
        ) : (
          sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              isActive={activeSessionId === session.id}
              onSelect={() => onSelectSession(session.id)}
              onDelete={async () => {
                const result = await deleteChatSession(session.id, schoolId!);
                if (result.error) {
                  toast.error(result.error);
                } else {
                  toast.success("Chat deleted");
                  if (activeSessionId === session.id) onNewChat();
                }
              }}
            />
          ))
        )}
      </ScrollArea>
    </>
  );
}

export function ChatHistorySidebar(props: ChatHistorySidebarProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isDesktop) {
    return (
      <aside className="flex h-full w-64 shrink-0 flex-col overflow-hidden bg-sidebar">
        <SidebarContent {...props} />
      </aside>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-2 top-2 z-10 md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <History className="h-5 w-5" />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-72 flex-col p-0">
          <SidebarContent
            {...props}
            onNewChat={() => {
              setMobileOpen(false);
              props.onNewChat();
            }}
            onSelectSession={(id) => {
              setMobileOpen(false);
              props.onSelectSession(id);
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
