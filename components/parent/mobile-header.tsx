"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { ParentSidebarContent } from "./parent-sidebar";
import { useSchool } from "@/components/shared/school-context";

export function ParentMobileHeader() {
  const [open, setOpen] = useState(false);
  const { school } = useSchool();

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
        <SheetContent
          side="left"
          className="w-64 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">
            <ParentSidebarContent onNavigate={() => setOpen(false)} forceExpanded />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
