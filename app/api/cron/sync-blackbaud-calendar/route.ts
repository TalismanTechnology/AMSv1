import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncSchoolCalendars } from "@/lib/blackbaud/calendar";
import { isCronAuthorized } from "@/lib/blackbaud/cron-auth";

export const maxDuration = 300;

// Refresh every school's Blackbaud calendar feeds into the review queue.
//   GET /api/cron/sync-blackbaud-calendar
//   Authorization: Bearer <CRON_SECRET>   (or ?key=<CRON_SECRET>)
//
// Runs more often than the roster sync: a roster changes a few times a term,
// but a game time can move the morning of.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isCronAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Distinct schools with at least one active feed. A school does not need a
  // Blackbaud OAuth connection for this — iCal feeds are independent of SKY.
  const { data: feeds, error } = await supabase
    .from("blackbaud_calendar_feeds")
    .select("school_id")
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const schoolIds = [...new Set((feeds ?? []).map((row) => row.school_id as string))];
  const results: Array<Record<string, unknown>> = [];

  // Sequential across schools: parallel fetches would multiply our outbound
  // request rate against Blackbaud's hosting for no real latency win.
  for (const schoolId of schoolIds) {
    try {
      const summary = await syncSchoolCalendars(schoolId);

      results.push({
        schoolId,
        ok: summary.failures.length === 0,
        feeds: summary.results.length,
        staged: summary.results.reduce((sum, r) => sum + r.created + r.updated, 0),
        superseded: summary.results.reduce((sum, r) => sum + r.superseded, 0),
        failures: summary.failures,
      });
    } catch (caught: unknown) {
      const message =
        caught instanceof Error ? caught.message : "Unknown sync failure";

      // One school's failure must not abort the rest; the previous staging
      // state stays put so the review queue keeps working.
      results.push({ schoolId, ok: false, error: message });
    }
  }

  return NextResponse.json({
    schools: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
