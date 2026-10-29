// Server-side reads for every metric (docs/metrics.md). Takes a service-role
// client: callers authorize first (school admin / super admin for admin
// pages, the wall token for /wall). `schoolId` null = all schools.
// Returns aggregates only — no names, emails, ids or question text.

import type { createAdminClient } from "@/lib/supabase/admin";
import { chunk, fetchAllPages } from "@/lib/insights/queries";
import { askerHashSecret } from "@/lib/insights/scrub";
import {
  computeHeadlineMetrics,
  documentTypeCounts,
  eventsWindowStart,
  sessionQuestionKey,
  type HeadlineMetrics,
  type MetricInputs,
  type ParentMembershipRow,
  type QuestionEventRow,
} from "./definitions";
import { DEFAULT_METRIC_RANGE, windowStart, rangeDays, type MetricRange } from "./windows";

export type AdminClient = ReturnType<typeof createAdminClient>;

const MAX_ROWS = 100_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface MetricScope {
  /** null = all schools. */
  schoolId: string | null;
  range?: MetricRange;
  now?: Date;
}

export interface UnansweredRow {
  question: string;
  session_id: string | null;
  cluster_id: string | null;
  created_at: string;
}

export interface LoadedInputs extends MetricInputs {
  /** unanswered_questions rows since a day before the events window. */
  unansweredRows: UnansweredRow[];
}

async function exactCount(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Every row the headline metrics are computed from. */
export async function loadMetricInputs(
  supabase: AdminClient,
  { schoolId, range = DEFAULT_METRIC_RANGE, now = new Date() }: MetricScope
): Promise<LoadedInputs> {
  const eventsSince = eventsWindowStart(range, now);
  // Unanswered rows are logged just after their event; look a day further
  // back so an event at the very start of the window still finds its match.
  const unansweredSince = eventsSince ? new Date(eventsSince.getTime() - DAY_MS) : null;

  const [memberships, events, unansweredRows, questionsAllTime] = await Promise.all([
    fetchAllPages<ParentMembershipRow>((from, to) => {
      let q = supabase
        .from("school_memberships")
        .select("user_id, school_id, created_at, approved")
        .eq("role", "parent");
      if (schoolId) q = q.eq("school_id", schoolId);
      return q.order("id").range(from, to);
    }, MAX_ROWS),
    fetchAllPages<QuestionEventRow>((from, to) => {
      let q = supabase
        .from("analytics_events")
        .select(
          "id, school_id, user_id, created_at, unanswered:metadata->unanswered, session_id:metadata->>session_id, question:metadata->>question, asker:metadata->>asker, asker_parent:metadata->asker_parent"
        )
        .eq("event_type", "question");
      if (schoolId) q = q.eq("school_id", schoolId);
      if (eventsSince) q = q.gte("created_at", eventsSince.toISOString());
      return q.order("created_at", { ascending: false }).order("id").range(from, to);
    }, MAX_ROWS),
    fetchAllPages<UnansweredRow>((from, to) => {
      let q = supabase
        .from("unanswered_questions")
        .select("question, session_id, cluster_id, created_at");
      if (schoolId) q = q.eq("school_id", schoolId);
      if (unansweredSince) q = q.gte("created_at", unansweredSince.toISOString());
      return q.order("created_at", { ascending: false }).order("id").range(from, to);
    }, MAX_ROWS),
    exactCount(
      (() => {
        let q = supabase
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", "question");
        if (schoolId) q = q.eq("school_id", schoolId);
        return q;
      })()
    ),
  ]);

  if (events.length >= MAX_ROWS) {
    console.warn(`[metrics] question events hit the ${MAX_ROWS}-row cap; windowed counts are truncated`);
  }

  return {
    now,
    range,
    memberships,
    events,
    unansweredRows,
    unansweredKeys: new Set(
      unansweredRows
        .filter((r) => r.session_id)
        .map((r) => sessionQuestionKey(r.session_id!, r.question))
    ),
    questionsAllTime,
    secret: askerHashSecret(),
  };
}

export async function loadHeadlineMetrics(
  supabase: AdminClient,
  scope: MetricScope
): Promise<HeadlineMetrics> {
  return computeHeadlineMetrics(await loadMetricInputs(supabase, scope));
}

export interface DocumentMetrics {
  /** Every document, any status. */
  total: number;
  /** status = 'ready' (searchable by the assistant). */
  ready: number;
  /** Ready documents by file type. */
  byType: { type: string; count: number }[];
}

export async function loadDocumentMetrics(
  supabase: AdminClient,
  schoolId: string | null
): Promise<DocumentMetrics> {
  const [total, readyRows] = await Promise.all([
    exactCount(
      (() => {
        let q = supabase.from("documents").select("id", { count: "exact", head: true });
        if (schoolId) q = q.eq("school_id", schoolId);
        return q;
      })()
    ),
    fetchAllPages<{ file_type: string | null }>((from, to) => {
      let q = supabase.from("documents").select("file_type").eq("status", "ready");
      if (schoolId) q = q.eq("school_id", schoolId);
      return q.order("id").range(from, to);
    }, MAX_ROWS),
  ]);
  return { total, ready: readyRows.length, byType: documentTypeCounts(readyRows) };
}

/**
 * Chats with any activity (chat_sessions.updated_at) in the range. Chats
 * expire after the retention window (lib/chat/retention.ts), so longer
 * ranges only see chats that still exist.
 */
export async function countActiveChats(
  supabase: AdminClient,
  { schoolId, range = DEFAULT_METRIC_RANGE, now = new Date() }: MetricScope
): Promise<number> {
  const start = windowStart(rangeDays(range), now);
  let q = supabase.from("chat_sessions").select("id", { count: "exact", head: true });
  if (schoolId) q = q.eq("school_id", schoolId);
  if (start) q = q.gte("updated_at", start.toISOString());
  return exactCount(q);
}

export async function countSchools(supabase: AdminClient): Promise<number> {
  return exactCount(supabase.from("schools").select("id", { count: "exact", head: true }));
}

/**
 * Of these users, the ones with a parent membership (approved or not) in
 * this school — the "is a parent" test behind active parents, used by the
 * purge cron when it stamps asker_parent on a scrubbed event.
 */
export async function findParentUserIds(
  supabase: AdminClient,
  schoolId: string,
  userIds: string[]
): Promise<Set<string>> {
  const parents = new Set<string>();
  for (const ids of chunk(userIds)) {
    const { data, error } = await supabase
      .from("school_memberships")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("role", "parent")
      .in("user_id", ids);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { user_id: string }[]) parents.add(row.user_id);
  }
  return parents;
}
