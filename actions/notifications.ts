"use server";

import { createClient } from "@/lib/supabase/server";

export async function getNotifications(schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", notifications: [] };

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return { error: error.message, notifications: [] };
  return { notifications: data || [] };
}

export async function getUnreadCount(schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .eq("read", false);

  return count || 0;
}

export async function markNotificationRead(id: string, schoolId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function markAllRead(schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .eq("read", false);

  if (error) return { error: error.message };
  return { success: true };
}
