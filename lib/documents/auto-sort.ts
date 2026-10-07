import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyDocument, toFolderOptions } from "@/lib/ai/classify-document";
import {
  candidateCategories,
  categoryLabels,
  fallbackCategory,
  hasDivisionCategories,
  type GroupedCategory,
} from "./division-categories";

/** How many recent filed documents to scan when collecting example titles. */
const EXAMPLE_POOL = 300;
const MAX_EXAMPLES_PER_OPTION = 3;

export interface SortableDoc {
  id: string;
  title: string;
  school_id: string | null;
  category_id: string | null;
  folder_id: string | null;
}

interface FiledDoc {
  title: string | null;
  category_id: string | null;
  folder_id: string | null;
}

interface CategoryRow extends GroupedCategory {
  description: string | null;
}

export interface SortChoice {
  category_id?: string;
  folder_id?: string;
  /** The chosen category's division; null for the whole school. Set only
   * when a category was chosen and the school groups categories by division,
   * so a school that doesn't keeps the divisions its email addresses set. */
  division_id?: string | null;
}

/**
 * Group recent document titles by the bucket they were filed into. These go
 * into the prompt as worked examples — a folder name alone rarely says what
 * belongs in it, but three documents already sitting there do.
 */
function exampleTitles(
  rows: FiledDoc[],
  key: "category_id" | "folder_id"
): Map<string, { examples: string[] }> {
  const byId = new Map<string, { examples: string[] }>();

  for (const row of rows) {
    const id = row[key];
    const title = row.title?.trim();
    if (!id || !title) continue;

    const current = byId.get(id)?.examples ?? [];
    if (current.length >= MAX_EXAMPLES_PER_OPTION) continue;
    byId.set(id, { examples: [...current, title] });
  }

  return byId;
}

/**
 * Pick a category and folder for whatever the document is missing, from the
 * school's own lists; never invents one. Mail that reached a division's
 * address is sorted only among that division's categories, and lands in its
 * "Other" when nothing fits. Throws if the lookups or the model fail.
 */
export async function chooseSorting(
  supabase: SupabaseClient,
  doc: SortableDoc,
  content: string
): Promise<SortChoice> {
  if (!doc.school_id) return {};
  if (doc.category_id && doc.folder_id) return {};

  const [
    { data: categoryRows, error: categoryError },
    { data: folders },
    { data: filed },
    { data: marked },
    { data: divisions },
  ] = await Promise.all([
    // "*" rather than named columns: division_id only exists after
    // migration 029, and a school without it still sorts by plain names.
    supabase.from("categories").select("*").eq("school_id", doc.school_id),
    supabase
      .from("folders")
      .select("id, name, parent_id")
      .eq("school_id", doc.school_id),
    supabase
      .from("documents")
      .select("title, category_id, folder_id")
      .eq("school_id", doc.school_id)
      .eq("status", "ready")
      .neq("id", doc.id)
      .order("created_at", { ascending: false })
      .limit(EXAMPLE_POOL),
    // The divisions whose addresses its email reached.
    supabase
      .from("document_divisions")
      .select("division_id")
      .eq("document_id", doc.id),
    supabase
      .from("event_calendars")
      .select("id, name, sort_order")
      .eq("school_id", doc.school_id)
      .eq("kind", "division"),
  ]);
  if (categoryError) throw new Error(categoryError.message);

  const categories: CategoryRow[] = categoryRows ?? [];
  const divisionList = divisions ?? [];
  const divisionIds = (marked ?? []).map((row) => row.division_id as string);
  const options = candidateCategories(categories, divisionIds);
  // "Upper School / Academics": the group is part of what the model picks.
  const labels = categoryLabels(categories, divisionList, " / ");

  const filedRows: FiledDoc[] = filed ?? [];
  const categoryExamples = exampleTitles(filedRows, "category_id");
  const folderExamples = exampleTitles(filedRows, "folder_id");

  const result = await classifyDocument({
    title: doc.title,
    content,
    divisions: divisionIds.flatMap((id) => {
      const division = divisionList.find((d) => d.id === id);
      return division ? [division.name] : [];
    }),
    categories: doc.category_id
      ? []
      : options.map((c) => ({
          id: c.id,
          name: labels.get(c.id) ?? c.name,
          description: c.description,
          examples: categoryExamples.get(c.id)?.examples,
        })),
    folders: doc.folder_id ? [] : toFolderOptions(folders ?? [], folderExamples),
  });

  const choice: SortChoice = {};
  if (!doc.category_id) {
    const picked = result.categoryId
      ? categories.find((c) => c.id === result.categoryId)
      : fallbackCategory(options, divisionIds);
    if (picked) {
      choice.category_id = picked.id;
      if (hasDivisionCategories(categories)) {
        choice.division_id = picked.division_id ?? null;
      }
    }
  }
  if (!doc.folder_id && result.folderId) choice.folder_id = result.folderId;
  return choice;
}

/**
 * Make a document's divisions exactly its category's division, or none for a
 * whole-school category. The chat reads document_divisions to know who a
 * document is for, so it has to follow the category.
 */
export async function setDocumentDivision(
  supabase: SupabaseClient,
  documentId: string,
  divisionId: string | null
): Promise<void> {
  const { error: clearError } = await supabase
    .from("document_divisions")
    .delete()
    .eq("document_id", documentId);
  if (clearError) throw new Error(clearError.message);
  if (!divisionId) return;

  const { error } = await supabase
    .from("document_divisions")
    .insert({ document_id: documentId, division_id: divisionId });
  if (error) throw new Error(error.message);
}

/**
 * Write a sorting choice. Each field is written only while it is still empty:
 * the document was read before sorting began, and a choice someone made since
 * wins. Returns the category written, if any.
 */
export async function applySorting(
  supabase: SupabaseClient,
  documentId: string,
  choice: SortChoice
): Promise<{ categoryId: string | null }> {
  let categoryId: string | null = null;

  if (choice.category_id) {
    const { data, error } = await supabase
      .from("documents")
      .update({ category_id: choice.category_id })
      .eq("id", documentId)
      .is("category_id", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (data?.length) {
      categoryId = choice.category_id;
      if (choice.division_id !== undefined) {
        await setDocumentDivision(supabase, documentId, choice.division_id);
      }
    }
  }

  if (choice.folder_id) {
    const { error } = await supabase
      .from("documents")
      .update({ folder_id: choice.folder_id })
      .eq("id", documentId)
      .is("folder_id", null);
    if (error) throw new Error(error.message);
  }

  return { categoryId };
}
