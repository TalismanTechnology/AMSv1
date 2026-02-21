"use client";

import { Megaphone, AlertTriangle, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MagicBentoGrid, MagicBentoCard } from "@/components/magic-bento";
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

  if (announcements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Megaphone className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-lg font-medium text-foreground">
          No announcements
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Check back later for school announcements.
        </p>
      </div>
    );
  }

  return (
    <MagicBentoGrid className="mx-auto max-w-2xl space-y-4 p-4 md:p-8">
      <h1 className="text-2xl font-bold text-foreground">Announcements</h1>
      {announcements.map((a) => (
        <MagicBentoCard key={a.id} enableBorderGlow className="rounded-xl">
        <Card
          className={
            a.priority === "urgent"
              ? "border-destructive/40"
              : a.priority === "important"
                ? "border-chart-1/40"
                : undefined
          }
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {a.priority === "urgent" ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <CardTitle className="text-lg">{a.title}</CardTitle>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {a.pinned && (
                  <Pin className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <Badge className={PRIORITY_COLORS[a.priority]}>
                  {a.priority}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {a.content}
            </p>
            <p className="mt-3 text-xs text-muted-foreground/60">
              {timeAgo(a.created_at)}
            </p>
          </CardContent>
        </Card>
        </MagicBentoCard>
      ))}
    </MagicBentoGrid>
  );
}
