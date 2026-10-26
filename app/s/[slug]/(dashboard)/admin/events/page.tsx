import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { EventsClient } from "./client";
import { PageTransition } from "@/components/motion";
import { LABEL_COLUMNS } from "@/lib/calendar-labels";
import type { LabelWithLink } from "@/components/admin/calendar-labels-panel";
import type { CalendarLabel } from "@/lib/types";

function linkHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "iCal link";
  }
}

export default async function EventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const [{ data: events }, { data: labels }, { data: feeds }, { data: documents }] =
    await Promise.all([
      supabase
        .from("events")
        .select("*")
        .eq("school_id", school.id)
        .order("date", { ascending: true }),
      supabase
        .from("calendar_labels")
        .select(LABEL_COLUMNS)
        .eq("school_id", school.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("blackbaud_calendar_feeds")
        .select("label_id, url, timezone, is_active, last_synced_at, last_error")
        .eq("school_id", school.id)
        .not("label_id", "is", null),
      supabase
        .from("documents")
        .select("id, title, file_type")
        .eq("school_id", school.id)
        .eq("status", "ready")
        .order("created_at", { ascending: false }),
    ]);

  // Only the link's host reaches the browser: the full URL is a credential
  // for the school's calendar.
  const linkByLabel = new Map(
    (feeds ?? []).map((feed) => [
      feed.label_id as string,
      {
        host: linkHost(feed.url as string),
        timezone: feed.timezone as string,
        isActive: feed.is_active as boolean,
        lastSyncedAt: feed.last_synced_at as string | null,
        lastError: feed.last_error as string | null,
      },
    ])
  );
  const labelsWithLinks: LabelWithLink[] = ((labels ?? []) as CalendarLabel[]).map((label) => ({
    ...label,
    link: linkByLabel.get(label.id) ?? null,
  }));

  return (
    <PageTransition>
      <EventsClient
        events={events || []}
        labels={labelsWithLinks}
        documents={documents || []}
        schoolId={school.id}
        schoolSlug={slug}
      />
    </PageTransition>
  );
}
