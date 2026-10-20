"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findFlaggedSessionIds,
  getOrCreateParentSession,
  recheckDeletable,
  retentionCutoff,
  truncateTitle,
} from "@/lib/chat/retention";

// Parents have one chat per school, showing only the last 30 minutes
// (lib/chat/retention.ts). The page loads it server-side
// (lib/chat/current-chat.ts); these are the client-callable pieces.

export async function getChatMessages(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", messages: [] };

  // Only the owner's chat that is still visible to them.
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
    .gte("created_at", retentionCutoff())
    .order("created_at", { ascending: true });

  if (error) return { error: error.message, messages: [] };
  return { messages: messages || [] };
}

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

/**
 * The parent's chat session for this school (get-or-create). Used by the chat
 * input when it has no session yet.
 */
export async function createChatSession(schoolId: string, title?: string) {
  const auth = await authorizeSchoolChat(schoolId);
  if ("error" in auth) return { error: auth.error };

  // Service role: the request is already authorized above, and the
  // chat_sessions RLS policy (is_school_member) would otherwise reject super
  // admins, who hold no school_memberships row.
  const admin = createAdminClient();
  try {
    const session = await getOrCreateParentSession(admin, auth.userId, schoolId);
    const sessionTitle = title && truncateTitle(title);
    if (sessionTitle && (!session.title || session.title === "New chat")) {
      await admin.from("chat_sessions").update({ title: sessionTitle }).eq("id", session.id);
    }
    return { sessionId: session.id };
  } catch (err) {
    console.error("createChatSession failed:", err);
    return { error: "Couldn't start the chat session. Please try again." };
  }
}

/**
 * "Clear chat": remove the parent's current conversation. An unflagged chat
 * has its messages deleted (the session row is reused). A flagged chat
 * (unanswered, or the parent's thumbs-down) stays reviewable by staff
 * (migration 031), so it is hidden from the parent instead and a fresh
 * session takes its place. Returns the session to continue in.
 */
export async function clearChat(schoolId: string) {
  const auth = await authorizeSchoolChat(schoolId);
  if ("error" in auth) return { error: auth.error };
  const userId = auth.userId;
  const admin = createAdminClient();

  try {
    const { data: sessions, error: lookupError } = await admin
      .from("chat_sessions")
      .select("id, user_id")
      .eq("user_id", userId)
      .eq("school_id", schoolId)
      .eq("hidden_from_parent", false);
    if (lookupError) throw lookupError;

    const ownerBySession = new Map(
      ((sessions ?? []) as { id: string; user_id: string }[]).map((s) => [s.id, s.user_id])
    );
    const flagged = await findFlaggedSessionIds(admin, ownerBySession);
    const hide = [...ownerBySession.keys()].filter((id) => flagged.has(id));
    // Re-check just before deleting: a thumbs-down or an unanswered reply may
    // have landed since the lookup (see recheckDeletable for what remains).
    const candidates = [...ownerBySession.keys()].filter((id) => !flagged.has(id));
    const wipe = await recheckDeletable(admin, candidates, ownerBySession);
    hide.push(...candidates.filter((id) => !wipe.includes(id)));

    if (hide.length > 0) {
      const { error } = await admin
        .from("chat_sessions")
        .update({ hidden_from_parent: true })
        .in("id", hide)
        .eq("user_id", userId);
      if (error) throw error;
    }
    if (wipe.length > 0) {
      const { error } = await admin
        .from("chat_messages")
        .delete()
        .in("session_id", wipe)
        // In-statement guard: an unanswered reply stays reviewable by staff.
        .eq("unanswered", false);
      if (error) throw error;
      const { error: titleError } = await admin
        .from("chat_sessions")
        .update({ title: "New chat", updated_at: new Date().toISOString() })
        .in("id", wipe)
        .eq("user_id", userId);
      if (titleError) throw titleError;
    }

    const session = await getOrCreateParentSession(admin, userId, schoolId);
    return { sessionId: session.id };
  } catch (err) {
    console.error("clearChat failed:", err);
    return { error: "Couldn't clear the chat. Please try again." };
  }
}
