import type { SupabaseClient } from "@supabase/supabase-js";

// Parent chat history. A parent has any number of chats (chat_sessions rows)
// per school, each kept for CHAT_RETENTION_DAYS from its last activity
// (updated_at, touched by every send). A whole chat idle longer than that is
// deleted by /api/cron/purge-chats (and for the current parent on chat page
// load), EXCEPT a "flagged" chat — an unanswered exchange, or the owner's
// thumbs-down (migration 031) — which school staff may review. That is kept
// in full and, once idle past the window, hidden from the parent
// (hidden_from_parent, migration 037). A parent deleting a flagged chat
// hides it the same way. A session with activity in the last
// PURGE_GRACE_MINUTES is left for the next run, and every delete re-checks
// flags first (recheckDeletable).

export const CHAT_RETENTION_DAYS = 30;
const RETENTION_MS = CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * The purge leaves a session alone entirely (no expiry, no delete) if it saw
 * any activity — a message, a rating, a send — this recently, so a
 * thumbs-down or an unanswered reply landing mid-purge isn't racing it.
 */
export const PURGE_GRACE_MINUTES = 2;
const GRACE_MS = PURGE_GRACE_MINUTES * 60 * 1000;

/** ISO timestamp: a chat last active before this has expired. */
export function retentionCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - RETENTION_MS).toISOString();
}

/** ISO timestamp since which activity puts a session in the grace window. */
export function graceCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - GRACE_MS).toISOString();
}

/** Whether a row created at `createdAt` is still inside the window. */
export function isWithinRetention(createdAt: string, cutoff: string): boolean {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= Date.parse(cutoff);
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

/**
 * Of `ids`, the sessions with a message or a rating created at/after `since`.
 * (A rating changed up -> down keeps its created_at; the flag re-check, not
 * this, covers that.) Throws on query errors.
 */
export async function findActiveSessionIds(
  admin: SupabaseClient,
  ids: string[],
  since: string
): Promise<Set<string>> {
  const active = new Set<string>();
  for (const chunk of chunks(ids)) {
    const { data: messages, error: messagesError } = await admin
      .from("chat_messages")
      .select("session_id")
      .in("session_id", chunk)
      .gte("created_at", since);
    if (messagesError) throw messagesError;
    for (const row of messages ?? []) active.add(row.session_id as string);

    const { data: ratings, error: ratingsError } = await admin
      .from("chat_feedback")
      .select("chat_messages!inner(session_id)")
      .in("chat_messages.session_id", chunk)
      .gte("created_at", since);
    if (ratingsError) throw ratingsError;
    for (const row of ratings ?? []) {
      const msg = (row as { chat_messages: unknown }).chat_messages as
        | { session_id: string }
        | { session_id: string }[]
        | null;
      for (const m of Array.isArray(msg) ? msg : msg ? [msg] : []) active.add(m.session_id);
    }
  }
  return active;
}

/** `ids` minus any session now flagged or recently active, order preserved. */
export function stillDeletable(
  ids: string[],
  { flagged, active }: { flagged: ReadonlySet<string>; active?: ReadonlySet<string> }
): string[] {
  return ids.filter((id) => !flagged.has(id) && !active?.has(id));
}

/**
 * Re-check a chunk of sessions immediately before deleting from them: drop
 * any that became flagged (an unanswered reply, the owner's thumbs-down) or,
 * when `activeSince` is given, saw activity in the grace window since the
 * plan was made.
 *
 * Remaining window: PostgREST can't express "no unanswered message and no
 * owner thumbs-down anywhere in this session" in a DELETE, so a flag landing
 * between this re-check and the delete statement (milliseconds, where it
 * used to be the whole run) can still be lost. In-statement guards narrow
 * it: message deletes skip unanswered rows, and session deletes require
 * updated_at to still be past the cutoff (every send touches it). What's
 * left is a thumbs-down on a message just past the cutoff, or the older
 * siblings of an unanswered reply, racing that gap. Closing it fully needs a
 * DB-side function deleting under a row lock (a migration).
 */
export async function recheckDeletable(
  admin: SupabaseClient,
  ids: string[],
  ownerBySession: ReadonlyMap<string, string | null>,
  activeSince?: string
): Promise<string[]> {
  if (ids.length === 0) return [];
  const owners = new Map(ids.map((id) => [id, ownerBySession.get(id) ?? null]));
  const flagged = await findFlaggedSessionIds(admin, owners);
  const active = activeSince ? await findActiveSessionIds(admin, ids, activeSince) : undefined;
  return stillDeletable(ids, { flagged, active });
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
  /** Last activity: touched by every send. */
  updated_at: string;
  /**
   * A message, rating or send within the grace window (PURGE_GRACE_MINUTES):
   * skipped this run, whatever its state.
   */
  recentlyActive?: boolean;
}

export interface PurgePlan {
  /** Unflagged chats idle past the window: delete the whole session. */
  deleteSessions: string[];
  /** Flagged chats idle past the window, still visible to the parent: hide. */
  hide: string[];
}

export function planPurge(candidates: PurgeCandidate[], cutoff: string): PurgePlan {
  const plan: PurgePlan = { deleteSessions: [], hide: [] };
  for (const s of candidates) {
    if (s.recentlyActive) continue;
    const idle = !s.hasRecentMessages && !isWithinRetention(s.updated_at, cutoff);
    if (!idle) continue;
    if (s.flagged) {
      // Never delete flagged content; just take it out of the parent's view.
      if (!s.hidden) plan.hide.push(s.id);
      continue;
    }
    plan.deleteSessions.push(s.id);
  }
  return plan;
}

export interface PurgeResult {
  sessionsChecked: number;
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
 * Apply the 30-day retention rule — to every parent (cron), or to one
 * parent's chats in one school (`scope`, run on chat page load). Uses the
 * service-role client. Throws if flags can't be determined (nothing is
 * deleted in that case); callers decide whether to swallow.
 */
export async function purgeExpiredChats(
  admin: SupabaseClient,
  { now = new Date(), scope }: { now?: Date; scope?: { userId: string; schoolId: string } } = {}
): Promise<PurgeResult> {
  const cutoff = retentionCutoff(now);
  const activeSince = graceCutoff(now);
  const result: PurgeResult = { sessionsChecked: 0, sessionsDeleted: 0, sessionsHidden: 0 };

  // Candidates: sessions idle past the cutoff — visible ones (to delete or
  // hide) and hidden ones (a hidden session whose flag was later removed
  // loses its exemption).
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

  const sessions = new Map<string, SessionRow>(idleSessions.map((s) => [s.id, s]));
  result.sessionsChecked = sessions.size;
  if (sessions.size === 0) return result;

  const ownerBySession = new Map([...sessions.values()].map((s) => [s.id, s.user_id]));
  const flagged = await findFlaggedSessionIds(admin, ownerBySession);

  // A message newer than the cutoff in a session whose updated_at wasn't
  // touched (a failed background write) still counts as activity.
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
  const active = await findActiveSessionIds(admin, [...sessions.keys()], activeSince);

  const plan = planPurge(
    [...sessions.values()].map((s) => ({
      id: s.id,
      flagged: flagged.has(s.id),
      hidden: s.hidden_from_parent,
      hasRecentMessages: recent.has(s.id),
      updated_at: s.updated_at,
      recentlyActive: active.has(s.id) || isWithinRetention(s.updated_at, activeSince),
    })),
    cutoff
  );

  // Each delete chunk re-checks flags and grace-window activity first (see
  // recheckDeletable for the window that remains). A failed re-check skips
  // the chunk; the next run retries.
  for (const chunk of chunks(plan.deleteSessions)) {
    let ids: string[];
    try {
      ids = await recheckDeletable(admin, chunk, ownerBySession, activeSince);
    } catch (err) {
      console.error("purgeExpiredChats: session re-check failed:", err);
      continue;
    }
    if (ids.length === 0) continue;
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
// Which session a question goes into
// --------------------------------------------
//
// The client always names the chat it is sending into: a session id, or
// null for a new chat. A new chat must never land in an older one, so there
// is deliberately no "the parent's latest session" fallback anywhere.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * The request body's `sessionId`: a session id, or null for a new chat. A
 * missing or malformed field is rejected rather than guessed at.
 */
export function parseRequestedSessionId(
  body: unknown
): { ok: true; sessionId: string | null } | { ok: false } {
  if (!body || typeof body !== "object" || !("sessionId" in body)) return { ok: false };
  const value = (body as { sessionId: unknown }).sessionId;
  if (value === null) return { ok: true, sessionId: null };
  return isSessionId(value) ? { ok: true, sessionId: value } : { ok: false };
}

/**
 * Claim `sessionId` for a send: only if it is this parent's chat in this
 * school, not hidden from them, and not expired. Touched (updated_at) in the
 * same statement, so a concurrent purge can't delete it mid-request. Null
 * when it isn't theirs to write to; throws on a query error.
 */
export async function claimParentSession(
  admin: SupabaseClient,
  userId: string,
  schoolId: string,
  sessionId: string,
  now: Date = new Date()
): Promise<string | null> {
  if (!isSessionId(sessionId)) return null;
  const { data, error } = await admin
    .from("chat_sessions")
    .update({ updated_at: now.toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("school_id", schoolId)
    .eq("hidden_from_parent", false)
    .gte("updated_at", retentionCutoff(now))
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data ? (data.id as string) : null;
}

/**
 * A new chat session for the parent. Inserts with the service role — callers
 * must have authorized userId for schoolId.
 */
export async function createParentSession(
  admin: SupabaseClient,
  userId: string,
  schoolId: string,
  title?: string
): Promise<string> {
  const { data, error } = await admin
    .from("chat_sessions")
    .insert({ user_id: userId, school_id: schoolId, title: title?.trim() || "New chat" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * The session a question writes into: the named one if `claimParentSession`
 * allows it, otherwise (null, someone else's, hidden, expired, deleted) a new
 * session — never an existing one the client didn't name.
 */
export async function resolveParentSession(
  admin: SupabaseClient,
  userId: string,
  schoolId: string,
  requestedId: string | null,
  title?: string
): Promise<{ sessionId: string; created: boolean }> {
  if (requestedId) {
    const claimed = await claimParentSession(admin, userId, schoolId, requestedId);
    if (claimed) return { sessionId: claimed, created: false };
  }
  return { sessionId: await createParentSession(admin, userId, schoolId, title), created: true };
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

/** At most this many stored messages (the latest) go to the model. */
export const MAX_HISTORY_MESSAGES = 40;

/**
 * The conversation the model sees: the session's latest stored messages
 * (never what the client claims was said) plus the new question. A stored
 * trailing copy of the same question (a retry after a failed answer) is
 * dropped so it isn't sent twice.
 */
export function buildModelHistory<L>(
  stored: StoredMessage[],
  latest: L,
  latestText: string
): (HistoryMessage | L)[] {
  const history: HistoryMessage[] = stored
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim())
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: m.content }],
    }))
    .slice(-MAX_HISTORY_MESSAGES);
  const tail = history[history.length - 1];
  if (tail?.role === "user" && tail.parts[0].text.trim() === latestText.trim()) history.pop();
  return [...history, latest];
}
