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
    <div className="flex items-center justify-between border-b border-border bg-background px-4 py-3 md:hidden">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center">
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
        className="rounded-lg text-ink-soft hover:bg-secondary hover:text-ink"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">
            <ParentSidebarContent onNavigate={() => setOpen(false)} forceExpanded />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
