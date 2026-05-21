"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

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
    .order("updated_at", { ascending: false });

  if (error) return { error: error.message, sessions: [] };
  return { sessions: sessions || [] };
}

export async function getChatMessages(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", messages: [] };

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

  const sessionTitle = title
    ? title.slice(0, 60) + (title.length > 60 ? "..." : "")
    : "New chat";

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

export async function deleteChatSession(sessionId: string, schoolId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteAllChatSessions(schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("user_id", user.id)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { success: true };
}
