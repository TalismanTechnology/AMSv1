import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "./change";

// Website pages become ordinary documents (source = 'website') so retrieval,
// citations and the admin document list all work unchanged. Every write and
// delete here is scoped to source = 'website': uploaded and emailed documents
// are never touched.

export type PageKind = "html" | "pdf";

/** Storage prefix for one source's documents: {school}/website/{source}/. */
export function websiteStoragePrefix(schoolId: string, sourceId: string): string {
  return `${schoolId}/website/${sourceId}/`;
}

/** Stable key per page URL, so a changed page overwrites its own file. */
export function websiteStorageKey(
  schoolId: string,
  sourceId: string,
  url: string,
  kind: PageKind
): string {
  return `${websiteStoragePrefix(schoolId, sourceId)}${sha256(url).slice(0, 40)}.${kind === "pdf" ? "pdf" : "txt"}`;
}

/** A readable file name for the documents list, e.g. "example.org-admissions-tuition.txt". */
export function websiteFileName(url: string, kind: PageKind): string {
  const u = new URL(url);
  const base = `${u.hostname}${u.pathname}`
    .replace(/\.(pdf|html?|aspx?|php)$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+$/g, "")
    .slice(0, 150);
  return `${base || u.hostname}.${kind === "pdf" ? "pdf" : "txt"}`;
}

/** Title for a PDF, from its file name: "/files/2026-Bus_Routes.pdf" → "2026 Bus Routes". */
export function pdfTitleFromUrl(url: string): string {
  const last = new URL(url).pathname.split("/").pop() ?? "";
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // keep the raw segment
  }
  return name.replace(/\.pdf$/i, "").replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim() || url;
}

/**
 * The stored text for an HTML page. Title and URL lead the file so chunks
 * from the top of the page carry where they came from.
 */
export function pageDocumentText(title: string, url: string, text: string): string {
  return `${title}\n${url}\n\n${text}\n`;
}

export interface WebsiteDocumentInput {
  schoolId: string;
  sourceId: string;
  url: string;
  title: string;
  kind: PageKind;
  body: Buffer;
  /** The page's current document, if it has one. */
  existingDocumentId: string | null;
}

/**
 * Write the page's file to storage and create or update its document, then
 * run the standard processor (which replaces the document's chunks). Returns
 * the document id. Throws if processing fails — the document is left in the
 * 'error' state by the processor and the caller records the failure.
 */
export async function upsertWebsiteDocument(
  supabase: SupabaseClient,
  input: WebsiteDocumentInput
): Promise<{ documentId: string; created: boolean }> {
  const fileUrl = websiteStorageKey(input.schoolId, input.sourceId, input.url, input.kind);
  const contentType = input.kind === "pdf" ? "application/pdf" : "text/plain; charset=utf-8";

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(fileUrl, new Blob([new Uint8Array(input.body)], { type: contentType }), {
      contentType,
      upsert: true,
    });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const fields = {
    title: input.title.slice(0, 300),
    description: input.url,
    file_name: websiteFileName(input.url, input.kind),
    file_type: input.kind === "pdf" ? "pdf" : "txt",
    file_url: fileUrl,
    file_size: input.body.length,
    source_url: input.url,
    status: "processing",
    error_message: null,
    updated_at: new Date().toISOString(),
  };

  let documentId: string | null = null;
  let created = false;

  if (input.existingDocumentId) {
    const { data } = await supabase
      .from("documents")
      .update(fields)
      .eq("id", input.existingDocumentId)
      .eq("source", "website")
      .select("id");
    documentId = data?.[0]?.id ?? null;
  }

  if (!documentId) {
    const { data, error } = await supabase
      .from("documents")
      .insert({
        ...fields,
        source: "website",
        uploaded_by: null,
        school_id: input.schoolId,
        tags: [],
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to save document: ${error?.message}`);
    documentId = data.id as string;
    created = true;
  }

  // Imported lazily: the processor pulls in the PDF/Office parsers, which the
  // delete/cleanup helpers in this module (used by settings and super-admin
  // actions) don't need.
  const { processDocument } = await import("@/lib/documents/processor");
  await processDocument(documentId);
  return { documentId, created };
}

/**
 * Delete website documents (storage objects first, then rows; chunks cascade).
 * Ids that aren't website documents are ignored.
 */
export async function deleteWebsiteDocuments(
  supabase: SupabaseClient,
  documentIds: string[]
): Promise<void> {
  const ids = [...new Set(documentIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { data: docs, error } = await supabase
      .from("documents")
      .select("id, file_url, text_url, pdf_url")
      .in("id", batch)
      .eq("source", "website");
    if (error) throw new Error(`Could not read documents: ${error.message}`);
    if (!docs?.length) continue;

    await removeStorageObjects(supabase, docs);

    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .in("id", docs.map((d) => d.id))
      .eq("source", "website");
    if (deleteError) throw new Error(`Could not delete documents: ${deleteError.message}`);
  }
}

/** Every website document a source produced, found by its storage prefix. */
export async function deleteWebsiteDocumentsForSource(
  supabase: SupabaseClient,
  schoolId: string,
  sourceId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("school_id", schoolId)
    .eq("source", "website")
    .like("file_url", `${websiteStoragePrefix(schoolId, sourceId)}%`);
  if (error) throw new Error(`Could not list website documents: ${error.message}`);
  await deleteWebsiteDocuments(supabase, (data ?? []).map((d) => d.id as string));
}

/**
 * Remove the storage objects behind a school's website documents. Called
 * before a school is deleted: the rows cascade away with the school, but the
 * files in the bucket would not.
 */
export async function removeWebsiteStorageForSchool(
  supabase: SupabaseClient,
  schoolId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("documents")
    .select("file_url, text_url, pdf_url")
    .eq("school_id", schoolId)
    .eq("source", "website");
  if (error) throw new Error(`Could not list website documents: ${error.message}`);
  await removeStorageObjects(supabase, data ?? []);
}

async function removeStorageObjects(
  supabase: SupabaseClient,
  docs: Array<{ file_url?: string | null; text_url?: string | null; pdf_url?: string | null }>
): Promise<void> {
  const paths = [
    ...new Set(docs.flatMap((d) => [d.file_url, d.text_url, d.pdf_url]).filter((p): p is string => !!p)),
  ];
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from("documents").remove(paths.slice(i, i + 100));
    if (error) console.warn(`[website] Storage cleanup failed: ${error.message}`);
  }
}
