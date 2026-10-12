"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  CHAT_HISTORY_LIMIT,
  findFlaggedSessionIds,
  pruneChatHistory,
  truncateTitle,
} from "@/lib/chat/history-retention";

export async function getChatSessions(schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", sessions: [] };

  const { data: sessions, error } = await supabase
    .from("chat_sessions")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .eq("hidden_from_parent", false)
    .order("updated_at", { ascending: false })
    .limit(CHAT_HISTORY_LIMIT);

  if (error) return { error: error.message, sessions: [] };
  return { sessions: sessions || [] };
}

export async function getChatMessages(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", messages: [] };

  // Only the owner's chats that are still in their visible history.
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("hidden_from_parent", false)
    .maybeSingle();

  if (!session) return { error: "Chat not found", messages: [] };

  const { data: messages, error } = await supabase
    .from("chat_messages")
    .select("id, session_id, role, content, sources, school_id, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) return { error: error.message, messages: [] };
  return { messages: messages || [] };
}

export async function createChatSession(schoolId: string, title?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

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
      return { error: "You don't have access to this school's chat." };
    }
  }

  const sessionTitle = (title && truncateTitle(title)) || "New chat";

  // Insert with the admin client: the request is already authorized above, and
  // the chat_sessions RLS policy (is_school_member) would otherwise reject
  // super admins, who hold no school_memberships row.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("chat_sessions")
    .insert({ user_id: user.id, title: sessionTitle, school_id: schoolId })
    .select("id")
    .single();

  if (error) {
    console.error("createChatSession insert failed:", error);
    return { error: error.message };
  }

  await pruneChatHistory(admin, user.id, schoolId, CHAT_HISTORY_LIMIT);
  return { sessionId: data.id };
}

export async function searchChatMessages(query: string, schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", results: [] };

  const { data, error } = await supabase
    .from("chat_messages")
    .select(
      "id, session_id, role, content, created_at, chat_sessions!inner(title, user_id, school_id)"
    )
    .eq("chat_sessions.user_id", user.id)
    .eq("chat_sessions.school_id", schoolId)
    .eq("chat_sessions.hidden_from_parent", false)
    .ilike("content", `%${query}%`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return { error: error.message, results: [] };

  const results = (data || []).map((msg) => ({
    id: msg.id,
    sessionId: msg.session_id,
    role: msg.role as "user" | "assistant",
    content: msg.content,
    sessionTitle: (msg.chat_sessions as unknown as { title: string | null })?.title || "Untitled",
    createdAt: msg.created_at,
  }));

  return { results };
}

/**
 * Remove chats (already verified as owned by userId) from the parent's
 * history. Flagged chats (unanswered, or the owner's thumbs-down) stay
 * reviewable by staff (migration 031), so they're hidden, not deleted.
 */
async function removeFromHistory(
  userId: string,
  sessionIds: string[]
): Promise<{ error?: string }> {
  if (sessionIds.length === 0) return {};
  const admin = createAdminClient();

  let flagged: Set<string>;
  try {
    flagged = await findFlaggedSessionIds(admin, userId, sessionIds);
  } catch (err) {
    console.error("removeFromHistory flag lookup failed:", err);
    return { error: "Couldn't delete chat. Please try again." };
  }

  const hide = sessionIds.filter((id) => flagged.has(id));
  const remove = sessionIds.filter((id) => !flagged.has(id));

  if (hide.length > 0) {
    const { error } = await admin
      .from("chat_sessions")
      .update({ hidden_from_parent: true })
      .in("id", hide)
      .eq("user_id", userId);
    if (error) return { error: error.message };
  }
  if (remove.length > 0) {
    const { error } = await admin
      .from("chat_sessions")
      .delete()
      .in("id", remove)
      .eq("user_id", userId);
    if (error) return { error: error.message };
  }
  return {};
}

export async function deleteChatSession(sessionId: string, schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Verify ownership with the user's client before acting with the admin one.
  const { data: session, error: lookupError } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (lookupError) return { error: lookupError.message };
  if (!session) return { error: "Chat not found" };

  const { error } = await removeFromHistory(user.id, [session.id]);
  if (error) return { error };
  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteAllChatSessions(schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: sessions, error: lookupError } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .eq("hidden_from_parent", false);

  if (lookupError) return { error: lookupError.message };

  const { error } = await removeFromHistory(
    user.id,
    (sessions || []).map((s) => s.id)
  );
  if (error) return { error };
  revalidatePath("/", "layout");
  return { success: true };
}
