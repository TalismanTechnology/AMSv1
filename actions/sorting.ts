"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { applySorting, chooseSorting } from "@/lib/documents/auto-sort";
import { toFolderOptions } from "@/lib/ai/classify-document";
import { proposeFolders } from "@/lib/ai/propose-folders";
import { adminSafeErrorMessage } from "@/lib/alerts/ai-failure-alert";
import {
  autoFolderCandidates,
  protectedFolderIds,
  reusableRootFolders,
  sanitizeAutoFolderProposal,
  type AutoFolderDoc,
  type AutoFolderFolder,
  type AutoFolderPlan,
  type AutoFolderScope,
} from "@/lib/documents/auto-folder";
import {
  DEFAULT_DIVISIONS,
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

/** Folder id -> full path ("Athletics / Forms"). */
async function folderPathsFor(admin: SupabaseClient, schoolId: string) {
  const { data } = await admin
    .from("folders")
    .select("id, name, parent_id")
    .eq("school_id", schoolId);
  return new Map(toFolderOptions(data ?? []).map((f) => [f.id, f.name]));
}

export interface SortResult {
  id: string;
  title: string;
  /** Where it is filed, e.g. "Upper School · Athletics"; absent if nowhere. */
  label?: string;
  /** It already had a category, so nothing changed. */
  alreadyFiled?: boolean;
  /** Why it wasn't filed. */
  error?: string;
}

/** A reason an admin can act on, rather than a stack trace. */
function reasonFor(err: unknown, source: string, schoolId: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/no object generated|could not parse|NoObjectGenerated/i.test(message)) {
    return "The AI didn't return an answer. Try again.";
  }
  // Provider failures get a category message (and alert the owner); the
  // provider's own text never reaches the page.
  const safe = adminSafeErrorMessage(err, { source, schoolId });
  return safe.length > 160 ? `${safe.slice(0, 157)}…` : safe;
}

/**
 * File unfiled documents now, with the same AI that auto-sorts new ones,
 * whether or not auto-sort is switched on. Fills only what is still empty —
 * a missing category, a missing folder, or both — from the categories and
 * folders the school already has; never creates either. Takes at most a few
 * documents per call.
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
    .select("id, title, school_id, category_id, folder_id, source, status, summary, text_url")
    .eq("school_id", schoolId)
    .in("id", ids);
  if (error) return { error: error.message };

  type Sorted = SortResult & { categoryId?: string; folderId?: string };
  const sorted = await Promise.all(
    (docs ?? []).map(async (doc): Promise<Sorted> => {
      const base = { id: doc.id as string, title: doc.title as string };
      if (doc.status !== "ready") return { ...base, error: "Still processing" };
      const had = {
        categoryId: (doc.category_id as string | null) ?? undefined,
        folderId: (doc.folder_id as string | null) ?? undefined,
      };
      if (had.categoryId && had.folderId) return { ...base, ...had, alreadyFiled: true };
      try {
        // Fills whichever of category and folder is still empty, from the
        // school's existing ones only.
        const choice = await chooseSorting(admin, doc, await documentText(admin, doc));
        const written = await applySorting(admin, doc.id, choice);
        const categoryId = written.categoryId ?? had.categoryId;
        const folderId = written.folderId ?? had.folderId;
        if (written.categoryId || written.folderId) return { ...base, categoryId, folderId };
        // It had a category and no folder fits: left as it was.
        if (categoryId) return { ...base, categoryId, folderId, alreadyFiled: true };
        return { ...base, error: "No category fits it. File it by hand, or add an Other category." };
      } catch (err) {
        console.error(`[sort] Sorting ${doc.id} failed:`, err);
        return { ...base, error: reasonFor(err, "sorting.classify", schoolId) };
      }
    })
  );

  const [labels, folderPaths] = await Promise.all([
    labelsFor(admin, schoolId),
    folderPathsFor(admin, schoolId),
  ]);
  const results: SortResult[] = sorted.map(({ categoryId, folderId, ...rest }) => {
    const parts = [
      categoryId ? labels.get(categoryId) : undefined,
      folderId ? folderPaths.get(folderId) : undefined,
    ].filter(Boolean);
    return { ...rest, label: parts.length ? parts.join(" · ") : undefined };
  });

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

/** Documents one Auto-folder run proposes for; run it again for the rest. */
const AUTO_FOLDER_MAX_DOCS = 400;
/** Ids per update, to keep the request URL short. */
const UPDATE_CHUNK = 200;

async function autoFolderInputs(admin: SupabaseClient, schoolId: string) {
  const [{ data: folders, error: folderError }, { data: docs, error: docError }] =
    await Promise.all([
      admin.from("folders").select("id, name, parent_id, school_id").eq("school_id", schoolId),
      admin
        .from("documents")
        .select("id, title, school_id, folder_id, source, status, summary")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false }),
    ]);
  if (folderError || docError) throw new Error((folderError ?? docError)!.message);
  return {
    folders: (folders ?? []) as AutoFolderFolder[],
    docs: (docs ?? []) as (AutoFolderDoc & { summary: string | null })[],
  };
}

export interface AutoFolderPreview extends AutoFolderPlan {
  scope: AutoFolderScope;
  /** Documents in scope that this run didn't look at (over the per-run cap). */
  remaining: number;
}

/**
 * Auto-folder, step 1: ask the AI for a folder structure for the documents in
 * scope and where each one goes. Changes nothing; the admin sees the plan
 * and applies it with applyAutoFolders.
 */
export async function proposeAutoFolders(
  schoolId: string,
  scope: AutoFolderScope
): Promise<{ preview?: AutoFolderPreview; error?: string }> {
  try {
    await requireSchoolAdmin(schoolId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authorized" };
  }
  const safeScope: AutoFolderScope = scope === "all" ? "all" : "unfiled";
  const admin = createAdminClient();

  try {
    const { folders, docs } = await autoFolderInputs(admin, schoolId);
    const inScope = autoFolderCandidates(docs, folders, schoolId, safeScope);
    const batch = inScope.slice(0, AUTO_FOLDER_MAX_DOCS);
    if (!batch.length) {
      return { preview: { scope: safeScope, folders: [], moves: [], skipped: [], remaining: 0 } };
    }

    const roots = reusableRootFolders(folders, schoolId);
    const examples = new Map<string, string[]>();
    for (const doc of docs) {
      if (!doc.folder_id) continue;
      const list = examples.get(doc.folder_id) ?? [];
      if (list.length < 3) examples.set(doc.folder_id, [...list, doc.title]);
    }
    const proposal = await proposeFolders({
      docs: batch,
      existingFolders: roots.map((f) => ({ name: f.name, examples: examples.get(f.id) })),
    });
    const plan = sanitizeAutoFolderProposal({
      schoolId,
      scope: safeScope,
      folders,
      docs: batch,
      proposal,
    });
    if (plan.skipped.length) {
      console.warn(`[auto-folder] Dropped ${plan.skipped.length} proposed assignment(s)`, plan.skipped.slice(0, 20));
    }
    return {
      preview: { ...plan, scope: safeScope, remaining: inScope.length - batch.length },
    };
  } catch (err) {
    console.error(`[auto-folder] Proposal for ${schoolId} failed:`, err);
    return { error: reasonFor(err, "sorting.propose-folders", schoolId) };
  }
}

/**
 * Auto-folder, step 2: apply a previewed plan. Everything is checked again
 * against the database: only this school's documents still in scope move,
 * nothing goes into or out of Website/Responses, website-synced documents
 * are left alone, and only missing root folders are created. Never deletes,
 * renames or moves folders, and never deletes documents.
 */
export async function applyAutoFolders(
  schoolId: string,
  scope: AutoFolderScope,
  moves: { documentId: string; folder: string }[]
): Promise<{ created?: string[]; moved?: number; skipped?: number; error?: string }> {
  let user;
  try {
    user = await requireSchoolAdmin(schoolId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Not authorized" };
  }
  const safeScope: AutoFolderScope = scope === "all" ? "all" : "unfiled";
  const admin = createAdminClient();

  try {
    const { folders, docs } = await autoFolderInputs(admin, schoolId);
    const plan = sanitizeAutoFolderProposal({
      schoolId,
      scope: safeScope,
      folders,
      docs,
      proposal: {
        assignments: (Array.isArray(moves) ? moves : []).map((m) => ({
          documentId: String(m?.documentId ?? ""),
          folder: String(m?.folder ?? ""),
        })),
      },
    });

    // Root folders: reuse what exists, create what doesn't.
    const folderIds = new Map<string, string>();
    const created: string[] = [];
    for (const target of plan.folders) {
      if (target.existingId) {
        folderIds.set(target.name, target.existingId);
        continue;
      }
      const { data, error } = await admin
        .from("folders")
        .insert({ name: target.name, parent_id: null, school_id: schoolId })
        .select("id")
        .single();
      if (data) {
        folderIds.set(target.name, data.id);
        created.push(target.name);
        continue;
      }
      // Created by someone else since the plan was checked: use theirs.
      if (error?.code === "23505") {
        const { data: existing } = await admin
          .from("folders")
          .select("id")
          .eq("school_id", schoolId)
          .is("parent_id", null)
          .eq("name", target.name)
          .maybeSingle();
        if (existing) {
          folderIds.set(target.name, existing.id);
          continue;
        }
      }
      throw new Error(`Couldn't create the folder “${target.name}”: ${error?.message ?? "unknown error"}`);
    }

    const locked = [...protectedFolderIds(folders)];
    const byFolder = new Map<string, string[]>();
    for (const move of plan.moves) {
      const id = folderIds.get(move.folder);
      if (!id) continue;
      byFolder.set(id, [...(byFolder.get(id) ?? []), move.documentId]);
    }

    let moved = 0;
    const now = new Date().toISOString();
    for (const [folderId, ids] of byFolder) {
      for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
        let update = admin
          .from("documents")
          .update({ folder_id: folderId, updated_at: now })
          .eq("school_id", schoolId)
          .in("id", ids.slice(i, i + UPDATE_CHUNK))
          .neq("source", "website");
        // The same rules again in the write itself, in case a document was
        // filed between the check above and now.
        if (safeScope === "unfiled") update = update.is("folder_id", null);
        else if (locked.length) {
          update = update.or(`folder_id.is.null,folder_id.not.in.(${locked.join(",")})`);
        }
        const { data, error } = await update.select("id");
        if (error) throw new Error(error.message);
        moved += data?.length ?? 0;
      }
    }

    logAudit(
      user.id,
      "auto_folder_documents",
      "document",
      undefined,
      { scope: safeScope, created, moved, skipped: plan.skipped.length },
      schoolId
    );
    revalidatePath("/", "layout");
    return { created, moved, skipped: plan.moves.length - moved + plan.skipped.length };
  } catch (err) {
    console.error(`[auto-folder] Applying for ${schoolId} failed:`, err);
    return { error: reasonFor(err, "sorting.apply-folders", schoolId) };
  }
}
