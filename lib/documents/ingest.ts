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
