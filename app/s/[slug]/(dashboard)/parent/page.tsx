import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { DashboardClient } from "./dashboard-client";

export default async function ParentDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  // Profile and upcoming events are independent.
  const today = new Date().toISOString().split("T")[0];
  const [{ data: profile }, { data: events }] =
    await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase
        .from("events")
        .select("id, title, date, start_time, location, event_type")
        .eq("school_id", school.id)
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(3),
    ]);

  return (
    <DashboardClient
      userName={profile?.full_name || user.email || "Parent"}
      events={events || []}
      schoolSlug={slug}
    />
  );
}
