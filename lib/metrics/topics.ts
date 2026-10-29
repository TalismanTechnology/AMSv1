// Server-side reads for the "Topics & questions" section of admin Analytics
// (moved from the old Insights page). Takes a service-role client; callers
// authorize the school first.
//
// Privacy (app/privacy/page.tsx §6, migration 031): staff may read a parent's
// words ONLY for flagged exchanges — the assistant couldn't answer, or the
// parent gave a thumbs-down. Everything else this returns is an aggregate:
// no parent names/emails/user ids/session ids ever leave this file, and no
// unflagged question text. Topic counts are k-anonymous (summarizeTopics).

import {
  groupFlaggedQuestions,
  normalizeQuestion,
  summarizeTopics,
  type FlaggedGroup,
  type FlaggedQuestion,
} from "@/lib/insights/aggregate";
import { chunk, fetchAllPages } from "@/lib/insights/queries";
import { askerKey } from "@/lib/insights/scrub";
import type { AdminClient, LoadedInputs } from "./load";
import { rangeDays, windowStart } from "./windows";

const MAX_FLAGGED_GROUPS = 25;

export interface TopicsSection {
  topics: { label: string; count: number }[];
  hiddenTopicCount: number;
  unanswered: FlaggedGroup[];
  /** Some question in the range has no topic label yet. */
  hasUnlabeled: boolean;
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

/** Topics and flagged questions for one school over the inputs' range. */
export async function loadTopicsSection(
  supabase: AdminClient,
  schoolId: string,
  inputs: LoadedInputs
): Promise<TopicsSection> {
  const start = windowStart(rangeDays(inputs.range), inputs.now);
  const since = start?.toISOString() ?? null;
  const inRange = (ts: string) => since === null || ts >= since;
  const events = inputs.events.filter((e) => e.school_id === schoolId && inRange(e.created_at));

  const [topicRows, feedbackRows] = await Promise.all([
    fetchAllPages<{ event_id: string; topic: string }>((from, to) => {
      let q = supabase
        .from("question_topics")
        .select("event_id, topic, analytics_events!inner(created_at)")
        .eq("school_id", schoolId);
      if (since) q = q.gte("analytics_events.created_at", since);
      return q.order("event_id").range(from, to);
    }),
    fetchAllPages<FeedbackRow>((from, to) => {
      let q = supabase
        .from("chat_feedback")
        .select("message_id, user_id")
        .eq("school_id", schoolId)
        .eq("rating", "down");
      // Feedback always follows its message, so this bounds the scan.
      if (since) q = q.gte("created_at", since);
      return q.order("created_at", { ascending: false }).order("id").range(from, to);
    }),
  ]);

  // --- topics (k-anonymous aggregate) ---
  const askerByEvent = new Map(events.map((e) => [e.id, askerKey(e, schoolId, inputs.secret)]));
  const labeledEvents = new Set<string>();
  const topicInputs: { topic: string; askerId: string | null }[] = [];
  for (const row of topicRows) {
    if (!askerByEvent.has(row.event_id)) continue;
    labeledEvents.add(row.event_id);
    topicInputs.push({ topic: row.topic, askerId: askerByEvent.get(row.event_id) ?? null });
  }
  const { topics, hiddenTopicCount } = summarizeTopics(topicInputs);

  // --- flagged questions (admins may see these) ---
  const flagged: FlaggedQuestion[] = [];
  const unansweredInRange = inputs.unansweredRows.filter((r) => inRange(r.created_at));
  const clusterLabels = await loadClusterLabels(
    supabase,
    schoolId,
    [...new Set(unansweredInRange.map((r) => r.cluster_id).filter((id): id is string => !!id))]
  );
  for (const r of unansweredInRange) {
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
    if (!inRange(q.createdAt)) continue;
    flagged.push({
      text: q.text,
      createdAt: q.createdAt,
      reason: "unhelpful",
      dedupeKey: `${q.sessionId}|${normalizeQuestion(q.text)}`,
    });
  }

  return {
    topics,
    hiddenTopicCount,
    unanswered: groupFlaggedQuestions(flagged, MAX_FLAGGED_GROUPS),
    hasUnlabeled: events.some((e) => !labeledEvents.has(e.id)),
  };
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
