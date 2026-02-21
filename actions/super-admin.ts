"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function createSchool(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  // Verify super_admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") return { error: "Unauthorized" };

  const name = formData.get("name") as string;
  const slug = (formData.get("slug") as string).toLowerCase().trim();

  if (!name || !slug) return { error: "Name and slug are required" };
  if (!/^[a-z0-9-]+$/.test(slug))
    return { error: "Slug must only contain lowercase letters, numbers, and hyphens" };

  const adminSupabase = createAdminClient();

  // Check slug uniqueness
  const { data: existing } = await adminSupabase
    .from("schools")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) return { error: "A school with this slug already exists" };

  // Create the school
  const { data: school, error } = await adminSupabase
    .from("schools")
    .insert({ name, slug })
    .select()
    .single();

  if (error) return { error: error.message };

  // Create default settings for this school
  await adminSupabase.from("settings").insert({
    school_id: school.id,
    school_name: name,
  });

  // Create default "Responses" folder for unanswered question answers
  await adminSupabase.from("folders").insert({
    name: "Responses",
    school_id: school.id,
    parent_id: null,
  });

  revalidatePath("/super-admin");
  return { success: true, school };
}

export async function updateSchool(
  schoolId: string,
  data: { name: string; slug: string }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") return { error: "Unauthorized" };

  const name = data.name.trim();
  const slug = data.slug.toLowerCase().trim();

  if (!name) return { error: "Name is required" };
  if (!slug) return { error: "Slug is required" };
  if (!/^[a-z0-9-]+$/.test(slug))
    return { error: "Slug must only contain lowercase letters, numbers, and hyphens" };

  const adminSupabase = createAdminClient();

  // Check slug uniqueness (excluding the current school)
  const { data: existing } = await adminSupabase
    .from("schools")
    .select("id")
    .eq("slug", slug)
    .neq("id", schoolId)
    .single();

  if (existing) return { error: "A school with this slug already exists" };

  const { error } = await adminSupabase
    .from("schools")
    .update({ name, slug, updated_at: new Date().toISOString() })
    .eq("id", schoolId);

  if (error) return { error: error.message };

  // Keep settings.school_name in sync
  await adminSupabase
    .from("settings")
    .update({ school_name: name, updated_at: new Date().toISOString() })
    .eq("school_id", schoolId);

  revalidatePath("/super-admin");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function assignSchoolAdmin(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  // Verify super_admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") return { error: "Unauthorized" };

  const schoolId = formData.get("school_id") as string;
  const email = (formData.get("email") as string).toLowerCase().trim();

  if (!schoolId || !email)
    return { error: "School ID and email are required" };

  const adminSupabase = createAdminClient();

  // Find user by email
  const { data: targetProfile } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (!targetProfile) return { error: "No user found with this email" };

  // Create or update membership
  const { error } = await adminSupabase.from("school_memberships").upsert(
    {
      user_id: targetProfile.id,
      school_id: schoolId,
      role: "admin",
      approved: true,
    },
    { onConflict: "user_id,school_id" }
  );

  if (error) return { error: error.message };

  revalidatePath("/super-admin");
  return { success: true };
}

export async function deleteSchool(schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") return { error: "Unauthorized" };

  const adminSupabase = createAdminClient();

  logAudit(user.id, "delete_school", "school", schoolId);

  const { error } = await adminSupabase
    .from("schools")
    .delete()
    .eq("id", schoolId);

  if (error) return { error: error.message };

  revalidatePath("/super-admin");
  revalidatePath("/", "layout");
  return { success: true };
}
