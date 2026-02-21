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

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("school_id", school.id)
    .order("date", { ascending: true });

  return (
    <PageTransition>
      <EventsClient
        events={events || []}
        schoolId={school.id}
        schoolSlug={slug}
      />
    </PageTransition>
  );
}
