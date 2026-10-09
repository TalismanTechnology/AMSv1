"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { deleteAccount } from "@/lib/account/delete-account";

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

/**
 * A school admin removes a member from their school.
 *
 * If the member belongs to no other school, their whole account is deleted:
 * personal data and the Supabase auth user (previously only the profile row
 * was deleted, leaving the auth user able to sign in again and orphaning
 * data). If they also belong to another school, only this school's
 * membership and children are removed, since one school's admin must not
 * delete an account another school relies on.
 */
export async function deleteUser(
  userId: string,
  schoolId: string
): Promise<{ success: true; removedFromSchoolOnly?: boolean } | { error: string }> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  if (auth.userId === userId) {
    return { error: "You can't delete your own account here. Use your profile settings." };
  }

  const admin = createAdminClient();

  const [{ data: target }, { data: memberships }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
    admin.from("school_memberships").select("school_id").eq("user_id", userId),
  ]);

  const schoolIds = (memberships ?? []).map((m) => m.school_id as string);
  if (!schoolIds.includes(schoolId)) {
    return { error: "This user isn't a member of your school." };
  }
  if (target?.role === "super_admin") {
    return { error: "Super admin accounts can't be deleted here." };
  }

  if (schoolIds.some((id) => id !== schoolId)) {
    const { error: childError } = await admin
      .from("children")
      .delete()
      .eq("parent_id", userId)
      .eq("school_id", schoolId);
    if (childError) return { error: childError.message };

    const { error } = await admin
      .from("school_memberships")
      .delete()
      .eq("user_id", userId)
      .eq("school_id", schoolId);
    if (error) return { error: error.message };

    logAudit(auth.userId, "remove_user_from_school", "user", userId, undefined, schoolId);
    revalidatePath("/", "layout");
    return { success: true, removedFromSchoolOnly: true };
  }

  try {
    await deleteAccount(userId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete user" };
  }

  logAudit(auth.userId, "delete_user", "user", userId, undefined, schoolId);
  revalidatePath("/", "layout");
  return { success: true };
}
