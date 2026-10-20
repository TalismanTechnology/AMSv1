// Which chat the parent chat page shows, and whether it may be sent into.
//
// A past chat is only mounted once its messages have loaded: the chat input
// binds to the session, so mounting it empty would let a parent append a new
// question to an old chat they can't see (which then looked like a fresh
// chat, and the old one appeared to vanish).

export interface ChatView<M = unknown> {
  /** Remount key for ChatInterface. "new…" for a fresh chat. */
  key: string;
  /** Session the input sends into; null until a fresh chat's first send. */
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

/**
 * The view on page open: a fresh chat, unless `requestedId` (?chat=<id>)
 * names one of the parent's listed sessions.
 */
export function initialChatView<M = unknown>(
  sessions: { id: string }[],
  requestedId?: string | null
): ChatView<M> {
  if (requestedId && sessions.some((s) => s.id === requestedId)) {
    return openChatView(requestedId);
  }
  return newChatView();
}

/** Selecting the chat already open (e.g. one just started) keeps it as is. */
export function selectChatView<M>(view: ChatView<M>, sessionId: string): ChatView<M> {
  return view.sessionId === sessionId ? view : openChatView(sessionId);
}

/** A fresh chat got its session on first send: bind it without remounting. */
export function bindCreatedSession<M>(view: ChatView<M>, sessionId: string): ChatView<M> {
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
