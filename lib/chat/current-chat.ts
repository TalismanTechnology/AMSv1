import { createAdminClient } from "@/lib/supabase/admin";
import { purgeExpiredChats } from "@/lib/chat/retention";
import { listParentChats, loadParentChat, type ChatListItem } from "@/lib/chat/history";
import type { ChatMessage } from "@/lib/types";

/**
 * Server-only: what the parent chat page opens with — the parent's chat list
 * and, when `requestedId` (?chat=<id>) names one of their visible chats, that
 * chat with its messages; otherwise a new chat. Runs the retention purge for
 * this parent first (cheap, scoped to their sessions). Callers must have
 * verified userId's access to schoolId (requireSchoolContext).
 */
export async function loadChatPage(
  userId: string,
  schoolId: string,
  requestedId?: string | null
): Promise<{
  chats: ChatListItem[];
  open: { session: ChatListItem; messages: ChatMessage[] } | null;
}> {
  const admin = createAdminClient();
  try {
    await purgeExpiredChats(admin, { scope: { userId, schoolId } });
  } catch (err) {
    // The cron catches up; the reads below skip expired chats anyway.
    console.error("loadChatPage purge failed:", err);
  }

  const [chats, open] = await Promise.all([
    listParentChats(admin, userId, schoolId),
    requestedId ? loadParentChat(admin, userId, schoolId, requestedId) : Promise.resolve(null),
  ]);
  return { chats, open };
}
