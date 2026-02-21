"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function joinSchoolByCode(code: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { error: "Please enter a school code" };

  // Look up school by join code (use admin client to bypass RLS)
  const admin = createAdminClient();
  const { data: school } = await admin
    .from("schools")
    .select("id, name, slug")
    .eq("join_code", trimmed)
    .single();

  if (!school) return { error: "Invalid school code" };

  // Check if user already has a membership for this school
  const { data: existing } = await supabase
    .from("school_memberships")
    .select("id, approved")
    .eq("user_id", user.id)
    .eq("school_id", school.id)
    .single();

  if (existing) {
    if (existing.approved) {
      return { error: "You are already a member of this school" };
    }
    return { error: "Your request to join this school is already pending" };
  }

  // Check if school requires approval
  const { data: settings } = await admin
    .from("settings")
    .select("require_approval")
    .eq("school_id", school.id)
    .single();

  const requiresApproval = settings?.require_approval ?? true;

  // Create membership
  const { error: insertError } = await admin
    .from("school_memberships")
    .insert({
      user_id: user.id,
      school_id: school.id,
      role: "parent",
      approved: !requiresApproval,
    });

  if (insertError) return { error: "Failed to join school" };

  revalidatePath("/", "layout");

  return {
    success: true,
    schoolName: school.name,
    schoolSlug: school.slug,
    pending: requiresApproval,
  };
}
