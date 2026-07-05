"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Megaphone,
  CalendarDays,
  User,
  ArrowRight,
  MapPin,
  Clock,
  PlusCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TimeAgo } from "@/components/ui/time-ago";
import { JoinSchoolDialog } from "@/components/shared/join-school-dialog";

interface DashboardClientProps {
  userName: string;
  announcements: {
    id: string;
    title: string;
    content: string;
    priority: string;
    created_at: string;
  }[];
  events: {
    id: string;
    title: string;
    date: string;
    start_time: string | null;
    location: string | null;
    event_type: string;
  }[];
  schoolSlug: string;
}

function getQuickActions(schoolSlug: string) {
  return [
    {
      href: `/s/${schoolSlug}/parent/chat`,
      icon: MessageSquare,
      label: "Ask a Question",
      description: "Chat with the school AI assistant",
    },
    {
      href: `/s/${schoolSlug}/parent/announcements`,
      icon: Megaphone,
      label: "Announcements",
      description: "View school announcements",
    },
    {
      href: `/s/${schoolSlug}/parent/events`,
      icon: CalendarDays,
      label: "Calendar",
      description: "View school calendar",
    },
    {
      href: `/s/${schoolSlug}/parent/profile`,
      icon: User,
      label: "Profile",
      description: "Manage your account",
    },
  ];
}

export function DashboardClient({
  userName,
  announcements,
  events,
  schoolSlug,
}: DashboardClientProps) {
  const quickActions = getQuickActions(schoolSlug);
  const firstName = userName.split(" ")[0];
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-12 px-4 pb-16 pt-12 md:px-8">
        {/* Greeting */}
        <header>
          <p className="text-sm text-muted-foreground">{today}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.01em] text-ink">
            {greeting}, {firstName}
          </h1>
        </header>

        {/* Quick Actions */}
        <section aria-labelledby="quick-actions-heading">
          <h2
            id="quick-actions-heading"
            className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Shortcuts
          </h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-2.5 rounded-xl border border-border px-3.5 py-3 transition-colors hover:bg-secondary"
              >
                <action.icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium text-ink">
                  {action.label}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Recent Announcements */}
        <section aria-labelledby="announcements-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2
              id="announcements-heading"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Recent Announcements
            </h2>
            <Link
              href={`/s/${schoolSlug}/parent/announcements`}
              className="group flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-ink"
            >
              View all
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {announcements.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No announcements yet</p>
          ) : (
            <div className="divide-y divide-border">
              {announcements.map((a) => (
                <div key={a.id} className="flex items-start gap-3 py-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink">
                        {a.title}
                      </p>
                      {a.priority !== "normal" && (
                        <Badge
                          variant={
                            a.priority === "urgent" ? "destructive" : "secondary"
                          }
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {a.priority}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <TimeAgo date={a.created_at} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming Calendar */}
        <section aria-labelledby="upcoming-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2
              id="upcoming-heading"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Upcoming
            </h2>
            <Link
              href={`/s/${schoolSlug}/parent/events`}
              className="group flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-ink"
            >
              View all
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {events.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No upcoming events</p>
          ) : (
            <div className="divide-y divide-border">
              {events.map((e) => {
                const d = new Date(e.date + "T00:00:00");
                return (
                  <div key={e.id} className="flex items-center gap-3 py-3">
                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border border-border leading-none">
                      <span className="text-[0.55rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        {d.toLocaleDateString(undefined, { month: "short" })}
                      </span>
                      <span className="text-base font-semibold text-ink">
                        {d.getDate()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {e.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {e.start_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {e.start_time}
                          </span>
                        )}
                        {e.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {e.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Join Another School */}
        <button
          onClick={() => setJoinDialogOpen(true)}
          className="group flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-secondary"
        >
          <PlusCircle className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Join Another School</p>
            <p className="text-xs text-muted-foreground">
              Enter a school code to join an additional school
            </p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>

        <JoinSchoolDialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen} />
      </div>
    </div>
  );
}
