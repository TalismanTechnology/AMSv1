"use server";

import { createClient } from "@/lib/supabase/server";
import type { Document, Category } from "@/lib/types";

export async function getParentDocuments(
  schoolId: string,
  filters?: { search?: string; categoryId?: string }
): Promise<{ documents: Document[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { documents: [], error: "Unauthorized" };

  let query = supabase
    .from("documents")
    .select("*, category:categories(*)")
    .eq("school_id", schoolId)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  if (filters?.search) {
    query = query.ilike("title", `%${filters.search}%`);
  }

  if (filters?.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }

  const { data, error } = await query;

  if (error) return { documents: [], error: error.message };
  return { documents: (data || []) as Document[] };
}

export async function getParentCategories(
  schoolId: string
): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .eq("school_id", schoolId)
    .order("name");

  return (data || []) as Category[];
}
