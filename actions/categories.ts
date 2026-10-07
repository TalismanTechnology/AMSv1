"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createCategory(schoolId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const color = formData.get("color") as string;
  // Empty for the whole school. Left out entirely then, so this still works
  // before migration 029 adds the column.
  const divisionId = (formData.get("division_id") as string | null) || null;

  if (!name) return { error: "Name is required" };

  const { error } = await supabase.from("categories").insert({
    name,
    description: description || null,
    color: color || "#6366f1",
    school_id: schoolId,
    ...(divisionId ? { division_id: divisionId, sort_order: 10 } : {}),
  });

  if (error) {
    if (error.code === "23505") return { error: "That group already has a category with this name" };
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateCategory(
  categoryId: string,
  schoolId: string,
  data: { name?: string; description?: string; color?: string }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("categories")
    .update(data)
    .eq("id", categoryId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteCategory(categoryId: string, schoolId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
