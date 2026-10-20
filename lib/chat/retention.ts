import type { SupabaseClient } from "@supabase/supabase-js";

// Parent chats are kept for 30 minutes. Each parent has one chat per school
// (one visible chat_sessions row, reused); the parent sees, and the model is
// given, only that session's messages from the last 30 minutes. Older
// messages are deleted by /api/cron/purge-chats (and for the current parent
// on chat page load), EXCEPT in "flagged" sessions — an unanswered exchange,
// or the owner's thumbs-down (migration 031) — which school staff may review.
// Those are kept in full and, once idle for 30 minutes, hidden from the
// parent (hidden_from_parent, migration 037); the parent's next question
// starts a fresh session.

export const CHAT_RETENTION_MINUTES = 30;
const RETENTION_MS = CHAT_RETENTION_MINUTES * 60 * 1000;

/** ISO timestamp before which unflagged chat content is expired. */
export function retentionCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - RETENTION_MS).toISOString();
}

/** Whether a row created at `createdAt` is still inside the window. */
export function isWithinRetention(createdAt: string, cutoff: string): boolean {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= Date.parse(cutoff);
}

/** Rows created at or after the cutoff, order preserved. */
export function filterRecent<T extends { created_at: string }>(rows: T[], cutoff: string): T[] {
  return rows.filter((r) => isWithinRetention(r.created_at, cutoff));
}

export function truncateTitle(text: string, max = 60): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? clean.slice(0, max) + "..." : clean;
}

// --------------------------------------------
// Flagged determination (matches migration 031's chat_message_flag_reason at
// session level): any unanswered message, or a 'down' rating left by the
// session's OWNER on one of its messages. Staff can't flag a chat by
// thumbs-downing it themselves.
// --------------------------------------------

export interface DownvoteRow {
  /** Who left the rating. */
  user_id: string | null;
  /** Session of the rated message. */
  session_id: string;
}

export function flaggedSessionIdsFrom({
  unansweredSessionIds,
  downvotes,
  ownerBySession,
}: {
  unansweredSessionIds: Iterable<string>;
  downvotes: Iterable<DownvoteRow>;
  ownerBySession: ReadonlyMap<string, string | null>;
}): Set<string> {
  const flagged = new Set<string>(unansweredSessionIds);
  for (const d of downvotes) {
    const owner = ownerBySession.get(d.session_id);
    if (owner && d.user_id === owner) flagged.add(d.session_id);
  }
  return flagged;
}

const IN_CHUNK = 100;

function chunks<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Session ids (from `ownerBySession`'s keys) that hold a flagged exchange.
 * Throws on query errors so callers never delete something they couldn't
 * classify.
 */
export async function findFlaggedSessionIds(
  admin: SupabaseClient,
  ownerBySession: ReadonlyMap<string, string | null>
): Promise<Set<string>> {
  const unansweredSessionIds: string[] = [];
  const downvotes: DownvoteRow[] = [];

  for (const ids of chunks([...ownerBySession.keys()])) {
    const { data: unanswered, error: unansweredError } = await admin
      .from("chat_messages")
      .select("session_id")
      .in("session_id", ids)
      .eq("unanswered", true);
    if (unansweredError) throw unansweredError;
    for (const row of unanswered ?? []) unansweredSessionIds.push(row.session_id as string);

    const { data: downvoted, error: downvotedError } = await admin
      .from("chat_feedback")
      .select("user_id, chat_messages!inner(session_id)")
      .eq("rating", "down")
      .in("chat_messages.session_id", ids);
    if (downvotedError) throw downvotedError;
    for (const row of downvoted ?? []) {
      const r = row as { user_id: string | null; chat_messages: unknown };
      const msg = r.chat_messages as { session_id: string } | { session_id: string }[] | null;
      for (const m of Array.isArray(msg) ? msg : msg ? [msg] : []) {
        downvotes.push({ user_id: r.user_id, session_id: m.session_id });
      }
    }
  }

  return flaggedSessionIdsFrom({ unansweredSessionIds, downvotes, ownerBySession });
}

// --------------------------------------------
// Purge plan
// --------------------------------------------

export interface PurgeCandidate {
  id: string;
  flagged: boolean;
  hidden: boolean;
  /** Any message created at/after the cutoff. */
  hasRecentMessages: boolean;
  /** Touched by every send, so an in-flight question keeps its session. */
  updated_at: string;
}

export interface PurgePlan {
  /** Unflagged sessions: delete their messages older than the cutoff. */
  expireMessagesIn: string[];
  /** Unflagged sessions with nothing recent: delete the session row. */
  deleteSessions: string[];
  /** Flagged, idle sessions still visible to the parent: hide them. */
  hide: string[];
}

export function planPurge(candidates: PurgeCandidate[], cutoff: string): PurgePlan {
  const plan: PurgePlan = { expireMessagesIn: [], deleteSessions: [], hide: [] };
  for (const s of candidates) {
    const idle = !s.hasRecentMessages && !isWithinRetention(s.updated_at, cutoff);
    if (s.flagged) {
      // Never delete flagged content; just take it out of the parent's view.
      if (!s.hidden && idle) plan.hide.push(s.id);
      continue;
    }
    plan.expireMessagesIn.push(s.id);
    if (idle) plan.deleteSessions.push(s.id);
  }
  return plan;
}

export interface PurgeResult {
  sessionsChecked: number;
  messagesDeleted: number;
  sessionsDeleted: number;
  sessionsHidden: number;
}

interface SessionRow {
  id: string;
  user_id: string | null;
  hidden_from_parent: boolean;
  updated_at: string;
}

const MAX_CANDIDATE_ROWS = 20_000;
const PAGE = 1000;

async function pageAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_CANDIDATE_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/**
 * Apply the 30-minute retention rule — to every parent (cron), or to one
 * parent's chats in one school (`scope`, run on chat page load). Uses the
 * service-role client. Throws if flags can't be determined (nothing is
 * deleted in that case); callers decide whether to swallow.
 */
export async function purgeExpiredChats(
  admin: SupabaseClient,
  { now = new Date(), scope }: { now?: Date; scope?: { userId: string; schoolId: string } } = {}
): Promise<PurgeResult> {
  const cutoff = retentionCutoff(now);
  const result: PurgeResult = {
    sessionsChecked: 0,
    messagesDeleted: 0,
    sessionsDeleted: 0,
    sessionsHidden: 0,
  };

  // Candidates: (a) sessions idle past the cutoff — visible ones (to delete
  // or hide) and hidden ones (a hidden session whose flag was later removed
  // loses its exemption); (b) visible sessions still in use but holding
  // messages older than the cutoff.
  const idleSessions = await pageAll<SessionRow>((from, to) => {
    let q = admin
      .from("chat_sessions")
      .select("id, user_id, hidden_from_parent, updated_at")
      .lt("updated_at", cutoff)
      .order("id")
      .range(from, to);
    if (scope) q = q.eq("user_id", scope.userId).eq("school_id", scope.schoolId);
    return q;
  });

  const oldMessageRows = await pageAll<{ chat_sessions: unknown }>((from, to) => {
    let q = admin
      .from("chat_messages")
      .select("session_id, chat_sessions!inner(id, user_id, school_id, hidden_from_parent, updated_at)")
      .lt("created_at", cutoff)
      .eq("chat_sessions.hidden_from_parent", false)
      .gte("chat_sessions.updated_at", cutoff)
      .order("id")
      .range(from, to);
    if (scope) {
      q = q.eq("chat_sessions.user_id", scope.userId).eq("chat_sessions.school_id", scope.schoolId);
    }
    return q;
  });

  const sessions = new Map<string, SessionRow>();
  for (const s of idleSessions) sessions.set(s.id, s);
  for (const row of oldMessageRows) {
    const joined = row.chat_sessions as SessionRow | SessionRow[] | null;
    for (const s of Array.isArray(joined) ? joined : joined ? [joined] : []) {
      sessions.set(s.id, s);
    }
  }
  result.sessionsChecked = sessions.size;
  if (sessions.size === 0) return result;

  const ownerBySession = new Map([...sessions.values()].map((s) => [s.id, s.user_id]));
  const flagged = await findFlaggedSessionIds(admin, ownerBySession);

  const recent = new Set<string>();
  for (const ids of chunks([...sessions.keys()])) {
    const { data, error } = await admin
      .from("chat_messages")
      .select("session_id")
      .in("session_id", ids)
      .gte("created_at", cutoff);
    if (error) throw error;
    for (const row of data ?? []) recent.add(row.session_id as string);
  }

  const plan = planPurge(
    [...sessions.values()].map((s) => ({
      id: s.id,
      flagged: flagged.has(s.id),
      hidden: s.hidden_from_parent,
      hasRecentMessages: recent.has(s.id),
      updated_at: s.updated_at,
    })),
    cutoff
  );

  for (const ids of chunks(plan.expireMessagesIn)) {
    const { count, error } = await admin
      .from("chat_messages")
      .delete({ count: "exact" })
      .in("session_id", ids)
      .lt("created_at", cutoff);
    if (error) console.error("purgeExpiredChats: message delete failed:", error);
    else result.messagesDeleted += count ?? 0;
  }

  for (const ids of chunks(plan.deleteSessions)) {
    // Re-checked in the statement: a send since we looked touches updated_at,
    // and must not lose its session (messages cascade with it).
    const { count, error } = await admin
      .from("chat_sessions")
      .delete({ count: "exact" })
      .in("id", ids)
      .lt("updated_at", cutoff);
    if (error) console.error("purgeExpiredChats: session delete failed:", error);
    else result.sessionsDeleted += count ?? 0;
  }

  for (const ids of chunks(plan.hide)) {
    const { count, error } = await admin
      .from("chat_sessions")
      .update({ hidden_from_parent: true }, { count: "exact" })
      .in("id", ids)
      .lt("updated_at", cutoff);
    if (error) console.error("purgeExpiredChats: hide failed:", error);
    else result.sessionsHidden += count ?? 0;
  }

  return result;
}

// --------------------------------------------
// The parent's one chat
// --------------------------------------------

/**
 * The parent's current chat session for a school: the most recent visible
 * one, created if there is none. Inserts with the service role — callers
 * must have authorized userId for schoolId.
 */
export async function getOrCreateParentSession(
  admin: SupabaseClient,
  userId: string,
  schoolId: string
): Promise<{ id: string; title: string | null }> {
  const { data: existing, error } = await admin
    .from("chat_sessions")
    .select("id, title")
    .eq("user_id", userId)
    .eq("school_id", schoolId)
    .eq("hidden_from_parent", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing as { id: string; title: string | null };

  const { data: created, error: insertError } = await admin
    .from("chat_sessions")
    .insert({ user_id: userId, school_id: schoolId, title: "New chat" })
    .select("id, title")
    .single();
  if (insertError) throw insertError;
  return created as { id: string; title: string | null };
}

/**
 * The session a chat request writes into. The one the client named if it is
 * still this parent's visible chat for the school — touched (updated_at) in
 * the same statement, so a concurrent purge can't delete it mid-request —
 * otherwise the parent's current chat (created if needed).
 */
export async function resolveParentSession(
  admin: SupabaseClient,
  userId: string,
  schoolId: string,
  requestedId: string | null | undefined
): Promise<string> {
  const now = new Date().toISOString();
  if (requestedId) {
    const { data } = await admin
      .from("chat_sessions")
      .update({ updated_at: now })
      .eq("id", requestedId)
      .eq("user_id", userId)
      .eq("school_id", schoolId)
      .eq("hidden_from_parent", false)
      .select("id")
      .maybeSingle();
    if (data) return data.id as string;
  }
  const session = await getOrCreateParentSession(admin, userId, schoolId);
  await admin.from("chat_sessions").update({ updated_at: now }).eq("id", session.id);
  return session.id;
}

// --------------------------------------------
// Model context
// --------------------------------------------

export interface StoredMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  parts: { type: "text"; text: string }[];
}

/**
 * The conversation the model sees: the session's stored messages from the
 * window (never what the client claims was said) plus the new question. A
 * stored trailing copy of the same question (a retry after a failed answer)
 * is dropped so it isn't sent twice.
 */
export function buildModelHistory<L>(
  stored: StoredMessage[],
  latest: L,
  latestText: string,
  cutoff: string
): (HistoryMessage | L)[] {
  const history: HistoryMessage[] = filterRecent(stored, cutoff)
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim())
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: m.content }],
    }));
  const tail = history[history.length - 1];
  if (tail?.role === "user" && tail.parts[0].text.trim() === latestText.trim()) history.pop();
  return [...history, latest];
}
