"use client";

import { useState } from "react";
import { Menu, Search } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { AdminSidebarContent } from "./admin-sidebar";
import { useCommandPalette } from "./command-palette";
import { useSchool } from "@/components/shared/school-context";
import { NotificationBell } from "@/components/parent/notification-bell";

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const { school } = useSchool();
  const { open: openSearch } = useCommandPalette();

  return (
    // env() insets are 0 inside the iOS app shell, which already sits below
    // the status bar, so this only pads in Safari / the installed web app.
    <div className="flex items-center justify-between border-b border-border bg-background pt-[calc(0.75rem_+_env(safe-area-inset-top))] pb-3 pl-[calc(1rem_+_env(safe-area-inset-left))] pr-[calc(1rem_+_env(safe-area-inset-right))] md:hidden">
      <div className="flex items-center gap-2.5">
        <Logo size={22} className="text-ink" />
        <span className="truncate text-sm font-semibold tracking-[-0.01em] text-ink">
          {school.name}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={openSearch}
          aria-label="Search pages and settings"
          className="size-11 shrink-0 rounded-xl text-ink hover:bg-secondary/70 hover:text-ink"
        >
          <Search className="size-5" strokeWidth={2.25} />
        </Button>
        <NotificationBell />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="size-11 shrink-0 rounded-xl border border-ink/20 bg-secondary text-ink shadow-sm hover:bg-secondary/70 hover:text-ink active:bg-secondary/60"
        >
          <Menu className="size-6" strokeWidth={2.25} />
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-64 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">
            <AdminSidebarContent onNavigate={() => setOpen(false)} forceExpanded />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
