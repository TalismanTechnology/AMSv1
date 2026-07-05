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
    <header className="mb-10">
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
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-12 md:px-8">
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
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-12 md:px-8">
      {header}
      <div className="divide-y divide-border">
        {announcements.map((a) => {
          const isUrgent = a.priority === "urgent";
          return (
            <article key={a.id} className="py-6 first:pt-0">
              <div className="flex items-start justify-between gap-3">
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
                  <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">
                    {a.title}
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {a.pinned && <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
                  {a.priority !== "normal" && (
                    <Badge className={PRIORITY_COLORS[a.priority]}>
                      {a.priority}
                    </Badge>
                  )}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap pl-[30px] text-sm leading-relaxed text-ink-soft">
                {a.content}
              </p>
              <p className="mt-3 pl-[30px] text-xs text-muted-foreground">
                {timeAgo(a.created_at)}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
