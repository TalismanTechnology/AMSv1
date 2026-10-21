import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/blackbaud/cron-auth";
import { scanRecentlyProcessed } from "@/lib/conflicts/scan";

export const maxDuration = 300;

// Stop starting new schools (and new model calls) with this much of
// maxDuration left.
const TIME_BUDGET_MS = 240_000;
// Pairs judged per school per day. Admins can scan more on demand.
const MAX_JUDGED_PER_SCHOOL = 20;

function errorMessage(err: unknown): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : String(err);
}

// Look for conflicts involving documents processed since each school's last
// conflict scan (lib/conflicts, docs/CONFLICTS.md). Daily:
//   GET /api/cron/scan-conflicts
//   Authorization: Bearer <CRON_SECRET>   (or ?key=<CRON_SECRET>)
//
// Until migration 046 is applied this returns ok with a "not installed" note.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!isCronAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const deadline = startedAt + TIME_BUDGET_MS;
  const supabase = createAdminClient();
  const { data: schools, error } = await supabase.from("schools").select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: {
    schoolId: string;
    judged: number;
    conflicts: number;
    differentYear: number;
    error?: string;
  }[] = [];
  const errors: string[] = [];
  let unchanged = 0;
  let skipped = 0;

  // Sequential: keeps the Gemini request rate flat, and one school's failure
  // never stops the rest.
  for (const { id } of (schools ?? []) as { id: string }[]) {
    if (Date.now() > deadline) {
      skipped++;
      continue;
    }
    try {
      const outcome = await scanRecentlyProcessed(supabase, id, {
        maxJudged: MAX_JUDGED_PER_SCHOOL,
        deadline,
      });
      if ("installed" in outcome && !outcome.installed) {
        return NextResponse.json({ ok: true, skipped: "Conflict detection not installed (migration 046)." });
      }
      if ("unchanged" in outcome) {
        unchanged++;
        continue;
      }
      results.push({
        schoolId: id,
        judged: outcome.pairsJudged,
        conflicts: outcome.conflictsFound,
        // Auto-dismissed as different school years, before or after judging.
        differentYear: (outcome.skipped.different_year ?? 0) + (outcome.autoDismissed.different_year ?? 0),
        // Documents whose candidate search timed out on their own: not scanned.
        ...(outcome.skipped.timeout ? { timedOut: outcome.skipped.timeout } : {}),
        ...(outcome.error ? { error: outcome.error } : {}),
      });
      if (outcome.error) errors.push(`${id}: ${outcome.error}`);
    } catch (err) {
      console.error(`[scan-conflicts] school ${id} failed:`, err);
      errors.push(`${id}: ${errorMessage(err)}`);
    }
  }

  return NextResponse.json(
    {
      ok: errors.length === 0,
      schools: (schools ?? []).length,
      unchanged,
      skipped,
      judged: results.reduce((n, r) => n + r.judged, 0),
      conflicts: results.reduce((n, r) => n + r.conflicts, 0),
      differentYear: results.reduce((n, r) => n + r.differentYear, 0),
      results,
      errors,
    },
    { status: errors.length > 0 ? 500 : 200 }
  );
}
