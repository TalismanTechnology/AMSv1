import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/blackbaud/cron-auth";
import { labelPendingQuestions } from "@/lib/insights/topics";

export const maxDuration = 300;

// Stop starting new schools with this much of maxDuration left, so a slow
// Gemini batch can't push the run past the limit mid-insert.
const TIME_BUDGET_MS = 240_000;

// Label new parent questions with generic topics for the Topics section of admin Analytics.
//   GET /api/cron/label-question-topics
//   Authorization: Bearer <CRON_SECRET>   (or ?key=<CRON_SECRET>)
//
// Once a day is enough: the page also labels a small batch on load, and
// anything not reached today is picked up tomorrow.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isCronAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();
  const { data: schools, error } = await supabase.from("schools").select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { schoolId: string; labeled: number }[] = [];
  let skipped = 0;

  // Sequential: keeps our Gemini request rate flat. labelPendingQuestions
  // never throws, so one school can't abort the rest.
  for (const { id } of (schools ?? []) as { id: string }[]) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      skipped++;
      continue;
    }
    const labeled = await labelPendingQuestions(id);
    if (labeled > 0) results.push({ schoolId: id, labeled });
  }

  return NextResponse.json({
    schools: (schools ?? []).length,
    skipped,
    labeled: results.reduce((sum, r) => sum + r.labeled, 0),
    results,
  });
}
