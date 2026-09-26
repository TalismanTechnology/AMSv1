"use client";

import { useState } from "react";
import Link from "next/link";
import { X, AlertTriangle, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissAnnouncement } from "@/actions/announcements";
import { useSchool } from "@/components/shared/school-context";
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
  const { slug } = useSchool();
  const href = `/s/${slug}/parent/announcements`;

  async function handleDismiss(id: string) {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    await dismissAnnouncement(id);
  }

  if (announcements.length === 0) return null;

  // Phones show one banner so a stack of them can't push the page content
  // (the chat composer especially) off screen; the rest are a tap away.
  const hiddenOnMobile = announcements.length - 1;

  return (
    <div className="space-y-2 px-4 pt-3 md:px-6">
      {announcements.map((a, i) => {
        const isUrgent = a.priority === "urgent";
        return (
          <div
            key={a.id}
            className={cn(
              "items-center justify-between gap-2 rounded-xl border border-border py-1 pl-4 pr-1 text-sm sm:gap-4 sm:py-1.5 sm:pr-2",
              i > 0 ? "hidden sm:flex" : "flex"
            )}
          >
            <Link
              href={href}
              className="flex min-w-0 flex-1 items-center gap-3 py-1.5 transition-opacity hover:opacity-80"
            >
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
            </Link>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Dismiss ${a.title}`}
              className="h-9 w-9 shrink-0 rounded-lg p-0 text-ink-soft hover:bg-secondary hover:text-ink sm:h-7 sm:w-7"
              onClick={() => handleDismiss(a.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
      {hiddenOnMobile > 0 && (
        <Link
          href={href}
          className="block px-1 text-xs font-medium text-muted-foreground hover:text-ink sm:hidden"
        >
          +{hiddenOnMobile} more announcement{hiddenOnMobile !== 1 ? "s" : ""}
        </Link>
      )}
    </div>
  );
}
