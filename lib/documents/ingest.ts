import { createAdminClient } from "@/lib/supabase/admin";
import { fileTypeFromName } from "@/lib/documents/file-types";

/**
 * Sanitize a filename for use in a storage key: keep it readable but strip
 * path separators and anything that could break the object key.
 */
function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "attachment";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "attachment";
}

export interface IngestFileParams {
  schoolId: string;
  buffer: Buffer;
  fileName: string;
  /** MIME type from the email provider, used for the storage upload. */
  contentType?: string;
  title: string;
  description?: string | null;
}

/**
 * Create a document from a raw file buffer using the service-role client.
 * Used by the inbound-email webhook, which has no authenticated user session.
 * Returns the new document id, or null on failure (caller logs the reason).
 */
export async function ingestFileAsDocument(
  params: IngestFileParams
): Promise<{ documentId: string | null; error?: string }> {
  const supabase = createAdminClient();

  const cleanName = safeFileName(params.fileName);
  const fileType = fileTypeFromName(cleanName);
  const storageKey = `${params.schoolId}/email/${Date.now()}-${cleanName}`;

  const blob = new Blob([new Uint8Array(params.buffer)], {
    type: params.contentType || "application/octet-stream",
  });

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storageKey, blob, {
      contentType: params.contentType || undefined,
      upsert: false,
    });

  if (uploadError) {
    return { documentId: null, error: `Upload failed: ${uploadError.message}` };
  }

  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      title: params.title,
      description: params.description ?? null,
      file_name: cleanName,
      file_type: fileType,
      file_url: storageKey,
      file_size: params.buffer.length,
      status: "processing",
      source: "email",
      uploaded_by: null,
      school_id: params.schoolId,
    })
    .select("id")
    .single();

  if (insertError || !doc) {
    // Best-effort cleanup of the orphaned upload.
    await supabase.storage.from("documents").remove([storageKey]);
    return {
      documentId: null,
      error: `Failed to save record: ${insertError?.message}`,
    };
  }

  return { documentId: doc.id };
}

/**
 * Mark documents as being for these divisions, keeping any they already have.
 * Documents deleted since they were ingested are skipped. Throws on a database
 * error so the webhook can fail the delivery and let Resend retry it.
 */
export async function addDocumentDivisions(
  documentIds: string[],
  divisionIds: string[]
): Promise<void> {
  if (!documentIds.length || !divisionIds.length) return;
  const supabase = createAdminClient();

  const { data: docs, error: readError } = await supabase
    .from("documents")
    .select("id")
    .in("id", documentIds);
  if (readError) throw new Error(`Could not read documents: ${readError.message}`);

  const rows = (docs ?? []).flatMap((doc) =>
    divisionIds.map((division_id) => ({ document_id: doc.id, division_id }))
  );
  if (!rows.length) return;

  const { error } = await supabase
    .from("document_divisions")
    .upsert(rows, { onConflict: "document_id,division_id", ignoreDuplicates: true });
  if (error) throw new Error(`Could not tag divisions: ${error.message}`);
}

/**
 * Delete documents created earlier in a failed ingest, storage objects first.
 * Lets a webhook retry start clean instead of duplicating what the failed
 * attempt already saved. Best-effort: failures are logged, not thrown.
 */
export async function removeIngestedDocuments(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const supabase = createAdminClient();

  try {
    const { data: docs } = await supabase
      .from("documents")
      .select("file_url")
      .in("id", ids);

    const paths = (docs ?? []).map((d) => d.file_url).filter(Boolean);
    if (paths.length) await supabase.storage.from("documents").remove(paths);

    await supabase.from("documents").delete().in("id", ids);
  } catch (err) {
    console.error(`[ingest] Failed to clean up documents ${ids.join(", ")}:`, err);
  }
}

/**
 * Kick off async processing for an ingested document by calling the internal
 * process-document route, which handles the dev (child process) vs prod
 * (inline) split. Fire-and-forget: failures are logged, not thrown.
 */
export async function triggerProcessingHttp(
  documentId: string,
  origin: string
): Promise<void> {
  const secret = process.env.PROCESS_DOCUMENT_SECRET;
  if (!secret) {
    console.error("[ingest] PROCESS_DOCUMENT_SECRET not set — cannot process");
    return;
  }

  try {
    await fetch(`${origin}/api/process-document`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-process-secret": secret,
      },
      body: JSON.stringify({ documentId }),
    });
  } catch (err) {
    console.error(`[ingest] Failed to trigger processing for ${documentId}:`, err);
  }
}
