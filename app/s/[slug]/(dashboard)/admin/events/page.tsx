import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { EventsClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function EventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  const [{ data: events }, { data: eventCalendars }, { data: documents }] =
    await Promise.all([
      supabase
        .from("events")
        .select(
          "*, calendars:event_calendars(id, school_id, kind, name, color, sort_order, created_at)"
        )
        .eq("school_id", school.id)
        .order("date", { ascending: true }),
      supabase
        .from("event_calendars")
        .select("*")
        .eq("school_id", school.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("documents")
        .select("id, title, file_type")
        .eq("school_id", school.id)
        .eq("status", "ready")
        .order("created_at", { ascending: false }),
    ]);

  return (
    <PageTransition>
      <EventsClient
        events={events || []}
        eventCalendars={eventCalendars || []}
        documents={documents || []}
        schoolId={school.id}
        schoolSlug={slug}
      />
    </PageTransition>
  );
}
