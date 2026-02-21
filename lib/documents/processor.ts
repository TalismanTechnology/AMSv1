import { createAdminClient } from "@/lib/supabase/admin";
import { extractText } from "./parser";
import { convertToPdf } from "./convert-to-pdf";
import { splitTextIntoChunks } from "@/lib/ai/chunking";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { generateSummary } from "@/lib/ai/summary";

const BATCH_SIZE = 5;

function logMem(label: string) {
  const mem = process.memoryUsage();
  const rss = Math.round(mem.rss / 1024 / 1024);
  const heap = Math.round(mem.heapUsed / 1024 / 1024);
  console.log(`[processor] [RSS: ${rss}MB, Heap: ${heap}MB] ${label}`);
}

export async function processDocument(documentId: string) {
  const supabase = createAdminClient();

  try {
    logMem(`Starting: ${documentId}`);

    // 1. Fetch document record
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      throw new Error(`Document not found: ${docError?.message}`);
    }

    logMem("Doc record fetched");

    // 2. Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(doc.file_url);

    if (downloadError || !fileData) {
      throw new Error(`Download failed: ${downloadError?.message}`);
    }

    let buffer: Buffer | null = Buffer.from(await fileData.arrayBuffer());
    logMem(`Downloaded file (${buffer.length} bytes)`);

    // 2b. Convert to PDF for viewer (non-fatal)
    let pdfPath: string | null = null;
    if (doc.file_type !== "pdf" && doc.file_type !== "txt" && doc.file_type !== "image") {
      try {
        logMem("Starting PDF conversion");
        const pdfBuffer = await convertToPdf(buffer, doc.file_type);
        if (pdfBuffer) {
          pdfPath = doc.file_url.replace(/\.[^.]+$/, "") + ".pdf";
          const pdfBlob = new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" });
          const { error: pdfError } = await supabase.storage
            .from("documents")
            .upload(pdfPath, pdfBlob, { upsert: true });
          if (pdfError) {
            console.warn(`[processor] PDF upload failed: ${pdfError.message}`);
            pdfPath = null;
          } else {
            logMem(`PDF conversion saved (${pdfBuffer.length} bytes)`);
          }
        }
      } catch (err) {
        console.warn(`[processor] PDF conversion failed (non-fatal):`, err);
      }
    }

    // 3. Extract text
    const text = await extractText(buffer, doc.file_type);

    // Release file buffer — no longer needed
    buffer = null;
    logMem(`Text extracted (${text.length} chars)`);

    if (!text || text.trim().length === 0) {
      throw new Error("No text could be extracted from the document");
    }

    // 4. Save extracted .txt to storage alongside original
    const txtPath = doc.file_url.replace(/\.[^.]+$/, "") + ".txt";
    const txtBlob = new Blob([text], { type: "text/plain" });
    let txtSaved = false;
    const { error: txtError } = await supabase.storage
      .from("documents")
      .upload(txtPath, txtBlob, { upsert: true });

    if (txtError) {
      console.warn(`[processor] .txt upload failed: ${txtError.message}`);
    } else {
      txtSaved = true;
    }
    logMem("Txt saved to storage");

    // 5. Chunk text
    const chunks = splitTextIntoChunks(text);
    logMem(`${chunks.length} chunks created`);

    // 6. Delete existing chunks (reprocessing support)
    await supabase
      .from("document_chunks")
      .delete()
      .eq("document_id", documentId);

    // 7. Embed and insert in batches
    let totalInserted = 0;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

      logMem(`Embedding batch ${batchNum}/${totalBatches}`);
      const embeddings = await generateEmbeddings(batch.map((c) => c.content));

      const records = batch.map((chunk, j) => ({
        document_id: documentId,
        content: chunk.content,
        chunk_index: chunk.index,
        embedding: JSON.stringify(embeddings[j]),
        metadata: chunk.metadata,
        school_id: doc.school_id,
      }));

      const { error: insertError } = await supabase
        .from("document_chunks")
        .insert(records);

      if (insertError) {
        throw new Error(`Chunk insert failed: ${insertError.message}`);
      }

      totalInserted += batch.length;
      logMem(`Batch ${batchNum} inserted (${totalInserted}/${chunks.length} total)`);
    }

    // 8. Generate AI summary (non-fatal)
    let summary: string | null = null;
    try {
      logMem("Generating summary");
      summary = await generateSummary(text, doc.title);
      logMem("Summary generated");
    } catch (err) {
      console.warn(`[processor] Summary generation failed:`, err);
    }

    // 9. Mark document as ready
    await supabase
      .from("documents")
      .update({
        status: "ready",
        page_count: totalInserted,
        summary,
        ...(txtSaved ? { text_url: txtPath } : {}),
        ...(pdfPath ? { pdf_url: pdfPath } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    logMem(`Done: ${documentId} (${totalInserted} chunks)`);
    return { success: true, chunkCount: totalInserted };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`[processor] Failed: ${documentId}:`, message);

    await supabase
      .from("documents")
      .update({
        status: "error",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    throw error;
  }
}
