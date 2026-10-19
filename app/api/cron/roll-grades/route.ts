import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/blackbaud/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Move children's grades up once their school's rollover date has passed, and
// mark 12th graders past their year as graduated (never deleted). All the
// logic is in roll_children_grades() (migration 043); it is idempotent, so a
// run (hourly, see vercel.json) only changes anything just after a rollover.
//   GET /api/cron/roll-grades
//   Authorization: Bearer <CRON_SECRET>   (or ?key=<CRON_SECRET>)
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isCronAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await createAdminClient().rpc("roll_children_grades");

  if (error) {
    console.error("[cron/roll-grades] roll_children_grades failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const changed = typeof data === "number" ? data : 0;
  console.log(`[cron/roll-grades] ${changed} children updated`);

  return NextResponse.json({ changed });
}
