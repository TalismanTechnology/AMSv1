"use client";

import { Megaphone, AlertTriangle, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Announcement, AnnouncementPriority } from "@/lib/types";

const PRIORITY_COLORS: Record<AnnouncementPriority, string> = {
  normal: "bg-secondary text-secondary-foreground",
  important: "bg-chart-1/15 text-chart-1",
  urgent: "bg-destructive/15 text-destructive",
};

interface ParentAnnouncementsClientProps {
  announcements: Announcement[];
}

export function ParentAnnouncementsClient({
  announcements,
}: ParentAnnouncementsClientProps) {
  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  const header = (
    <header className="mb-6 md:mb-10">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
        Announcements
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Notices, reminders, and important updates.
      </p>
    </header>
  );

  if (announcements.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-12 pt-6 md:px-8 md:pb-16 md:pt-12">
        {header}
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Megaphone className="mb-3 h-6 w-6 text-muted-foreground" />
          <h3 className="text-base font-semibold text-ink">No announcements</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Check back later for school announcements.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-6 md:px-8 md:pb-16 md:pt-12">
      {header}
      <div className="divide-y divide-border">
        {announcements.map((a) => {
          const isUrgent = a.priority === "urgent";
          return (
            <article key={a.id} className="py-5 first:pt-0 sm:py-6">
              <div className="flex items-start gap-3">
                <span
                  className={
                    "mt-0.5 shrink-0 " +
                    (isUrgent ? "text-destructive" : "text-muted-foreground")
                  }
                >
                  {isUrgent ? (
                    <AlertTriangle className="h-[18px] w-[18px]" />
                  ) : (
                    <Megaphone className="h-[18px] w-[18px]" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold tracking-[-0.01em] text-ink [overflow-wrap:anywhere]">
                    {a.title}
                  </h2>
                  {/* Meta sits under the title so long titles keep the full width. */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {a.priority !== "normal" && (
                      <Badge className={PRIORITY_COLORS[a.priority]}>
                        {a.priority}
                      </Badge>
                    )}
                    {a.pinned && (
                      <span className="flex items-center gap-1">
                        <Pin className="h-3 w-3" />
                        Pinned
                      </span>
                    )}
                    <span suppressHydrationWarning>{timeAgo(a.created_at)}</span>
                  </div>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft [overflow-wrap:anywhere] sm:pl-[30px]">
                {a.content}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
