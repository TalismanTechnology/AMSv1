import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addDocumentDivisions,
  ingestFileAsDocument,
  removeIngestedDocuments,
  processDocumentInProcess,
  triggerProcessingHttp,
} from "@/lib/documents/ingest";
import { OUTCOMES } from "@/lib/push/document-push";
import {
  emailBodyText,
  isIngestibleAttachment,
  type InboundContent,
} from "@/lib/email/inbound-content";
import {
  bodyHash,
  findContentDuplicates,
  type ContentDuplicates,
  type DuplicateMatch,
} from "@/lib/email/content-dedupe";
import { isProcessed, waitForProcessing } from "@/lib/email/post-process";

export interface IngestedEmail {
  /** Documents created; empty when nothing new was ingestible. */
  documentIds: string[];
  /** Parts skipped because the library already has them ("body" or a file name). */
  duplicates: { part: string; match: DuplicateMatch }[];
}

/**
 * Turn one received email into documents: the body as one text document and
 * each real attachment as its own. Shared by the inbound webhook, the admin
 * "Approve" action (older mail held for review) and manual
 * raw-MIME submissions, so every path ingests exactly the same way.
 *
 * The content comes from the caller's source: fetched from Resend by email id
 * (Resend keeps received mail for 30 days, so mail held for review is never
 * stored by us until approved), or parsed from a raw message. It is loaded
 * inside the cleanup scope, so a failed fetch is handled like any failure.
 *
 * With `dedupe`, the body and each attachment already in the school's
 * library (lib/email/content-dedupe.ts) are skipped and reported instead.
 * With `processingDeadline`, it waits for processing to finish and fails if a
 * document ends in error or with no chunks.
 *
 * Returns the new document ids; an empty array means nothing new was
 * ingestible. On failure, documents already created are removed and the
 * error rethrown, so a retry starts clean.
 */
export async function ingestReceivedEmail(params: {
  schoolId: string;
  loadContent: () => Promise<InboundContent>;
  subject: string | null;
  fromAddress: string | null;
  divisionIds: string[];
  /** App origin used to kick off document processing. */
  origin: string;
  /**
   * Pre-mark the new documents as handled in the push queue so finishing
   * processing doesn't notify parents (e.g. backfilled mail).
   */
  suppressPush?: boolean;
  /** Skip parts already in the school's library. */
  dedupe?: boolean;
  /**
   * Epoch ms. When set, process the documents concurrently and wait (until
   * then) for them to finish; a document that fails processing fails the
   * ingest. One still processing at the deadline is left to finish.
   */
  processingDeadline?: number;
  /**
   * Run processDocument here and await it instead of calling
   * /api/process-document (which needs PROCESS_DOCUMENT_SECRET).
   */
  processInline?: boolean;
}): Promise<IngestedEmail> {
  const { schoolId, fromAddress, divisionIds, origin } = params;
  const documentIds: string[] = [];
  const duplicates: IngestedEmail["duplicates"] = [];
  // Storage keys outside documents.file_url (the original HTML body), which
  // removeIngestedDocuments doesn't know about.
  const extraPaths: string[] = [];

  try {
    const subject = (params.subject ?? "").trim() || "(no subject)";

    const email = await params.loadContent();
    const bodyText = emailBodyText(email);

    // Read-only; done before anything is written.
    const known: ContentDuplicates | null = params.dedupe
      ? await findContentDuplicates({ schoolId, subject: params.subject, content: email })
      : null;

    // Body as one text document.
    if (bodyText && known?.body) {
      duplicates.push({ part: "body", match: known.body });
    } else if (bodyText) {
      const { documentId, error } = await ingestFileAsDocument({
        schoolId,
        buffer: Buffer.from(bodyText, "utf-8"),
        fileName: `${subject}.txt`,
        contentType: "text/plain",
        title: subject,
        description: fromAddress ? `Emailed by ${fromAddress}` : null,
      });
      if (documentId) {
        documentIds.push(documentId);
        const htmlPath = await saveEmailSourceMeta({
          schoolId,
          documentId,
          subject,
          email,
          bodyText,
        });
        if (htmlPath) extraPaths.push(htmlPath);
      } else console.warn(`[inbound-email] Body ingest skipped: ${error}`);
    }

    // Each real attachment as its own document; inline images and
    // unsupported types are skipped.
    const attachments = email.attachments.filter(isIngestibleAttachment);
    for (const [i, att] of attachments.entries()) {
      const filename = att.filename || "attachment";
      const match = known?.attachments[i]?.match;
      if (match) {
        duplicates.push({ part: filename, match });
        continue;
      }

      const buffer = await att.load();
      if (!buffer) {
        console.warn(`[inbound-email] Download failed for ${filename}`);
        continue;
      }

      const { documentId, error } = await ingestFileAsDocument({
        schoolId,
        buffer,
        fileName: filename,
        contentType: att.contentType,
        title: filename.replace(/\.[^.]+$/, ""),
        description: `From email: "${subject}"${fromAddress ? ` (${fromAddress})` : ""}`,
      });
      if (documentId) documentIds.push(documentId);
      else console.warn(`[inbound-email] Attachment ingest skipped: ${error}`);
    }

    if (!documentIds.length) return { documentIds, duplicates };

    // Mark the documents with the divisions whose addresses the mail
    // reached. Done before processing so auto-sort can use it.
    await addDocumentDivisions(documentIds, divisionIds);

    // Before processing, which is what queues the push.
    if (params.suppressPush) await suppressDocumentPushes(schoolId, documentIds);

    const processOne = params.processInline
      ? processDocumentInProcess
      : (id: string) => triggerProcessingHttp(id, origin);
    if (params.processingDeadline === undefined) {
      for (const id of documentIds) {
        await processOne(id);
      }
      return { documentIds, duplicates };
    }

    await Promise.all(documentIds.map(processOne));
    const states = await waitForProcessing(documentIds, params.processingDeadline);
    const failed = states.filter((s) => s.status !== "processing" && !isProcessed(s));
    if (failed.length) {
      throw new Error(
        `Processing failed: ${failed
          .map((s) => `${s.documentId} status=${s.status} chunks=${s.chunks}${s.error ? ` (${s.error})` : ""}`)
          .join("; ")}`
      );
    }
    return { documentIds, duplicates };
  } catch (err) {
    // Undo the partial ingest so a retry starts clean.
    await removeIngestedDocuments(documentIds);
    if (extraPaths.length) {
      try {
        await createAdminClient().storage.from("documents").remove(extraPaths);
      } catch (cleanupErr) {
        console.warn("[inbound-email] Could not remove email HTML:", cleanupErr);
      }
    }
    throw err;
  }
}

/**
 * Mark documents as already handled in the push queue. enqueueDocumentPush
 * upserts with ignoreDuplicates, so a processed row makes it a no-op and the
 * send-document-pushes cron never picks them up. Throws, so the ingest is
 * undone rather than a suppressed submission notifying parents.
 */
export async function suppressDocumentPushes(
  schoolId: string,
  documentIds: string[],
  db: Pick<SupabaseClient, "from"> = createAdminClient()
): Promise<void> {
  if (!documentIds.length) return;
  const now = new Date().toISOString();
  const { error } = await db
    .from("document_push_queue")
    .upsert(
      documentIds.map((document_id) => ({
        document_id,
        school_id: schoolId,
        processed_at: now,
        outcome: OUTCOMES.skippedDisabled,
      })),
      { onConflict: "document_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(`Could not suppress pushes: ${error.message}`);
}

/**
 * Keep what the source viewer needs to show the email as an email: its
 * headers, and the original HTML body in storage. Best-effort — the body text
 * is already ingested, so a failure here only warns. Returns the stored HTML
 * key, if one was written.
 */
async function saveEmailSourceMeta(params: {
  schoolId: string;
  documentId: string;
  subject: string;
  email: InboundContent;
  bodyText: string;
}): Promise<string | null> {
  const { schoolId, documentId, subject, email, bodyText } = params;
  let htmlPath: string | null = null;

  try {
    const supabase = createAdminClient();
    if (email.html?.trim()) {
      const key = `${schoolId}/email/${documentId}.html`;
      const { error } = await supabase.storage
        .from("documents")
        .upload(key, new Blob([email.html], { type: "text/html" }), {
          contentType: "text/html",
          upsert: true,
        });
      if (error) console.warn(`[inbound-email] HTML upload failed: ${error.message}`);
      else htmlPath = key;
    }

    const { error } = await supabase
      .from("documents")
      .update({
        email_meta: {
          from: email.from || null,
          to: email.to,
          cc: email.cc,
          reply_to: email.replyTo,
          date: email.date || null,
          subject: email.subject?.trim() || subject,
          html_path: htmlPath,
          // For the content duplicate check (lib/email/content-dedupe.ts).
          body_hash_v1: bodyHash(bodyText),
        },
      })
      .eq("id", documentId);
    if (error) console.warn(`[inbound-email] Saving email_meta failed: ${error.message}`);
  } catch (err) {
    console.warn("[inbound-email] Saving email source failed:", err);
  }
  return htmlPath;
}
