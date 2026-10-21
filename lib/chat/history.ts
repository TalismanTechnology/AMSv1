import type { SupabaseClient } from "@supabase/supabase-js";
import { isSessionId, retentionCutoff } from "./retention";
import type { ChatMessage, ChatSession } from "../types";

// Server-only reads of a parent's chat history, shared by the chat page and
// the chat server actions. Uses the service-role client, so every query is
// pinned to user_id + school_id here; callers must have verified userId's
// access to schoolId. RLS (migration 007: auth.uid() = user_id and school
// membership) backs this up for any user-client read.

/** The sidebar shows at most this many chats (most recent first). */
export const CHAT_LIST_LIMIT = 100;

export type ChatListItem = Pick<ChatSession, "id" | "title" | "created_at" | "updated_at">;

/**
 * The parent's visible chats in this school, most recently active first.
 * Expired ones (idle past the window, not yet purged) are left out.
 */
export async function listParentChats(
  admin: SupabaseClient,
  userId: string,
  schoolId: string,
  now: Date = new Date()
): Promise<ChatListItem[]> {
  const { data, error } = await admin
    .from("chat_sessions")
    .select("id, title, created_at, updated_at")
    .eq("user_id", userId)
    .eq("school_id", schoolId)
    .eq("hidden_from_parent", false)
    .gte("updated_at", retentionCutoff(now))
    .order("updated_at", { ascending: false })
    .limit(CHAT_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []) as ChatListItem[];
}

/**
 * One of the parent's visible chats with all its messages (and citations),
 * or null if it isn't theirs, is hidden from them, or has expired.
 */
export async function loadParentChat(
  admin: SupabaseClient,
  userId: string,
  schoolId: string,
  sessionId: string,
  now: Date = new Date()
): Promise<{ session: ChatListItem; messages: ChatMessage[] } | null> {
  if (!isSessionId(sessionId)) return null;
  const { data: session, error } = await admin
    .from("chat_sessions")
    .select("id, title, created_at, updated_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("school_id", schoolId)
    .eq("hidden_from_parent", false)
    .gte("updated_at", retentionCutoff(now))
    .maybeSingle();
  if (error) throw error;
  if (!session) return null;

  const { data: messages, error: messagesError } = await admin
    .from("chat_messages")
    .select("id, session_id, role, content, sources, school_id, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (messagesError) throw messagesError;
  return { session: session as ChatListItem, messages: (messages ?? []) as ChatMessage[] };
}
