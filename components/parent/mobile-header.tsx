"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { ParentSidebarContent } from "./parent-sidebar";
import { useSchool } from "@/components/shared/school-context";
import { ChatHistoryList } from "@/components/chat/chat-history-sidebar";
import { useChatHistoryPanel } from "./chat-history-bridge";

export function ParentMobileHeader() {
  const [open, setOpen] = useState(false);
  const { school } = useSchool();
  // On the chat page, the drawer also lists the parent's chats.
  const chats = useChatHistoryPanel();

  return (
    // env() insets are 0 inside the iOS app shell, which already sits below
    // the status bar, so this only pads in Safari / the installed web app.
    <div className="flex items-center justify-between border-b border-border bg-background pt-[calc(0.5rem_+_env(safe-area-inset-top))] pb-2 pl-[calc(1rem_+_env(safe-area-inset-left))] pr-[calc(1rem_+_env(safe-area-inset-right))] md:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center">
          <Logo size={20} className="text-primary" />
        </span>
        <span className="truncate text-sm font-semibold tracking-[-0.01em] text-ink">
          {school.name}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="size-11 shrink-0 rounded-xl border border-ink/20 bg-secondary text-ink shadow-sm hover:bg-secondary/70 hover:text-ink active:bg-secondary/60"
      >
        <Menu className="size-6" strokeWidth={2.25} />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        {/* Padded by the safe-area insets so the drawer's header sits below
            the notch / status bar. */}
        <SheetContent
          side="left"
          className={cn(
            "p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]",
            chats ? "w-72" : "w-64"
          )}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full min-h-0 flex-col">
            <ParentSidebarContent onNavigate={() => setOpen(false)} forceExpanded>
              {chats && (
                <ChatHistoryList
                  {...chats}
                  className="h-full"
                  onNewChat={() => {
                    setOpen(false);
                    chats.onNewChat();
                  }}
                  onSelect={(id) => {
                    setOpen(false);
                    chats.onSelect(id);
                  }}
                />
              )}
            </ParentSidebarContent>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
