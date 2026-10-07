"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { applySorting, chooseSorting } from "@/lib/documents/auto-sort";
import {
  STARTER_CATEGORIES,
  categoryLabels,
} from "@/lib/documents/division-categories";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Documents sorted per call. Each takes a model call, so the client sends a
 * long list a few at a time and shows progress in between.
 */
const MAX_PER_CALL = 4;
/** Matches what the classifier reads of a document. */
const CONTENT_CHARS = 6000;

/** Created when a school has no divisions yet, as migration 018 seeds them. */
const DEFAULT_DIVISIONS = [
  { name: "Lower School", color: "sky" },
  { name: "Middle School", color: "violet" },
  { name: "Upper School", color: "emerald" },
];

async function requireSchoolAdmin(schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role === "super_admin") return user;

  const { data: membership } = await supabase
    .from("school_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("school_id", schoolId)
    .single();
  if (membership?.role !== "admin") throw new Error("Not authorized");

  return user;
}

/** What the classifier reads: the summary, else the extracted text. */
async function documentText(
  admin: SupabaseClient,
  doc: { title: string; summary: string | null; text_url: string | null }
): Promise<string> {
  if (doc.summary?.trim()) return doc.summary;
  if (doc.text_url) {
    const { data } = await admin.storage.from("documents").download(doc.text_url);
    if (data) return (await data.text()).slice(0, CONTENT_CHARS);
  }
  return doc.title;
}

async function labelsFor(admin: SupabaseClient, schoolId: string) {
  const [{ data: categories }, { data: divisions }] = await Promise.all([
    admin.from("categories").select("*").eq("school_id", schoolId),
    admin
      .from("event_calendars")
      .select("id, name, sort_order")
      .eq("school_id", schoolId)
      .eq("kind", "division"),
  ]);
  return categoryLabels(categories ?? [], divisions ?? []);
}

export interface SortResult {
  id: string;
  title: string;
  /** Where it was filed, e.g. "Upper School · Athletics"; absent if nowhere. */
  label?: string;
  error?: string;
}

/**
 * File unfiled documents now, with the same AI that auto-sorts new ones,
 * whether or not auto-sort is switched on. Fills only what is still empty.
 * Takes at most a few documents per call.
 */
export async function sortDocumentsNow(
  schoolId: string,
  documentIds: string[]
): Promise<{ results?: SortResult[]; error?: string }> {
  let user;
  try {
    user = await requireSchoolAdmin(schoolId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authorized" };
  }

  const ids = [...new Set(documentIds)].slice(0, MAX_PER_CALL);
  const admin = createAdminClient();
  const { data: docs, error } = await admin
    .from("documents")
    .select("id, title, school_id, category_id, folder_id, status, summary, text_url")
    .eq("school_id", schoolId)
    .in("id", ids);
  if (error) return { error: error.message };

  const sorted = await Promise.all(
    (docs ?? []).map(async (doc): Promise<SortResult & { categoryId?: string }> => {
      const base = { id: doc.id as string, title: doc.title as string };
      if (doc.status !== "ready") return { ...base, error: "Still processing" };
      if (doc.category_id) return { ...base, categoryId: doc.category_id as string };
      try {
        const choice = await chooseSorting(admin, doc, await documentText(admin, doc));
        const { categoryId } = await applySorting(admin, doc.id, choice);
        return { ...base, categoryId: categoryId ?? undefined };
      } catch (err) {
        console.error(`[sort] Sorting ${doc.id} failed:`, err);
        return { ...base, error: "Couldn't sort it" };
      }
    })
  );

  const labels = await labelsFor(admin, schoolId);
  const results: SortResult[] = sorted.map(({ categoryId, ...rest }) => ({
    ...rest,
    label: categoryId ? labels.get(categoryId) : undefined,
  }));

  logAudit(
    user.id,
    "sort_documents",
    "document",
    undefined,
    { count: results.length, filed: results.filter((r) => r.label).length },
    schoolId
  );
  revalidatePath("/", "layout");
  return { results };
}

/**
 * Replace a school's categories with the division layout: the same starter
 * categories under each division and under Whole School. Documents lose
 * their old category; returns the ready ones so the caller can sort them.
 */
export async function setUpDivisionCategories(
  schoolId: string
): Promise<{ unfiledIds?: string[]; error?: string }> {
  let user;
  try {
    user = await requireSchoolAdmin(schoolId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authorized" };
  }
  const admin = createAdminClient();

  // Check for migration 029 before deleting anything.
  const { error: schemaError } = await admin
    .from("categories")
    .select("division_id")
    .limit(1);
  if (schemaError) {
    return {
      error:
        "The database isn't ready for division categories yet. Apply migration 029_division_categories.sql, then try again.",
    };
  }

  let { data: divisions } = await admin
    .from("event_calendars")
    .select("id, name, sort_order")
    .eq("school_id", schoolId)
    .eq("kind", "division")
    .order("sort_order");
  if (!divisions?.length) {
    const { data: created, error } = await admin
      .from("event_calendars")
      .insert(
        DEFAULT_DIVISIONS.map((d, i) => ({
          school_id: schoolId,
          kind: "division",
          name: d.name,
          color: d.color,
          sort_order: i,
        }))
      )
      .select("id, name, sort_order");
    if (error) return { error: error.message };
    divisions = created;
  }

  const { error: deleteError } = await admin
    .from("categories")
    .delete()
    .eq("school_id", schoolId);
  if (deleteError) return { error: deleteError.message };

  const groups: (string | null)[] = [...(divisions ?? []).map((d) => d.id), null];
  const rows = groups.flatMap((divisionId) =>
    STARTER_CATEGORIES.map((category, i) => ({
      school_id: schoolId,
      division_id: divisionId,
      name: category.name,
      color: category.color,
      description: category.description,
      sort_order: i,
    }))
  );
  const { error: insertError } = await admin.from("categories").insert(rows);
  if (insertError) return { error: insertError.message };

  const { data: unfiled } = await admin
    .from("documents")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "ready")
    .is("category_id", null)
    .order("created_at", { ascending: false });

  logAudit(
    user.id,
    "set_up_division_categories",
    "category",
    undefined,
    { categories: rows.length, divisions: (divisions ?? []).map((d) => d.name) },
    schoolId
  );
  revalidatePath("/", "layout");
  return { unfiledIds: (unfiled ?? []).map((d) => d.id) };
}
