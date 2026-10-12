import type { SupabaseClient } from "@supabase/supabase-js";

// Parents see (and we keep) only their most recent chats per school. Older
// chats are deleted, except "flagged" ones (an unanswered question, or the
// owner's thumbs-down) which school staff can still review (migration 031):
// those are hidden from the parent instead of deleted.
export const CHAT_HISTORY_LIMIT = 10;

export interface RetentionCandidate {
  id: string;
  updated_at: string;
  flagged: boolean;
}

export interface RetentionPlan {
  keep: string[];
  hide: string[];
  remove: string[];
}

export function planRetention(
  sessions: RetentionCandidate[],
  limit: number = CHAT_HISTORY_LIMIT
): RetentionPlan {
  const sorted = [...sessions].sort(
    (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)
  );
  const plan: RetentionPlan = { keep: [], hide: [], remove: [] };
  sorted.forEach((s, i) => {
    if (i < limit) plan.keep.push(s.id);
    else if (s.flagged) plan.hide.push(s.id);
    else plan.remove.push(s.id);
  });
  return plan;
}

export function truncateTitle(text: string, max = 60): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? clean.slice(0, max) + "..." : clean;
}

/**
 * Session ids (from `sessionIds`) that hold a flagged exchange: any
 * unanswered message, or a 'down' rating by the session owner. Throws on
 * query errors so callers never delete something they couldn't classify.
 */
export async function findFlaggedSessionIds(
  admin: SupabaseClient,
  userId: string,
  sessionIds: string[]
): Promise<Set<string>> {
  const flagged = new Set<string>();
  if (sessionIds.length === 0) return flagged;

  const { data: unanswered, error: unansweredError } = await admin
    .from("chat_messages")
    .select("session_id")
    .in("session_id", sessionIds)
    .eq("unanswered", true);
  if (unansweredError) throw unansweredError;
  for (const row of unanswered ?? []) flagged.add(row.session_id as string);

  const { data: downvoted, error: downvotedError } = await admin
    .from("chat_feedback")
    .select("message_id, chat_messages!inner(session_id)")
    .eq("user_id", userId)
    .eq("rating", "down")
    .in("chat_messages.session_id", sessionIds);
  if (downvotedError) throw downvotedError;
  for (const row of downvoted ?? []) {
    const msg = (row as { chat_messages: unknown }).chat_messages as
      | { session_id: string }
      | { session_id: string }[]
      | null;
    for (const m of Array.isArray(msg) ? msg : msg ? [msg] : []) {
      flagged.add(m.session_id);
    }
  }

  return flagged;
}

/**
 * Trim a parent's visible chat history for one school down to `limit`.
 * Logs errors and never throws — pruning must not break chat creation.
 */
export async function pruneChatHistory(
  admin: SupabaseClient,
  userId: string,
  schoolId: string,
  limit: number = CHAT_HISTORY_LIMIT
): Promise<void> {
  try {
    const { data: sessions, error } = await admin
      .from("chat_sessions")
      .select("id, updated_at")
      .eq("user_id", userId)
      .eq("school_id", schoolId)
      .eq("hidden_from_parent", false)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    if (!sessions || sessions.length <= limit) return;

    const overflow = (sessions as { id: string }[]).slice(limit).map((s) => s.id);
    const flagged = await findFlaggedSessionIds(admin, userId, overflow);

    const plan = planRetention(
      (sessions as { id: string; updated_at: string }[]).map((s) => ({
        ...s,
        flagged: flagged.has(s.id),
      })),
      limit
    );

    if (plan.hide.length > 0) {
      const { error: hideError } = await admin
        .from("chat_sessions")
        .update({ hidden_from_parent: true })
        .in("id", plan.hide)
        .eq("user_id", userId);
      if (hideError) console.error("pruneChatHistory hide failed:", hideError);
    }

    if (plan.remove.length > 0) {
      const { error: removeError } = await admin
        .from("chat_sessions")
        .delete()
        .in("id", plan.remove)
        .eq("user_id", userId);
      if (removeError) console.error("pruneChatHistory delete failed:", removeError);
    }
  } catch (err) {
    console.error("pruneChatHistory failed:", err);
  }
}
