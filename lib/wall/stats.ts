// Server-side reads for the private /wall dashboard: a thin wrapper over the
// shared metrics (lib/metrics, docs/metrics.md) — all schools, plus the
// collegiate school on its own — so the wall and admin Analytics always agree
// for the same school and window. Aggregates only.

import type { createAdminClient } from "@/lib/supabase/admin";
import { countSchools, loadHeadlineMetrics } from "@/lib/metrics/load";
import { ANSWER_RATE_DAYS } from "@/lib/metrics/windows";
import { SPARKLINE_DAYS, type WallStats } from "./aggregate";

type AdminClient = ReturnType<typeof createAdminClient>;

const COLLEGIATE_SLUG = "collegiate";
// The 30-day range covers the 14-day sparkline and every fixed window.
const WALL_RANGE = "30d";

export async function loadWallStats(supabase: AdminClient, now = new Date()): Promise<WallStats> {
  const [all, schoolsCount, collegiate] = await Promise.all([
    loadHeadlineMetrics(supabase, { schoolId: null, range: WALL_RANGE, now }),
    countSchools(supabase),
    supabase.from("schools").select("id").eq("slug", COLLEGIATE_SLUG).maybeSingle(),
  ]);
  const collegiateId = (collegiate.data as { id: string } | null)?.id ?? null;
  const college = collegiateId
    ? await loadHeadlineMetrics(supabase, { schoolId: collegiateId, range: WALL_RANGE, now })
    : null;

  return {
    generatedAt: all.generatedAt,
    totalParents: all.parents.total,
    newParentsToday: all.parents.newToday,
    newParents7d: all.parents.new7d,
    activeParents7d: all.activeParents.last7d,
    questionsTotal: all.questions.allTime,
    questionsToday: all.questions.today,
    answerRate: all.answerRate.last30d,
    answerRateDays: ANSWER_RATE_DAYS,
    sparkline: all.questionsByDay.slice(-SPARKLINE_DAYS),
    schoolsCount,
    collegiate: college
      ? {
          parents: college.parents.total,
          active7d: college.activeParents.last7d,
          questions: college.questions.allTime,
          answerRate: college.answerRate.last30d,
        }
      : null,
  };
}
