"use server";

import { createClient } from "@/lib/supabase/server";

export async function submitFeedback(messageId: string, rating: "up" | "down", schoolId?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase.from("chat_feedback").upsert(
    {
      message_id: messageId,
      user_id: user.id,
      rating,
      ...(schoolId ? { school_id: schoolId } : {}),
    },
    { onConflict: "message_id,user_id" }
  );

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
