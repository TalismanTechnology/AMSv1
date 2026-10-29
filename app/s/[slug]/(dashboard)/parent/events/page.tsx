import { createClient } from "@/lib/supabase/server";
import { requireSchoolContext } from "@/lib/school-context";
import { ParentEventsClient } from "./client";
import { PageTransition } from "@/components/motion";
import { LABEL_COLUMNS } from "@/lib/calendar-labels";

export default async function ParentEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /** ?date=YYYY-MM-DD opens the calendar on that day (an event cited in chat). */
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { slug } = await params;
  const { date: dateParam } = await searchParams;
  const openDate =
    typeof dateParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;
  const { school } = await requireSchoolContext(slug);

  const supabase = await createClient();

  // Fetch events from 3 months ago to 12 months ahead for calendar view
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const oneYearAhead = new Date();
  oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);

  // The day being opened is always in range, however far back or ahead.
  const from = threeMonthsAgo.toISOString().split("T")[0];
  const to = oneYearAhead.toISOString().split("T")[0];

  const [{ data: events }, { data: labels }] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("school_id", school.id)
      .gte("date", openDate && openDate < from ? openDate : from)
      .lte("date", openDate && openDate > to ? openDate : to)
      .order("date", { ascending: true }),
    supabase
      .from("calendar_labels")
      .select(LABEL_COLUMNS)
      .eq("school_id", school.id)
      .order("sort_order", { ascending: true }),
  ]);

  return (
    <PageTransition>
      <ParentEventsClient
        key={openDate}
        events={events || []}
        labels={labels || []}
        initialDate={openDate}
      />
    </PageTransition>
  );
}
