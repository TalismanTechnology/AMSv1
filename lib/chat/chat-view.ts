// Parent chat page state (which chat is open, the history list) and session
// titling for /api/chat.

import { resolveSchoolName } from "../school-display-name";

// --------------------------------------------
// The open chat
// --------------------------------------------
//
// A past chat is only mounted once its messages have loaded: the chat input
// binds to the session, so mounting it empty would let a parent append a new
// question to an old chat they can't see. A new chat has sessionId null
// until /api/chat creates its session on the first question.

export interface ChatView<M = unknown> {
  /** Remount key for ChatInterface. "new…" for a new chat. */
  key: string;
  /** Session the input sends into; null for a new chat until its first send. */
  sessionId: string | null;
  /** Messages to show; null while a reopened chat is still loading. */
  messages: M[] | null;
  /** Set when a reopened chat's messages failed to load. */
  error?: string;
}

export function newChatView<M = unknown>(key = "new"): ChatView<M> {
  return { key, sessionId: null, messages: [] };
}

export function openChatView<M = unknown>(sessionId: string): ChatView<M> {
  return { key: sessionId, sessionId, messages: null };
}

/** A chat whose messages arrived with the page. */
export function loadedChatView<M>(sessionId: string, messages: M[]): ChatView<M> {
  return { key: sessionId, sessionId, messages };
}

/** Selecting the chat already open (e.g. one just started) keeps it as is. */
export function selectChatView<M>(view: ChatView<M>, sessionId: string): ChatView<M> {
  return view.sessionId === sessionId ? view : openChatView(sessionId);
}

/**
 * The server told the chat mounted as `key` which session it wrote into (a
 * new chat's first question, or a chat that had been deleted elsewhere).
 * Applied only if that chat is still the one open: a reply still streaming
 * into a chat the parent has left must never rebind the chat they're in now.
 */
export function bindCreatedSession<M>(
  view: ChatView<M>,
  key: string,
  sessionId: string
): ChatView<M> {
  if (view.key !== key || view.sessionId === sessionId) return view;
  return { ...view, sessionId };
}

/**
 * Apply a fetch result for `sessionId`. Ignored unless that session is still
 * the one waiting to load (a stale response for a chat the parent has since
 * left must not land in another one).
 */
export function applyLoadedMessages<M>(
  view: ChatView<M>,
  sessionId: string,
  result: { messages?: M[]; error?: string }
): ChatView<M> {
  if (view.key !== sessionId || view.messages !== null) return view;
  if (result.error) return { ...view, error: result.error };
  return { ...view, messages: result.messages ?? [] };
}

/** Whether the chat input (bound to view.sessionId) may be shown. */
export function canMountChat(view: ChatView): boolean {
  return view.messages !== null && !view.error;
}

// --------------------------------------------
// The history list
// --------------------------------------------

export type ChatGroupLabel = "Today" | "Yesterday" | "Previous 7 days" | "Older";

export interface ChatGroup<S> {
  label: ChatGroupLabel;
  sessions: S[];
}

/**
 * Sessions grouped by last activity (updated_at) in the viewer's local time:
 * today, yesterday, the 7 days before that, and older. Most recent first
 * within each group; empty groups are left out. A timestamp in the future
 * (clock skew) counts as today; an unparseable one as older.
 */
export function groupChatsByDate<S extends { updated_at: string }>(
  sessions: S[],
  now: Date = new Date()
): ChatGroup<S>[] {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  // Local midnights via the calendar, so DST days are still one day.
  const startToday = new Date(y, m, d).getTime();
  const startYesterday = new Date(y, m, d - 1).getTime();
  const startWeek = new Date(y, m, d - 8).getTime();

  const order: ChatGroupLabel[] = ["Today", "Yesterday", "Previous 7 days", "Older"];
  const buckets = new Map<ChatGroupLabel, { t: number; s: S }[]>(order.map((l) => [l, []]));
  for (const s of sessions) {
    const t = Date.parse(s.updated_at);
    const label: ChatGroupLabel = !Number.isFinite(t)
      ? "Older"
      : t >= startToday
        ? "Today"
        : t >= startYesterday
          ? "Yesterday"
          : t >= startWeek
            ? "Previous 7 days"
            : "Older";
    buckets.get(label)!.push({ t: Number.isFinite(t) ? t : -Infinity, s });
  }
  return order
    .map((label) => ({
      label,
      sessions: buckets
        .get(label)!
        .sort((a, b) => b.t - a.t)
        .map((e) => e.s),
    }))
    .filter((g) => g.sessions.length > 0);
}

/** Most recently active first, after a local change (a send, a rename). */
export function sortChatsByActivity<S extends { updated_at: string }>(sessions: S[]): S[] {
  const t = (s: S) => {
    const v = Date.parse(s.updated_at);
    return Number.isFinite(v) ? v : -Infinity;
  };
  return [...sessions].sort((a, b) => t(b) - t(a));
}

export const CHAT_TITLE_MAX = 80;

/** A parent-entered chat name: trimmed, single-spaced, capped; null if blank. */
export function normalizeChatTitle(input: string): string | null {
  const clean = input.trim().replace(/\s+/g, " ");
  if (!clean) return null;
  return clean.length > CHAT_TITLE_MAX ? clean.slice(0, CHAT_TITLE_MAX).trimEnd() : clean;
}

/** What the list and header show for a chat. */
export function chatDisplayTitle(title: string | null | undefined): string {
  return title?.trim() || "New chat";
}

// --------------------------------------------
// Titles
// --------------------------------------------

/**
 * Server side: whether this question should (re)title its session. Only the
 * session's first question titles it — judged by what's stored, never by the
 * message count the client sent, which is wrong whenever the client didn't
 * have the history loaded.
 */
export function shouldAutoTitle(session: {
  title: string | null | undefined;
  priorMessageCount: number | null | undefined;
}): boolean {
  if (!session.title?.trim()) return true;
  return session.priorMessageCount === 0;
}

/**
 * The parent chat header for a new chat (no title yet): the school's name.
 * An open chat shows its own title.
 */
export function parentChatHeading(schoolName: string | null | undefined): string {
  return resolveSchoolName(schoolName) ?? "Ask about your school";
}
