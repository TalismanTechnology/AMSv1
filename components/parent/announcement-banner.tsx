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
    <div className="space-y-2 px-4 pt-3 md:px-6">
      {announcements.map((a) => {
        const isUrgent = a.priority === "urgent";
        return (
          <div
            key={a.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-2.5 text-sm"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={cn(
                  "shrink-0",
                  isUrgent ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {isUrgent ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Megaphone className="h-4 w-4" />
                )}
              </span>
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="truncate font-semibold text-ink">{a.title}</span>
                <span className="hidden truncate text-xs text-ink-soft sm:inline">
                  {a.content.slice(0, 80)}
                  {a.content.length > 80 ? "..." : ""}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 rounded-lg p-0 text-ink-soft hover:bg-secondary hover:text-ink"
              onClick={() => handleDismiss(a.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
