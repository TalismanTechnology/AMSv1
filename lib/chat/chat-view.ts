// Session titling for /api/chat, and the parent chat header.

import { resolveSchoolName } from "../school-display-name";

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
 * The parent chat's header. A parent has one rolling 30-minute chat, so a
 * per-session title (its first question, possibly long gone) would be stale;
 * show the school instead. Staff views still show session titles.
 */
export function parentChatHeading(schoolName: string | null | undefined): string {
  return resolveSchoolName(schoolName) ?? "Ask about your school";
}
