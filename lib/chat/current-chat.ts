import { createAdminClient } from "@/lib/supabase/admin";
import {
  getOrCreateParentSession,
  purgeExpiredChats,
  retentionCutoff,
} from "@/lib/chat/retention";
import type { ChatMessage, ChatSession } from "@/lib/types";

/**
 * Server-only: the parent's one chat for the chat page, loaded before the
 * chat input mounts. Runs the 30-minute purge for this parent first (cheap,
 * scoped to their sessions), so a reopened app never shows expired messages
 * and an idle flagged chat is swapped for a fresh one. Callers must have
 * verified userId's access to schoolId (requireSchoolContext).
 */
export async function loadCurrentChat(
  userId: string,
  schoolId: string
): Promise<{ session: Pick<ChatSession, "id" | "title">; messages: ChatMessage[] }> {
  const admin = createAdminClient();
  try {
    await purgeExpiredChats(admin, { scope: { userId, schoolId } });
  } catch (err) {
    // The cron catches up; the read below is filtered to the window anyway.
    console.error("loadCurrentChat purge failed:", err);
  }

  const session = await getOrCreateParentSession(admin, userId, schoolId);
  const { data, error } = await admin
    .from("chat_messages")
    .select("id, session_id, role, content, sources, school_id, created_at")
    .eq("session_id", session.id)
    .gte("created_at", retentionCutoff())
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return { session, messages: (data ?? []) as ChatMessage[] };
}
