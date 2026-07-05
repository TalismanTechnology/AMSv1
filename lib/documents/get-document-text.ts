import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

interface DocumentTextSource {
  id: string;
  school_id: string;
  text_url?: string | null;
}

/**
 * Return the full extracted text of a processed document.
 *
 * Primary source is the `.txt` the processing pipeline saves to storage
 * (`documents.text_url`) — this already includes the Gemini Vision transcript
 * for scanned/image PDFs. Falls back to reconstructing the text from
 * `document_chunks` (ordered by chunk_index) when no text file exists.
 *
 * Returns an empty string when neither source yields content; callers should
 * treat that as "nothing to extract" and surface a friendly message.
 */
export async function getDocumentText(
  supabase: ServerClient,
  doc: DocumentTextSource
): Promise<string> {
  if (doc.text_url) {
    const { data, error } = await supabase.storage
      .from("documents")
      .download(doc.text_url);
    if (!error && data) {
      const text = (await data.text()).trim();
      if (text) return text;
    }
  }

  const { data: chunks } = await supabase
    .from("document_chunks")
    .select("content, chunk_index")
    .eq("document_id", doc.id)
    .eq("school_id", doc.school_id)
    .order("chunk_index", { ascending: true });

  if (chunks && chunks.length > 0) {
    return chunks
      .map((c) => c.content as string)
      .join("\n\n")
      .trim();
  }

  return "";
}
