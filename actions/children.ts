"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function addChild(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const name = formData.get("name") as string;
  const grade = formData.get("grade") as string;
  const schoolId = formData.get("school_id") as string;

  if (!name?.trim() || !grade) return { error: "Name and grade are required" };

  const { error } = await supabase.from("children").insert({
    parent_id: user.id,
    name: name.trim(),
    grade,
    ...(schoolId ? { school_id: schoolId } : {}),
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateChild(
  childId: string,
  data: { name?: string; grade?: string },
  schoolId?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  let query = supabase
    .from("children")
    .update(data)
    .eq("id", childId)
    .eq("parent_id", user.id);

  if (schoolId) query = query.eq("school_id", schoolId);

  const { error } = await query;

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function removeChild(childId: string, schoolId?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  let query = supabase
    .from("children")
    .delete()
    .eq("id", childId)
    .eq("parent_id", user.id);

  if (schoolId) query = query.eq("school_id", schoolId);

  const { error } = await query;

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
