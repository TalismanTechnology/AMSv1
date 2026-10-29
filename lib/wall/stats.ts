// Server-side reads for the private /wall dashboard. Uses the same
// definitions as the admin dashboard and Insights (actions/insights.ts):
//   - a parent is an approved 'parent' school membership;
//   - an active parent asked a question (analytics_events 'question') and is
//     a parent of that school — by user_id on fresh events, by the scrubbed
//     event's asker_parent flag afterwards (lib/insights/scrub.ts);
//   - answer rate is answered / asked over Insights' default range (30 days).
// Returns aggregates only: no names, emails, ids or question text leave here.

import type { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_RANGE_DAYS, answerRate, isUnansweredEvent, sessionQuestionKey } from "@/lib/insights/aggregate";
import { chunk, daysAgoISO, fetchAllPages } from "@/lib/insights/queries";
import { askerHashSecret, askerKey } from "@/lib/insights/scrub";
import {
  SPARKLINE_DAYS,
  bucketByEtDay,
  countDistinct,
  countDistinctSince,
  etStartOfDay,
  type WallStats,
} from "./aggregate";

type AdminClient = ReturnType<typeof createAdminClient>;

const COLLEGIATE_SLUG = "collegiate";
const ANSWER_RATE_DAYS = DEFAULT_RANGE_DAYS;
const MAX_ROWS = 100_000;

interface MembershipRow {
  user_id: string;
  school_id: string;
  created_at: string;
}

interface EventRow {
  id: string;
  school_id: string | null;
  user_id: string | null;
  created_at: string;
  unanswered: unknown;
  session_id: string | null;
  question: string | null;
  asker: string | null;
  asker_parent: unknown;
}

export async function loadWallStats(supabase: AdminClient, now = new Date()): Promise<WallStats> {
  const todayStart = etStartOfDay(now);
  const weekAgo = new Date(daysAgoISO(7, now));
  const sparklineStart = etStartOfDay(now, SPARKLINE_DAYS - 1);
  const rangeSince = daysAgoISO(ANSWER_RATE_DAYS, now);
  // Events must cover both the answer-rate range and the sparkline.
  const eventsSince = new Date(Math.min(new Date(rangeSince).getTime(), sparklineStart.getTime())).toISOString();
  // Unanswered rows are logged just after their event (see actions/insights.ts).
  const matchSince = daysAgoISO(ANSWER_RATE_DAYS + 1, now);

  const [memberships, events, unansweredRows, questionsTotal, schoolsCount, collegiate] =
    await Promise.all([
      fetchAllPages<MembershipRow>(
        (from, to) =>
          supabase
            .from("school_memberships")
            .select("user_id, school_id, created_at")
            .eq("role", "parent")
            .eq("approved", true)
            .order("id")
            .range(from, to),
        MAX_ROWS
      ),
      fetchAllPages<EventRow>(
        (from, to) =>
          supabase
            .from("analytics_events")
            .select(
              "id, school_id, user_id, created_at, unanswered:metadata->unanswered, session_id:metadata->>session_id, question:metadata->>question, asker:metadata->>asker, asker_parent:metadata->asker_parent"
            )
            .eq("event_type", "question")
            .gte("created_at", eventsSince)
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, to),
        MAX_ROWS
      ),
      fetchAllPages<{ question: string; session_id: string | null }>(
        (from, to) =>
          supabase
            .from("unanswered_questions")
            .select("question, session_id")
            .gte("created_at", matchSince)
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, to),
        MAX_ROWS
      ),
      exactCount(supabase.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_type", "question")),
      exactCount(supabase.from("schools").select("id", { count: "exact", head: true })),
      supabase.from("schools").select("id").eq("slug", COLLEGIATE_SLUG).maybeSingle(),
    ]);
  const collegiateId = (collegiate.data as { id: string } | null)?.id ?? null;

  // --- parents ---
  const parentPairs = new Set(memberships.map((m) => `${m.school_id}|${m.user_id}`));

  // --- active parents (7d), keyed per school like Insights ---
  const secret = askerHashSecret();
  const weekEvents = events.filter((e) => e.school_id && new Date(e.created_at) >= weekAgo);
  // A fresh event's asker may have a parent membership that isn't approved
  // (yet); Insights counts any parent membership, so look those up too.
  const unknownAskers = weekEvents.filter(
    (e) => e.user_id && !parentPairs.has(`${e.school_id}|${e.user_id}`)
  );
  const extraParents = await findParentPairs(supabase, unknownAskers);
  const activeKeys = new Map<string, Set<string>>();
  const addActive = (schoolId: string, key: string | null) => {
    if (!key) return;
    let set = activeKeys.get(schoolId);
    if (!set) activeKeys.set(schoolId, (set = new Set()));
    set.add(key);
  };
  for (const e of weekEvents) {
    const schoolId = e.school_id!;
    if (e.asker) {
      if (e.asker_parent === true) addActive(schoolId, e.asker);
    } else if (e.user_id) {
      const pair = `${schoolId}|${e.user_id}`;
      if (parentPairs.has(pair) || extraParents.has(pair)) addActive(schoolId, askerKey(e, schoolId, secret));
    }
  }
  const activeIn = (schoolId: string) => activeKeys.get(schoolId)?.size ?? 0;
  let activeParents7d = 0;
  for (const set of activeKeys.values()) activeParents7d += set.size;

  // --- answer rate (Insights default range) ---
  const unansweredKeys = new Set(
    unansweredRows.filter((r) => r.session_id).map((r) => sessionQuestionKey(r.session_id!, r.question))
  );
  const rangeStart = new Date(rangeSince);
  const rangeEvents = events.filter((e) => new Date(e.created_at) >= rangeStart);
  const rateFor = (rows: EventRow[]) =>
    answerRate(
      rows.length,
      rows.filter((e) =>
        isUnansweredEvent({ unanswered: e.unanswered, sessionId: e.session_id, question: e.question }, unansweredKeys)
      ).length
    );

  const sparkline = bucketByEtDay(
    events.map((e) => e.created_at),
    now,
    SPARKLINE_DAYS
  );

  const collegiateStats = collegiateId
    ? {
        parents: countDistinct(memberships.filter((m) => m.school_id === collegiateId).map((m) => m.user_id)),
        active7d: activeIn(collegiateId),
        questions: await exactCount(
          supabase
            .from("analytics_events")
            .select("id", { count: "exact", head: true })
            .eq("event_type", "question")
            .eq("school_id", collegiateId)
        ),
        answerRate: rateFor(rangeEvents.filter((e) => e.school_id === collegiateId)),
      }
    : null;

  return {
    generatedAt: now.toISOString(),
    totalParents: countDistinct(memberships.map((m) => m.user_id)),
    newParentsToday: countDistinctSince(memberships, todayStart),
    newParents7d: countDistinctSince(memberships, weekAgo),
    activeParents7d,
    questionsTotal,
    questionsToday: sparkline[sparkline.length - 1]?.count ?? 0,
    answerRate: rateFor(rangeEvents),
    answerRateDays: ANSWER_RATE_DAYS,
    sparkline,
    schoolsCount,
    collegiate: collegiateStats,
  };
}

async function exactCount(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** "school|user" pairs, among these askers, that have a parent membership in that school. */
async function findParentPairs(
  supabase: AdminClient,
  events: { school_id: string | null; user_id: string | null }[]
): Promise<Set<string>> {
  const pairs = new Set<string>();
  const userIds = [...new Set(events.map((e) => e.user_id).filter((id): id is string => !!id))];
  for (const ids of chunk(userIds)) {
    const { data, error } = await supabase
      .from("school_memberships")
      .select("user_id, school_id")
      .eq("role", "parent")
      .in("user_id", ids);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { user_id: string; school_id: string }[]) {
      pairs.add(`${row.school_id}|${row.user_id}`);
    }
  }
  return pairs;
}
