"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createFolder(
  schoolId: string,
  data: {
    name: string;
    parent_id?: string | null;
  }
) {
  const supabase = await createClient();

  const { error } = await supabase.from("folders").insert({
    name: data.name,
    parent_id: data.parent_id || null,
    school_id: schoolId,
  });

  if (error) {
    if (error.code === "23505")
      return { error: "A folder with this name already exists here" };
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function renameFolder(folderId: string, schoolId: string, name: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("folders")
    .update({ name })
    .eq("id", folderId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteFolder(folderId: string, schoolId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("folders")
    .delete()
    .eq("id", folderId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function moveDocumentToFolder(
  documentId: string,
  folderId: string | null,
  schoolId: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("documents")
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
