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
    <div className="flex items-center justify-between border-b bg-card metallic-surface neon-divider px-4 py-3 md:hidden">
      <div className="flex items-center gap-2">
        <Logo size={24} className="text-primary drop-shadow-[0_0_8px_var(--glow-primary)] drop-shadow-[0_0_12px_oklch(1_0_0/40%)]" />
        <span className="font-bold metallic-text truncate">{school.name}</span>
      </div>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">
            <ParentSidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
