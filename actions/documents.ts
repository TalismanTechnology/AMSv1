"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import type { PreviewResult, ContentSearchResult } from "@/lib/types";

const BLOCKED_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];

const TYPE_MAP: Record<string, string> = {
  pdf: "pdf",
  docx: "docx",
  doc: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  pptx: "pptx",
  ppt: "pptx",
  txt: "txt",
};

function triggerProcessing(documentId: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
  const secret = process.env.PROCESS_DOCUMENT_SECRET;

  fetch(`${baseUrl}/api/process-document`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-process-secret": secret } : {}),
    },
    body: JSON.stringify({ documentId }),
  }).catch((err) => {
    console.error("[upload] Failed to trigger processing:", err);
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

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return {
      error:
        "Image files are not supported. Please upload PDF, Word, Excel, PowerPoint, or TXT files.",
    };
  }

  const fileType = TYPE_MAP[ext] || "txt";

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
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("documents")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("school_id", schoolId);

  if (error) return { error: error.message };

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

export async function searchDocumentsByName(
  query: string,
  schoolId: string
): Promise<{ error?: string; documents: PreviewResult[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated", documents: [] };

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, title, file_type, file_url, description")
    .eq("school_id", schoolId)
    .eq("status", "ready")
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
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
