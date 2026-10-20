// Session titling for /api/chat.

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
