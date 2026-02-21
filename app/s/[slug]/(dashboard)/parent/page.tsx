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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  // Fetch recent announcements
  const now = new Date().toISOString();
  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, content, priority, created_at")
    .eq("school_id", school.id)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false })
    .limit(3);

  // Fetch upcoming events
  const today = new Date().toISOString().split("T")[0];
  const { data: events } = await supabase
    .from("events")
    .select("id, title, date, start_time, location, event_type")
    .eq("school_id", school.id)
    .gte("date", today)
    .order("date", { ascending: true })
    .limit(3);

  return (
    <DashboardClient
      userName={profile?.full_name || user.email || "Parent"}
      announcements={announcements || []}
      events={events || []}
      schoolSlug={slug}
    />
  );
}
