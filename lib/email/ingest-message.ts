import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBlockedFile } from "@/lib/documents/file-types";
import {
  addDocumentDivisions,
  ingestFileAsDocument,
  removeIngestedDocuments,
  triggerProcessingHttp,
} from "@/lib/documents/ingest";
import { OUTCOMES } from "@/lib/push/document-push";
import type { InboundContent } from "@/lib/email/inbound-content";

/**
 * Turn one received email into documents: the body as one text document and
 * each real attachment as its own. Shared by the inbound webhook (allowlisted
 * senders), the admin "Approve" action (mail held for review) and manual
 * raw-MIME submissions, so every path ingests exactly the same way.
 *
 * The content comes from the caller's source: fetched from Resend by email id
 * (Resend keeps received mail for 30 days, so mail held for review is never
 * stored by us until approved), or parsed from a raw message. It is loaded
 * inside the cleanup scope, so a failed fetch is handled like any failure.
 *
 * Returns the new document ids; an empty array means nothing was ingestible.
 * On failure, documents already created are removed and the error rethrown,
 * so a retry starts clean.
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
}): Promise<string[]> {
  const { schoolId, fromAddress, divisionIds, origin } = params;
  const documentIds: string[] = [];
  // Storage keys outside documents.file_url (the original HTML body), which
  // removeIngestedDocuments doesn't know about.
  const extraPaths: string[] = [];

  try {
    const subject = (params.subject ?? "").trim() || "(no subject)";

    // Body as one text document.
    const email = await params.loadContent();
    const bodyText =
      email.text?.trim() || (email.html ? htmlToText(email.html) : "");

    if (bodyText) {
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
        });
        if (htmlPath) extraPaths.push(htmlPath);
      } else console.warn(`[inbound-email] Body ingest skipped: ${error}`);
    }

    // Each real attachment as its own document.
    for (const att of email.attachments) {
      const filename = att.filename || "attachment";
      // Skip inline images and unsupported image types.
      if (att.disposition === "inline") continue;
      if (isBlockedFile(filename)) continue;

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

    if (!documentIds.length) return [];

    // Mark the documents with the divisions whose addresses the mail
    // reached. Done before processing so auto-sort can use it.
    await addDocumentDivisions(documentIds, divisionIds);

    // Before processing, which is what queues the push.
    if (params.suppressPush) await suppressDocumentPushes(schoolId, documentIds);

    for (const id of documentIds) {
      await triggerProcessingHttp(id, origin);
    }

    return documentIds;
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
}): Promise<string | null> {
  const { schoolId, documentId, subject, email } = params;
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
        },
      })
      .eq("id", documentId);
    if (error) console.warn(`[inbound-email] Saving email_meta failed: ${error.message}`);
  } catch (err) {
    console.warn("[inbound-email] Saving email source failed:", err);
  }
  return htmlPath;
}

/** Strip HTML tags to a plain-text fallback when no text/plain part exists. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
