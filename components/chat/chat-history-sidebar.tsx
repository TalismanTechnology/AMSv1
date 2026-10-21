"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, PanelLeftClose, PanelLeftOpen, Pencil, SquarePen, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  CHAT_TITLE_MAX,
  chatDisplayTitle,
  groupChatsByDate,
} from "@/lib/chat/chat-view";
import type { ChatListItem } from "@/lib/chat/history";

export interface ChatHistoryPanelProps {
  sessions: ChatListItem[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelect: (sessionId: string) => void;
  /** Resolves to an error message, or null once renamed. */
  onRename: (sessionId: string, title: string) => Promise<string | null>;
  /** Resolves to an error message, or null once deleted. */
  onDelete: (sessionId: string) => Promise<string | null>;
}

// The current minute, read only on the client: grouping is by the viewer's
// local day, so the server render (and hydration) shows an ungrouped list.
const subscribeMinute = (onChange: () => void) => {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
};
const getMinute = () => Math.floor(Date.now() / 60_000);
const getServerMinute = () => null;

function ChatRow({
  session,
  active,
  onSelect,
  onRename,
  onRequestDelete,
}: {
  session: ChatListItem;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => Promise<string | null>;
  onRequestDelete: () => void;
}) {
  const title = chatDisplayTitle(session.title);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  // Enter and blur both commit; only the first one counts.
  const committingRef = useRef(false);

  function startEditing() {
    setDraft(title);
    committingRef.current = false;
    setEditing(true);
  }

  async function commit() {
    if (committingRef.current) return;
    committingRef.current = true;
    const next = draft.trim();
    if (!next || next === title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const error = await onRename(next);
    setSaving(false);
    if (error) {
      toast.error(error);
      committingRef.current = false;
      return;
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <form
        className="mx-2 flex items-center gap-1 rounded-lg bg-secondary py-1 pl-2 pr-1"
        onSubmit={(e) => {
          e.preventDefault();
          void commit();
        }}
      >
        <input
          autoFocus
          value={draft}
          maxLength={CHAT_TITLE_MAX}
          disabled={saving}
          aria-label="Chat name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              committingRef.current = true;
              setEditing(false);
            }
          }}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-ink/15 bg-background px-2 py-1 text-[13px] text-ink outline-none focus:border-ink/30"
        />
        <button
          type="submit"
          disabled={saving}
          // Keep focus in the input so blur doesn't commit first.
          onMouseDown={(e) => e.preventDefault()}
          className="flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-background"
          aria-label="Save name"
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={saving}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            committingRef.current = true;
            setEditing(false);
          }}
          className="flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-background"
          aria-label="Cancel rename"
        >
          <X className="size-3.5" />
        </button>
      </form>
    );
  }

  return (
    <div
      className={cn(
        "group relative mx-2 flex items-center rounded-lg transition-colors",
        active ? "bg-secondary text-ink" : "text-ink-soft hover:bg-secondary/60"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        title={title}
        className="min-w-0 flex-1 truncate py-2 pl-3 pr-1 text-left text-[13px]"
      >
        {title}
      </button>
      <div className="flex shrink-0 items-center pr-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <button
          type="button"
          onClick={startEditing}
          className="flex size-7 items-center justify-center rounded-md text-ink-soft/70 hover:bg-background hover:text-ink"
          title="Rename"
          aria-label={`Rename “${title}”`}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onRequestDelete}
          className="flex size-7 items-center justify-center rounded-md text-ink-soft/70 hover:bg-destructive/10 hover:text-destructive"
          title="Delete"
          aria-label={`Delete “${title}”`}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** The chat list: "New chat", then past chats grouped by last activity. */
export function ChatHistoryList({
  sessions,
  activeSessionId,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
  className,
}: ChatHistoryPanelProps & { className?: string }) {
  const minute = useSyncExternalStore(subscribeMinute, getMinute, getServerMinute);
  const groups = useMemo(
    () =>
      minute === null
        ? [{ label: null, sessions }]
        : groupChatsByDate(sessions, new Date(minute * 60_000)),
    [sessions, minute]
  );
  const [pendingDelete, setPendingDelete] = useState<ChatListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const error = await onDelete(pendingDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(error);
      return;
    }
    setPendingDelete(null);
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="px-2 pb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewChat}
          className="w-full justify-start gap-2.5 rounded-lg px-3 text-ink hover:bg-secondary"
        >
          <SquarePen className="size-4" />
          New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {sessions.length === 0 ? (
          <p className="px-5 py-6 text-xs text-ink-soft/70">
            Your chats will appear here. They&apos;re kept for 30 days after
            your last message.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label ?? "all"} className="mt-2 first:mt-0">
              {group.label && (
                <h3 className="px-5 pb-1 pt-2 text-[11px] font-medium text-ink-soft/60">
                  {group.label}
                </h3>
              )}
              <div className="space-y-0.5">
                {group.sessions.map((session) => (
                  <ChatRow
                    key={session.id}
                    session={session}
                    active={session.id === activeSessionId}
                    onSelect={() => onSelect(session.id)}
                    onRename={(title) => onRename(session.id, title)}
                    onRequestDelete={() => setPendingDelete(session)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{chatDisplayTitle(pendingDelete?.title)}&rdquo; will be
              removed from your chats. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(e) => {
                // Close only once the delete has gone through.
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Desktop collapsed state, remembered across visits (in memory when
// localStorage is unavailable).
const COLLAPSED_KEY = "ams:chat-history-collapsed";
let collapsedInMemory = false;
const collapsedListeners = new Set<() => void>();
const subscribeCollapsed = (onChange: () => void) => {
  collapsedListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    collapsedListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};
const getCollapsed = () => {
  try {
    const stored = window.localStorage.getItem(COLLAPSED_KEY);
    return stored === null ? collapsedInMemory : stored === "1";
  } catch {
    return collapsedInMemory;
  }
};
const getServerCollapsed = () => false;
function storeCollapsed(collapsed: boolean) {
  collapsedInMemory = collapsed;
  try {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Private mode: kept in memory for this page view.
  }
  collapsedListeners.forEach((l) => l());
}

/**
 * Desktop (md+): a persistent, collapsible chat list beside the chat. On
 * small screens the same list lives in the navigation drawer instead
 * (ParentMobileHeader).
 */
export function ChatHistorySidebar(props: ChatHistoryPanelProps) {
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsed, getServerCollapsed);
  const toggle = () => storeCollapsed(!collapsed);

  if (collapsed) {
    return (
      <aside className="hidden h-full shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar px-1.5 py-3 md:flex">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          title="Show chats"
          aria-label="Show chats"
          className="text-ink-soft hover:bg-secondary hover:text-ink"
        >
          <PanelLeftOpen className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={props.onNewChat}
          title="New chat"
          aria-label="New chat"
          className="text-ink-soft hover:bg-secondary hover:text-ink"
        >
          <SquarePen className="size-4" />
        </Button>
      </aside>
    );
  }

  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="text-xs font-medium text-ink-soft/70">Chats</p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          title="Hide chats"
          aria-label="Hide chats"
          className="-mr-2 text-ink-soft hover:bg-secondary hover:text-ink"
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>
      <ChatHistoryList {...props} className="flex-1" />
    </aside>
  );
}
