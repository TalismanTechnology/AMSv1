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
        "grid grid-cols-[1fr_28px] items-center gap-1 border-b pl-4 pr-2 py-3 transition-colors hover:bg-accent cursor-pointer",
        isActive && "bg-accent border-l-2 border-l-primary"
      )}
      onClick={onSelect}
    >
      <div className="overflow-hidden">
        <p className="truncate text-sm font-medium text-foreground">
          {session.title || "New chat"}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <TimeAgo date={session.updated_at} />
        </p>
      </div>
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete chat"
      >
        <Trash2 className="h-4 w-4" />
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
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Chat History</h3>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setShowSearch(true)} title="Search chats">
            <Search className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onNewChat} title="New chat">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
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
      <aside className="flex h-full w-64 shrink-0 flex-col overflow-hidden border-r bg-card metallic-surface neon-border">
        <SidebarContent {...props} />
      </aside>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="absolute left-3 top-3 z-20 md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <History className="h-5 w-5" />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-[85vw] max-w-72 flex-col p-0">
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
