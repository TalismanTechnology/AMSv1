"use server";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import {
  answerRate,
  groupFlaggedQuestions,
  isRangeDays,
  isUnansweredEvent,
  normalizeQuestion,
  sessionQuestionKey,
  summarizeTopics,
  type FlaggedQuestion,
  type FlaggedGroup,
  type RangeDays,
} from "@/lib/insights/aggregate";
import { chunk, daysAgoISO, fetchAllPages } from "@/lib/insights/queries";
import { labelPendingQuestions } from "@/lib/insights/topics";

// Privacy (app/privacy/page.tsx §6, migration 031): staff may read a parent's
// words ONLY for flagged exchanges — the assistant couldn't answer, or the
// parent gave a thumbs-down. Everything else this returns is an aggregate:
// no parent names/emails/user ids/session ids ever leave this file, and no
// unflagged question text. Topic counts are k-anonymous (summarizeTopics).

export interface InsightsData {
  rangeDays: RangeDays;
  questions: number;
  activeParents: number;
  /** Whole-number percentage, or null when no questions were asked. */
  answerRate: number | null;
  topics: { label: string; count: number }[];
  hiddenTopicCount: number;
  unanswered: FlaggedGroup[];
}

const MAX_FLAGGED_GROUPS = 25;
// Labels a new school's backlog on page load; the daily cron does the rest.
const ON_LOAD_LABEL_LIMIT = 150;
const ON_LOAD_LABEL_COOLDOWN_MS = 5 * 60 * 1000;
// Best-effort per-instance throttle so repeated page loads (or range
// switches) don't each start a labeling run.
const lastLabelKickoff = new Map<string, number>();

interface EventRow {
  id: string;
  user_id: string | null;
  unanswered: unknown;
  session_id: string | null;
  question: string | null;
}

interface UnansweredRow {
  question: string;
  session_id: string | null;
  cluster_id: string | null;
  created_at: string;
}

interface FeedbackRow {
  message_id: string | null;
  user_id: string | null;
}

interface MessageRow {
  id: string;
  session_id: string | null;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  school_id: string | null;
}

type AdminClient = ReturnType<typeof createAdminClient>;

export async function getInsightsData(
  schoolId: string,
  rangeDays: RangeDays
): Promise<InsightsData> {
  if (!isRangeDays(rangeDays)) throw new Error("Invalid range");
  // analytics_events / chat rows are not readable by school admins through
  // RLS. Authorize explicitly for THIS school, then read with the service role.
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) throw new Error(auth.error);
  const supabase = createAdminClient();

  const since = daysAgoISO(rangeDays);
  // Unanswered rows are logged just after their event; look a little further
  // back so an event at the very start of the range still finds its match.
  const matchSince = daysAgoISO(rangeDays + 1);

  const [events, unansweredRows, topicRows, feedbackRows] = await Promise.all([
    fetchAllPages<EventRow>((from, to) =>
      supabase
        .from("analytics_events")
        .select(
          "id, user_id, unanswered:metadata->unanswered, session_id:metadata->>session_id, question:metadata->>question"
        )
        .eq("school_id", schoolId)
        .eq("event_type", "question")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    fetchAllPages<UnansweredRow>((from, to) =>
      supabase
        .from("unanswered_questions")
        .select("question, session_id, cluster_id, created_at")
        .eq("school_id", schoolId)
        .gte("created_at", matchSince)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    fetchAllPages<{ event_id: string; topic: string }>((from, to) =>
      supabase
        .from("question_topics")
        .select("event_id, topic, analytics_events!inner(created_at)")
        .eq("school_id", schoolId)
        .gte("analytics_events.created_at", since)
        .order("event_id")
        .range(from, to)
    ),
    fetchAllPages<FeedbackRow>((from, to) =>
      supabase
        .from("chat_feedback")
        .select("message_id, user_id")
        .eq("school_id", schoolId)
        .eq("rating", "down")
        // Feedback always follows its message, so this bounds the scan.
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    ),
  ]);

  // --- stat cards ---
  const askerIds = [...new Set(events.map((e) => e.user_id).filter((id): id is string => !!id))];
  const activeParents = await countParents(supabase, schoolId, askerIds);

  const unansweredKeys = new Set(
    unansweredRows
      .filter((r) => r.session_id)
      .map((r) => sessionQuestionKey(r.session_id!, r.question))
  );
  const unansweredCount = events.filter((e) =>
    isUnansweredEvent(
      { unanswered: e.unanswered, sessionId: e.session_id, question: e.question },
      unansweredKeys
    )
  ).length;

  // --- topics (k-anonymous aggregate) ---
  const askerByEvent = new Map(events.map((e) => [e.id, e.user_id]));
  const labeledEvents = new Set<string>();
  const topicInputs: { topic: string; askerId: string | null }[] = [];
  for (const row of topicRows) {
    if (!askerByEvent.has(row.event_id)) continue;
    labeledEvents.add(row.event_id);
    topicInputs.push({ topic: row.topic, askerId: askerByEvent.get(row.event_id) ?? null });
  }
  const { topics, hiddenTopicCount } = summarizeTopics(topicInputs);

  if (events.some((e) => !labeledEvents.has(e.id))) {
    scheduleTopicLabeling(schoolId);
  }

  // --- flagged questions (admins may see these) ---
  const flagged: FlaggedQuestion[] = [];
  const inRange = unansweredRows.filter((r) => r.created_at >= since);
  const clusterLabels = await loadClusterLabels(
    supabase,
    schoolId,
    [...new Set(inRange.map((r) => r.cluster_id).filter((id): id is string => !!id))]
  );
  for (const r of inRange) {
    flagged.push({
      text: r.question,
      createdAt: r.created_at,
      reason: "unanswered",
      clusterId: r.cluster_id,
      clusterLabel: r.cluster_id ? clusterLabels.get(r.cluster_id) ?? null : null,
      dedupeKey: r.session_id ? `${r.session_id}|${normalizeQuestion(r.question)}` : null,
    });
  }
  for (const q of await loadThumbsDownQuestions(supabase, schoolId, feedbackRows)) {
    if (q.createdAt < since) continue;
    flagged.push({
      text: q.text,
      createdAt: q.createdAt,
      reason: "unhelpful",
      dedupeKey: `${q.sessionId}|${normalizeQuestion(q.text)}`,
    });
  }

  return {
    rangeDays,
    questions: events.length,
    activeParents,
    answerRate: answerRate(events.length, unansweredCount),
    topics,
    hiddenTopicCount,
    unanswered: groupFlaggedQuestions(flagged, MAX_FLAGGED_GROUPS),
  };
}

/** Kick off background labeling after the response; never blocks or throws. */
function scheduleTopicLabeling(schoolId: string) {
  const now = Date.now();
  const last = lastLabelKickoff.get(schoolId) ?? 0;
  if (now - last < ON_LOAD_LABEL_COOLDOWN_MS) return;
  lastLabelKickoff.set(schoolId, now);
  try {
    after(async () => {
      await labelPendingQuestions(schoolId, { limit: ON_LOAD_LABEL_LIMIT });
    });
  } catch (err) {
    console.error("[insights] could not schedule topic labeling:", err);
  }
}

/** Askers whose membership in THIS school is a parent membership. */
async function countParents(
  supabase: AdminClient,
  schoolId: string,
  userIds: string[]
): Promise<number> {
  let count = 0;
  for (const ids of chunk(userIds)) {
    const { count: n, error } = await supabase
      .from("school_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("role", "parent")
      .in("user_id", ids);
    if (error) throw new Error(error.message);
    count += n ?? 0;
  }
  return count;
}

async function loadClusterLabels(
  supabase: AdminClient,
  schoolId: string,
  clusterIds: string[]
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  for (const ids of chunk(clusterIds)) {
    const { data, error } = await supabase
      .from("unanswered_clusters")
      .select("id, label")
      .eq("school_id", schoolId)
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { id: string; label: string | null }[]) {
      if (row.label) labels.set(row.id, row.label);
    }
  }
  return labels;
}

/**
 * Questions behind a thumbs-down, with the same semantics as
 * chat_message_flag_reason (migration 031): the rating must be on an
 * assistant reply, left by the chat's OWNER (staff can't flag a chat), and
 * the question is the user message that reply answered.
 */
async function loadThumbsDownQuestions(
  supabase: AdminClient,
  schoolId: string,
  feedback: FeedbackRow[]
): Promise<{ sessionId: string; text: string; createdAt: string }[]> {
  const messageIds = [...new Set(feedback.map((f) => f.message_id).filter((id): id is string => !!id))];
  if (messageIds.length === 0) return [];

  const replies: MessageRow[] = [];
  for (const ids of chunk(messageIds)) {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, session_id, role, content, created_at, school_id")
      .in("id", ids)
      .eq("role", "assistant");
    if (error) throw new Error(error.message);
    replies.push(...((data ?? []) as MessageRow[]));
  }
  const replyById = new Map(
    replies.filter((m) => m.session_id && m.school_id === schoolId).map((m) => [m.id, m])
  );

  const sessionIds = [...new Set([...replyById.values()].map((m) => m.session_id!))];
  const ownerBySession = new Map<string, string | null>();
  for (const ids of chunk(sessionIds)) {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("id, user_id")
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const s of (data ?? []) as { id: string; user_id: string | null }[]) {
      ownerBySession.set(s.id, s.user_id);
    }
  }

  const flaggedReplies = new Map<string, MessageRow>();
  for (const f of feedback) {
    const reply = f.message_id ? replyById.get(f.message_id) : undefined;
    if (!reply || !f.user_id) continue;
    if (ownerBySession.get(reply.session_id!) !== f.user_id) continue;
    flaggedReplies.set(reply.id, reply);
  }
  if (flaggedReplies.size === 0) return [];

  // The question each reply answered: the latest user message in the same
  // session at or before the reply.
  const latestReply = [...flaggedReplies.values()].reduce(
    (max, m) => (m.created_at > max ? m.created_at : max),
    ""
  );
  const flaggedSessions = [...new Set([...flaggedReplies.values()].map((m) => m.session_id!))];
  const questionsBySession = new Map<string, MessageRow[]>();
  for (const ids of chunk(flaggedSessions, 50)) {
    const rows = await fetchAllPages<MessageRow>((from, to) =>
      supabase
        .from("chat_messages")
        .select("id, session_id, role, content, created_at, school_id")
        .in("session_id", ids)
        .eq("role", "user")
        .lte("created_at", latestReply)
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to)
    );
    for (const row of rows) {
      const list = questionsBySession.get(row.session_id!) ?? [];
      list.push(row);
      questionsBySession.set(row.session_id!, list);
    }
  }

  const out: { sessionId: string; text: string; createdAt: string }[] = [];
  for (const reply of flaggedReplies.values()) {
    const candidates = questionsBySession.get(reply.session_id!) ?? [];
    let question: MessageRow | undefined;
    for (const m of candidates) {
      if (m.created_at <= reply.created_at) question = m;
      else break;
    }
    if (question?.content.trim()) {
      out.push({ sessionId: reply.session_id!, text: question.content, createdAt: question.created_at });
    }
  }
  return out;
}
