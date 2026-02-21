"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

export async function approveUser(userId: string, schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("school_memberships")
    .update({ approved: true })
    .eq("user_id", userId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  if (user) logAudit(user.id, "approve_user", "user", userId, undefined, schoolId);

  revalidatePath("/", "layout");
  return { success: true };
}

export async function approveAllPending(schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: pending } = await supabase
    .from("school_memberships")
    .select("user_id")
    .eq("school_id", schoolId)
    .eq("approved", false);

  const { error } = await supabase
    .from("school_memberships")
    .update({ approved: true })
    .eq("school_id", schoolId)
    .eq("approved", false);

  if (error) return { error: error.message };

  const count = pending?.length ?? 0;
  if (user) logAudit(user.id, "approve_all_users", "school", schoolId, { count }, schoolId);

  revalidatePath("/", "layout");
  return { success: true, count };
}

export async function changeUserRole(userId: string, role: "admin" | "parent", schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("school_memberships")
    .update({ role })
    .eq("user_id", userId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  if (user) logAudit(user.id, "change_user_role", "user", userId, { role }, schoolId);

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteUser(userId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (error) return { error: error.message };

  if (user) logAudit(user.id, "delete_user", "user", userId);

  revalidatePath("/", "layout");
  return { success: true };
}
