"use server";

import { createClient } from "@/lib/supabase/server";

const MESSAGE_GONE =
  "This message is no longer available (its chat was deleted or expired), so it can't be rated.";

export async function submitFeedback(messageId: string, rating: "up" | "down", schoolId?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  // The message may have been deleted (or purged after 30 days) since it was
  // shown. Say so plainly rather than surfacing an FK/RLS error — and for a
  // thumbs-down, which flags the chat for staff, never report success on a
  // message that's gone.
  const { data: message } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("id", messageId)
    .maybeSingle();
  if (!message) return { error: MESSAGE_GONE };

  const { error } = await supabase.from("chat_feedback").upsert(
    {
      message_id: messageId,
      user_id: user.id,
      rating,
      ...(schoolId ? { school_id: schoolId } : {}),
    },
    { onConflict: "message_id,user_id" }
  );

  if (error) {
    if (rating === "down") {
      const { data: still } = await supabase
        .from("chat_messages")
        .select("id")
        .eq("id", messageId)
        .maybeSingle();
      if (!still) return { error: MESSAGE_GONE };
    }
    return { error: error.message };
  }
  return { success: true };
}

/**
 * Remove the parent's rating from a message. A thumbs-down flags the exchange
 * for school staff (migration 031); clearing it un-flags it again unless the
 * assistant also couldn't answer.
 */
export async function clearFeedback(messageId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("chat_feedback")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function getFeedback(messageId: string, schoolId?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  let query = supabase
    .from("chat_feedback")
    .select("rating")
    .eq("message_id", messageId)
    .eq("user_id", user.id);

  if (schoolId) query = query.eq("school_id", schoolId);

  const { data } = await query.single();

  return data?.rating as "up" | "down" | null;
}
