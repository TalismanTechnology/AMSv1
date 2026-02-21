"use client";

import { useState } from "react";
import { X, AlertTriangle, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissAnnouncement } from "@/actions/announcements";
import { cn } from "@/lib/utils";

interface BannerAnnouncement {
  id: string;
  title: string;
  content: string;
  priority: string;
}

interface AnnouncementBannerProps {
  announcements: BannerAnnouncement[];
}

export function AnnouncementBanner({
  announcements: initial,
}: AnnouncementBannerProps) {
  const [announcements, setAnnouncements] = useState(initial);

  async function handleDismiss(id: string) {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    await dismissAnnouncement(id);
  }

  if (announcements.length === 0) return null;

  return (
    <div>
      {announcements.map((a) => (
        <div
          key={a.id}
          className={cn(
            "flex items-center justify-between gap-4 border-b neon-divider px-6 py-2 text-sm",
            a.priority === "urgent"
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/5 text-primary"
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            {a.priority === "urgent" ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <Megaphone className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate font-medium">{a.title}</span>
            <span className="hidden truncate text-xs opacity-70 sm:inline">
              &mdash; {a.content.slice(0, 80)}
              {a.content.length > 80 ? "..." : ""}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 shrink-0 p-0"
            onClick={() => handleDismiss(a.id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
