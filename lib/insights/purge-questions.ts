import type { SupabaseClient } from "@supabase/supabase-js";
import { labelPendingQuestions } from "./topics";
import { chunk, fetchAllPages } from "./queries";
import { sessionQuestionKey } from "@/lib/metrics/definitions";
import { findParentUserIds } from "@/lib/metrics/load";
import {
  askerHashSecret,
  hashAsker,
  scrubQuestionMetadata,
  shouldScrub,
} from "./scrub";

// Purge-cron step for question analytics (see lib/insights/scrub.ts): label,
// then scrub, every question event older than `cutoff` that still holds text.

const LABEL_LIMIT_PER_SCHOOL = 300;
const MAX_EVENTS_PER_RUN = 10_000;
const UPSERT_CHUNK = 500;

interface PendingEvent {
  id: string;
  event_type: string;
  school_id: string;
  user_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface ScrubResult {
  pending: number;
  labeled: number;
  scrubbed: number;
  /** Unlabeled events left for a later run (still under the max age). */
  deferred: number;
}

export async function scrubExpiredQuestionEvents(
  admin: SupabaseClient,
  {
    cutoff,
    now = new Date(),
    labelDeadline,
  }: { cutoff: string; now?: Date; labelDeadline?: number }
): Promise<ScrubResult> {
  const result: ScrubResult = { pending: 0, labeled: 0, scrubbed: 0, deferred: 0 };
  const secret = askerHashSecret();
  if (!secret) throw new Error("No secret for asker hashes (ANALYTICS_HASH_SECRET / CRON_SECRET)");

  const events = await fetchAllPages<PendingEvent>(
    (from, to) =>
      admin
        .from("analytics_events")
        .select("id, event_type, school_id, user_id, created_at, metadata")
        .eq("event_type", "question")
        .lt("created_at", cutoff)
        .is("metadata->>scrubbed", null)
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to),
    MAX_EVENTS_PER_RUN
  );
  result.pending = events.length;
  if (events.length === 0) return result;

  const bySchool = new Map<string, PendingEvent[]>();
  for (const e of events) {
    const list = bySchool.get(e.school_id) ?? [];
    list.push(e);
    bySchool.set(e.school_id, list);
  }

  // 1. Label while the text (and user_id, for redacting children's names)
  //    is still there. Sequential to keep the Gemini rate flat; never throws.
  for (const schoolId of bySchool.keys()) {
    if (labelDeadline && Date.now() > labelDeadline) break;
    result.labeled += await labelPendingQuestions(schoolId, {
      createdBefore: cutoff,
      limit: LABEL_LIMIT_PER_SCHOOL,
    });
  }

  const labeled = new Set<string>();
  for (const ids of chunk(events.map((e) => e.id))) {
    const { data, error } = await admin
      .from("question_topics")
      .select("event_id")
      .in("event_id", ids);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { event_id: string }[]) labeled.add(row.event_id);
  }

  // 2. Scrub what's labeled, or too old to wait any longer.
  for (const [schoolId, schoolEvents] of bySchool) {
    const ready = schoolEvents.filter((e) =>
      shouldScrub({ created_at: e.created_at, labeled: labeled.has(e.id) }, now)
    );
    result.deferred += schoolEvents.length - ready.length;
    if (ready.length === 0) continue;

    const userIds = [...new Set(ready.map((e) => e.user_id).filter((id): id is string => !!id))];
    // Same "is a parent" test as active parents (lib/metrics/definitions.ts).
    const parents = await findParentUserIds(admin, schoolId, userIds);

    // Events from before metadata.unanswered existed: resolve the answer
    // flag now, while session_id + text can still be matched.
    const legacy = ready.filter(
      (e) =>
        typeof e.metadata?.unanswered !== "boolean" &&
        typeof e.metadata?.session_id === "string" &&
        typeof e.metadata?.question === "string"
    );
    const unansweredKeys = new Set<string>();
    for (const ids of chunk([...new Set(legacy.map((e) => e.metadata!.session_id as string))])) {
      const { data, error } = await admin
        .from("unanswered_questions")
        .select("session_id, question")
        .eq("school_id", schoolId)
        .in("session_id", ids);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as { session_id: string; question: string }[]) {
        unansweredKeys.add(sessionQuestionKey(row.session_id, row.question));
      }
    }

    const rows = ready.map((e) => {
      const sessionId = e.metadata?.session_id;
      const question = e.metadata?.question;
      return {
        id: e.id,
        event_type: e.event_type,
        school_id: e.school_id,
        created_at: e.created_at,
        user_id: null,
        metadata: scrubQuestionMetadata({
          metadata: e.metadata,
          asker: e.user_id ? hashAsker(schoolId, e.user_id, secret) : null,
          askerIsParent: !!e.user_id && parents.has(e.user_id),
          unanswered:
            typeof sessionId === "string" && typeof question === "string"
              ? unansweredKeys.has(sessionQuestionKey(sessionId, question))
              : undefined,
        }),
      };
    });

    for (const batch of chunk(rows, UPSERT_CHUNK)) {
      const { error } = await admin
        .from("analytics_events")
        .upsert(batch, { onConflict: "id" });
      if (error) {
        console.error(`[purge] scrub failed for school ${schoolId}:`, error.message);
        continue;
      }
      result.scrubbed += batch.length;
    }
  }

  return result;
}
