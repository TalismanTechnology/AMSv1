"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findFlaggedSessionIds, isSessionId, recheckDeletable } from "@/lib/chat/retention";
import { listParentChats, loadParentChat } from "@/lib/chat/history";
import { normalizeChatTitle } from "@/lib/chat/chat-view";

// Parent chat history (lib/chat/retention.ts): list, open, rename and delete
// the signed-in parent's own chats. Every query is pinned to the caller's
// user_id + the school; the service-role client is used because the
// chat_sessions RLS policy (is_school_member) would otherwise reject super
// admins, who hold no school_memberships row. New chats are created by
// /api/chat on their first question.

/** Whether the signed-in user may chat in this school. */
async function authorizeSchoolChat(schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" } as const;

  // Authorize: super admins, or approved members of this school.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    const { data: membership } = await supabase
      .from("school_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("school_id", schoolId)
      .eq("approved", true)
      .single();
    if (!membership) {
      return { error: "You don't have access to this school's chat." } as const;
    }
  }
  return { userId: user.id } as const;
}

/** The parent's chats in this school, most recently active first. */
export async function getChatSessions(schoolId: string) {
  const auth = await authorizeSchoolChat(schoolId);
  if ("error" in auth) return { error: auth.error, sessions: [] };
  try {
    return { sessions: await listParentChats(createAdminClient(), auth.userId, schoolId) };
  } catch (err) {
    console.error("getChatSessions failed:", err);
    return { error: "Couldn't load your chats.", sessions: [] };
  }
}

/** One of the parent's chats with all its messages and citations. */
export async function getChatMessages(sessionId: string, schoolId: string) {
  const auth = await authorizeSchoolChat(schoolId);
  if ("error" in auth) return { error: auth.error, messages: [] };
  try {
    const chat = await loadParentChat(createAdminClient(), auth.userId, schoolId, sessionId);
    if (!chat) return { error: "This chat is no longer available.", messages: [] };
    return { messages: chat.messages };
  } catch (err) {
    console.error("getChatMessages failed:", err);
    return { error: "Please try again.", messages: [] };
  }
}

/** Rename one of the parent's chats. Doesn't count as activity. */
export async function renameChatSession(sessionId: string, schoolId: string, title: string) {
  const name = normalizeChatTitle(title);
  if (!name) return { error: "Enter a name for this chat." };
  if (!isSessionId(sessionId)) return { error: "Chat not found." };
  const auth = await authorizeSchoolChat(schoolId);
  if ("error" in auth) return { error: auth.error };

  const { data, error } = await createAdminClient()
    .from("chat_sessions")
    .update({ title: name })
    .eq("id", sessionId)
    .eq("user_id", auth.userId)
    .eq("school_id", schoolId)
    .eq("hidden_from_parent", false)
    .select("id, title")
    .maybeSingle();
  if (error) {
    console.error("renameChatSession failed:", error);
    return { error: "Couldn't rename the chat. Please try again." };
  }
  if (!data) return { error: "Chat not found." };
  return { title: data.title as string };
}

/**
 * Delete one of the parent's chats. An unflagged chat is deleted for real
 * (messages cascade). A flagged chat (unanswered, or the parent's
 * thumbs-down) stays reviewable by staff (migration 031), so it is hidden
 * from the parent instead. Flags are re-checked just before deleting.
 */
export async function deleteChatSession(sessionId: string, schoolId: string) {
  if (!isSessionId(sessionId)) return { error: "Chat not found." };
  const auth = await authorizeSchoolChat(schoolId);
  if ("error" in auth) return { error: auth.error };
  const userId = auth.userId;
  const admin = createAdminClient();

  try {
    const { data: session, error: lookupError } = await admin
      .from("chat_sessions")
      .select("id, user_id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("school_id", schoolId)
      .eq("hidden_from_parent", false)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!session) return { error: "Chat not found." };

    const owners = new Map([[sessionId, userId]]);
    const flagged = await findFlaggedSessionIds(admin, owners);
    // Re-check just before deleting: a thumbs-down or an unanswered reply may
    // have landed since the lookup (see recheckDeletable for what remains).
    const deletable = flagged.has(sessionId)
      ? false
      : (await recheckDeletable(admin, [sessionId], owners)).includes(sessionId);

    if (deletable) {
      const { error } = await admin
        .from("chat_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", userId)
        .eq("school_id", schoolId);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("chat_sessions")
        .update({ hidden_from_parent: true })
        .eq("id", sessionId)
        .eq("user_id", userId)
        .eq("school_id", schoolId);
      if (error) throw error;
    }
    return { success: true };
  } catch (err) {
    console.error("deleteChatSession failed:", err);
    return { error: "Couldn't delete the chat. Please try again." };
  }
}
