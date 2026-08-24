import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { PageTransition } from "@/components/motion";
import { BlackbaudReviewClient } from "./client";
import type { EventCalendar, StagedBlackbaudEvent } from "@/lib/types";

// Review queue for events synced from a school's Blackbaud calendar feeds.
// Nothing here is visible to parents — a staged occurrence only reaches
// public.events once an admin approves it.

// The queue is a working surface, not an archive: an admin clears it in a
// sitting. Cap the page so a first sync of a full school year doesn't render
// thousands of rows at once.
const PAGE_SIZE = 300;

export default async function BlackbaudReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const [{ data: staged }, { data: eventCalendars }, { data: feeds }] =
    await Promise.all([
      supabase
        .from("blackbaud_events")
        .select(
          "*, suggestedCalendars:event_calendars(id, school_id, kind, name, color, sort_order, created_at)"
        )
        .eq("school_id", school.id)
        .in("status", ["pending", "superseded"])
        .order("local_date", { ascending: true })
        .limit(PAGE_SIZE),
      supabase
        .from("event_calendars")
        .select("*")
        .eq("school_id", school.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("blackbaud_calendar_feeds")
        .select("id, label")
        .eq("school_id", school.id),
    ]);

  const feedLabels = new Map(
    (feeds ?? []).map((feed) => [feed.id as string, feed.label as string])
  );

  const events = ((staged ?? []) as StagedBlackbaudEvent[]).map((event) => ({
    ...event,
    feedLabel: feedLabels.get(event.feed_id) ?? "Unknown feed",
  }));

  return (
    <PageTransition>
      <BlackbaudReviewClient
        events={events}
        eventCalendars={(eventCalendars ?? []) as EventCalendar[]}
        schoolId={school.id}
        schoolSlug={slug}
        truncated={events.length >= PAGE_SIZE}
      />
    </PageTransition>
  );
}
