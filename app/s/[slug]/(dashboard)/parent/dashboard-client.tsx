"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { MagicBentoGrid, MagicBentoCard } from "@/components/magic-bento";
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
      color: "neon-icon-blue",
    },
    {
      href: `/s/${schoolSlug}/parent/announcements`,
      icon: Megaphone,
      label: "Announcements",
      description: "View school announcements",
      color: "neon-icon-amber",
    },
    {
      href: `/s/${schoolSlug}/parent/events`,
      icon: CalendarDays,
      label: "Calendar",
      description: "View school calendar",
      color: "neon-icon-green",
    },
    {
      href: `/s/${schoolSlug}/parent/profile`,
      icon: User,
      label: "Profile",
      description: "Manage your account",
      color: "neon-icon-purple",
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

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-8 overflow-y-auto h-full">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold metallic-heading">
          {greeting}, {firstName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening at your school
        </p>
      </motion.div>

      {/* Quick Actions */}
      <MagicBentoGrid className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <MagicBentoCard key={action.href} enableBorderGlow enableClickRipple className="rounded-xl">
            <Link href={action.href}>
              <Card className="metallic-card cursor-pointer h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <action.icon className={`h-8 w-8 ${action.color}`} />
                  <p className="font-medium text-sm">{action.label}</p>
                  <p className="text-xs text-muted-foreground hidden md:block">
                    {action.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </MagicBentoCard>
        ))}
      </MagicBentoGrid>

      {/* Join Another School */}
      <MagicBentoCard enableBorderGlow enableClickRipple className="rounded-xl">
        <Card
          className="metallic-card cursor-pointer"
          onClick={() => setJoinDialogOpen(true)}
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <PlusCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Join Another School</p>
              <p className="text-xs text-muted-foreground">
                Enter a school code to join an additional school
              </p>
            </div>
          </CardContent>
        </Card>
      </MagicBentoCard>

      <JoinSchoolDialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen} />

      <MagicBentoGrid className="grid md:grid-cols-2 gap-6">
        {/* Recent Announcements */}
        <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Announcements</CardTitle>
                <Link
                  href={`/s/${schoolSlug}/parent/announcements`}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {announcements.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No announcements yet
                </p>
              ) : (
                announcements.map((a) => (
                  <div key={a.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      {a.priority !== "normal" && (
                        <Badge
                          variant={
                            a.priority === "urgent" ? "destructive" : "secondary"
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {a.priority}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(a.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </MagicBentoCard>

        {/* Upcoming Calendar */}
        <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-xl">
          <Card className="metallic-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Upcoming</CardTitle>
                <Link
                  href={`/s/${schoolSlug}/parent/events`}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No upcoming events
                </p>
              ) : (
                events.map((e) => (
                  <div key={e.id} className="space-y-1">
                    <p className="text-sm font-medium">{e.title}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(e.date + "T00:00:00").toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" }
                        )}
                      </span>
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
                ))
              )}
            </CardContent>
          </Card>
        </MagicBentoCard>
      </MagicBentoGrid>
    </div>
  );
}
