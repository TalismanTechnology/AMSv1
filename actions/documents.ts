"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { logAudit } from "@/lib/audit";
import type { PreviewResult, ContentSearchResult } from "@/lib/types";
import { isBlockedFile, fileTypeFromName } from "@/lib/documents/file-types";

function triggerProcessing(documentId: string) {
  // Use after() so processing runs after the response is sent.
  // On Vercel, fire-and-forget fetches get dropped when the function exits.
  after(async () => {
    try {
      const { processDocument } = await import("@/lib/documents/processor");
      await processDocument(documentId);
    } catch (err) {
      console.error("[upload] Processing failed:", err);
    }
  });
}

export async function uploadDocument(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const file = formData.get("file") as File;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const categoryId = formData.get("category_id") as string;
  const folderId = formData.get("folder_id") as string;
  const schoolId = formData.get("school_id") as string;
  const tags =
    (formData.get("tags") as string)
      ?.split(",")
      .map((t) => t.trim())
      .filter(Boolean) || [];

  if (!file || !title) return { error: "File and title are required" };

  if (isBlockedFile(file.name)) {
    return {
      error:
        "Image files are not supported. Please upload PDF, Word, Excel, PowerPoint, TXT, or saved email (.eml) files.",
    };
  }

  const fileType = fileTypeFromName(file.name);

  // Upload to Supabase Storage
  const timestamp = Date.now();
  const fileName = schoolId
    ? `${schoolId}/${timestamp}-${file.name}`
    : `${timestamp}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(fileName, file);

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  // Insert document record
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      title,
      description: description || null,
      file_name: file.name,
      file_type: fileType,
      file_url: fileName,
      file_size: file.size,
      category_id: categoryId || null,
      folder_id: folderId || null,
      tags,
      status: "processing",
      uploaded_by: user.id,
      ...(schoolId ? { school_id: schoolId } : {}),
    })
    .select()
    .single();

  if (insertError) {
    return { error: `Failed to save document: ${insertError.message}` };
  }

  logAudit(
    user.id,
    "upload_document",
    "document",
    doc.id,
    { title, fileType },
    schoolId
  );

  // A category picked at upload files the document under its division.
  if (categoryId) await followCategoryDivision(supabase, schoolId, doc.id, categoryId);

  // Fire-and-forget: trigger async processing
  triggerProcessing(doc.id);

  revalidatePath("/", "layout");
  return { success: true, documentId: doc.id };
}

export async function createDocumentRecord(params: {
  storageKey: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  title: string;
  description?: string;
  categoryId?: string;
  folderId?: string;
  tags?: string[];
  schoolId: string;
}): Promise<{ error?: string; documentId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      title: params.title,
      description: params.description || null,
      file_name: params.fileName,
      file_type: params.fileType,
      file_url: params.storageKey,
      file_size: params.fileSize,
      category_id: params.categoryId || null,
      folder_id: params.folderId || null,
      tags: params.tags || [],
      status: "processing",
      uploaded_by: user.id,
      school_id: params.schoolId,
    })
    .select("id")
    .single();

  if (insertError || !doc) {
    return { error: `Failed to save record: ${insertError?.message}` };
  }

  logAudit(
    user.id,
    "upload_document",
    "document",
    doc.id,
    { title: params.title, fileType: params.fileType },
    params.schoolId
  );

  if (params.categoryId) {
    await followCategoryDivision(supabase, params.schoolId, doc.id, params.categoryId);
  }

  // Fire-and-forget processing
  triggerProcessing(doc.id);

  return { documentId: doc.id };
}

export async function deleteDocument(documentId: string, schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: doc } = await supabase
    .from("documents")
    .select("file_url")
    .eq("id", documentId)
    .eq("school_id", schoolId)
    .single();

  if (doc?.file_url) {
    await supabase.storage.from("documents").remove([doc.file_url]);
  }

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  logAudit(
    user.id,
    "delete_document",
    "document",
    documentId,
    undefined,
    schoolId
  );

  revalidatePath("/", "layout");
  return { success: true };
}

export async function bulkDeleteDocuments(ids: string[], schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: docs } = await supabase
    .from("documents")
    .select("file_url")
    .in("id", ids)
    .eq("school_id", schoolId);

  if (docs?.length) {
    const paths = docs.map((d) => d.file_url).filter(Boolean);
    if (paths.length) await supabase.storage.from("documents").remove(paths);
  }

  const { error } = await supabase
    .from("documents")
    .delete()
    .in("id", ids)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  logAudit(
    user.id,
    "bulk_delete_documents",
    "document",
    undefined,
    { count: ids.length },
    schoolId
  );

  revalidatePath("/", "layout");
  return { success: true };
}

export async function approveDocument(documentId: string, schoolId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("documents")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  if (user)
    logAudit(
      user.id,
      "approve_document",
      "document",
      documentId,
      undefined,
      schoolId
    );

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateDocument(
  documentId: string,
  schoolId: string,
  data: {
    title?: string;
    description?: string;
    category_id?: string | null;
    folder_id?: string | null;
    tags?: string[];
    /** Replaces the document's divisions; empty means the whole school. */
    division_ids?: string[];
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { division_ids, ...fields } = data;

  const { error } = await supabase
    .from("documents")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

  // A school whose categories are grouped by division files a document under
  // a division by its category, so the document's division follows it.
  const categoryDivision = fields.category_id
    ? await divisionOfCategory(supabase, schoolId, fields.category_id)
    : undefined;
  const divisionIds =
    categoryDivision !== undefined
      ? categoryDivision
        ? [categoryDivision]
        : []
      : division_ids;

  if (divisionIds) {
    const divisionError = await setDocumentDivisions(supabase, documentId, divisionIds);
    if (divisionError) return { error: divisionError };
  }

  if (user)
    logAudit(
      user.id,
      "update_document",
      "document",
      documentId,
      data,
      schoolId
    );

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * The division a category files documents under: its division id, or null
 * for a whole-school category. Undefined when the school's categories aren't
 * grouped by division (or migration 029 hasn't run), so nothing follows.
 */
async function divisionOfCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  categoryId: string
): Promise<string | null | undefined> {
  const { data: categories, error } = await supabase
    .from("categories")
    .select("*")
    .eq("school_id", schoolId);
  if (error || !categories) return undefined;

  const grouped = categories.some((c) => c.division_id);
  const category = categories.find((c) => c.id === categoryId);
  if (!grouped || !category) return undefined;
  return (category.division_id as string | null) ?? null;
}

/** Point a new document's division at its category's, where that applies. */
async function followCategoryDivision(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schoolId: string,
  documentId: string,
  categoryId: string
) {
  const division = await divisionOfCategory(supabase, schoolId, categoryId);
  if (division === undefined) return;
  const error = await setDocumentDivisions(supabase, documentId, division ? [division] : []);
  if (error) console.warn(`[documents] Couldn't set the division of ${documentId}:`, error);
}

/**
 * Make a document's divisions exactly `divisionIds`: drop the ones no longer
 * picked, then add the new ones. RLS only lets an admin of the document's
 * school do this, and only with that school's divisions.
 */
async function setDocumentDivisions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: string,
  divisionIds: string[]
): Promise<string | null> {
  const ids = [...new Set(divisionIds)];

  let stale = supabase.from("document_divisions").delete().eq("document_id", documentId);
  if (ids.length) stale = stale.not("division_id", "in", `(${ids.join(",")})`);
  const { error: deleteError } = await stale;
  if (deleteError) return deleteError.message;

  if (!ids.length) return null;
  const { error } = await supabase.from("document_divisions").upsert(
    ids.map((division_id) => ({ document_id: documentId, division_id })),
    { onConflict: "document_id,division_id", ignoreDuplicates: true }
  );
  return error ? error.message : null;
}

export async function searchDocumentsByName(
  query: string,
  schoolId: string
): Promise<{ error?: string; documents: PreviewResult[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", documents: [] };

  // Sanitize query for use in PostgREST filter strings — escape special chars
  const sanitized = query.replace(/[%_\\,.()"']/g, "");
  if (!sanitized.trim()) return { documents: [] };

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, title, file_type, file_url, description")
    .eq("school_id", schoolId)
    .eq("status", "ready")
    .or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) return { error: error.message, documents: [] };
  if (!docs?.length) return { documents: [] };

  const docIds = docs.map((d) => d.id);
  const { data: chunks } = await supabase
    .from("document_chunks")
    .select("document_id, content, chunk_index")
    .in("document_id", docIds)
    .eq("chunk_index", 0);

  const chunkMap = new Map(
    (chunks || []).map((c) => [c.document_id, c.content])
  );

  const documents: PreviewResult[] = docs.map((doc) => ({
    document_id: doc.id,
    title: doc.title,
    file_type: doc.file_type,
    file_url: doc.file_url,
    description: doc.description,
    chunk_preview: chunkMap.get(doc.id)?.slice(0, 300) || "",
  }));

  return { documents };
}

export async function searchDocumentContent(
  query: string,
  schoolId: string
): Promise<{ error?: string; results: ContentSearchResult[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", results: [] };

  const { data, error } = await supabase.rpc("search_document_chunks", {
    p_school_id: schoolId,
    p_query: query,
    p_limit: 20,
  });

  if (error) return { error: error.message, results: [] };

  const results: ContentSearchResult[] = (data || []).map(
    (row: { document_id: string; document_title: string; content: string; chunk_index: number; rank: number }) => ({
      document_id: row.document_id,
      document_title: row.document_title,
      snippet: row.content.slice(0, 300),
      chunk_index: row.chunk_index,
      rank: row.rank,
    })
  );

  return { results };
}
