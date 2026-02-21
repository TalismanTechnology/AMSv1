import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { ParentEventsClient } from "./client";
import { PageTransition } from "@/components/motion";

export default async function ParentEventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  // Fetch events from 3 months ago to 12 months ahead for calendar view
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const oneYearAhead = new Date();
  oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("school_id", school.id)
    .gte("date", threeMonthsAgo.toISOString().split("T")[0])
    .lte("date", oneYearAhead.toISOString().split("T")[0])
    .order("date", { ascending: true });

  return <PageTransition><ParentEventsClient events={events || []} /></PageTransition>;
}
