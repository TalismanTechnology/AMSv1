"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createCategory(schoolId: string, formData: FormData) {
  const supabase = await createClient();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const color = formData.get("color") as string;

  if (!name) return { error: "Name is required" };

  const { error } = await supabase.from("categories").insert({
    name,
    description: description || null,
    color: color || "#6366f1",
    school_id: schoolId,
  });

  if (error) {
    if (error.code === "23505") return { error: "Category already exists" };
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

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
