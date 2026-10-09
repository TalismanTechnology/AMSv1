import type { Resend } from "resend";
import { isBlockedFile } from "@/lib/documents/file-types";
import {
  addDocumentDivisions,
  ingestFileAsDocument,
  removeIngestedDocuments,
  triggerProcessingHttp,
} from "@/lib/documents/ingest";

/**
 * Turn one received email into documents: the body as one text document and
 * each real attachment as its own. Shared by the inbound webhook (allowlisted
 * senders) and the admin "Approve" action (mail held for review), so both
 * paths ingest exactly the same way.
 *
 * Content is fetched from Resend by email id (Resend keeps received mail for
 * 30 days), so mail held for review is never stored by us until approved.
 *
 * Returns the new document ids; an empty array means nothing was ingestible.
 * On failure, documents already created are removed and the error rethrown,
 * so a retry starts clean.
 */
export async function ingestReceivedEmail(params: {
  resend: Resend;
  schoolId: string;
  emailId: string;
  subject: string | null;
  fromAddress: string | null;
  divisionIds: string[];
  /** App origin used to kick off document processing. */
  origin: string;
}): Promise<string[]> {
  const { resend, schoolId, emailId, fromAddress, divisionIds, origin } = params;
  const documentIds: string[] = [];

  try {
    const subject = (params.subject ?? "").trim() || "(no subject)";

    // Body as one text document.
    const { data: email, error: emailError } =
      await resend.emails.receiving.get(emailId);
    if (emailError) {
      throw new Error(`Could not fetch email from Resend: ${emailError.message}`);
    }
    const bodyText =
      email?.text?.trim() || (email?.html ? htmlToText(email.html) : "");

    if (bodyText) {
      const { documentId, error } = await ingestFileAsDocument({
        schoolId,
        buffer: Buffer.from(bodyText, "utf-8"),
        fileName: `${subject}.txt`,
        contentType: "text/plain",
        title: subject,
        description: fromAddress ? `Emailed by ${fromAddress}` : null,
      });
      if (documentId) documentIds.push(documentId);
      else console.warn(`[inbound-email] Body ingest skipped: ${error}`);
    }

    // Each real attachment as its own document.
    const { data: attachmentList } =
      await resend.emails.receiving.attachments.list({ emailId });

    for (const att of attachmentList?.data ?? []) {
      const filename = att.filename || "attachment";
      // Skip inline images and unsupported image types.
      if (att.content_disposition === "inline") continue;
      if (isBlockedFile(filename)) continue;

      const dl = await fetch(att.download_url);
      if (!dl.ok) {
        console.warn(`[inbound-email] Download failed for ${filename}`);
        continue;
      }
      const buffer = Buffer.from(await dl.arrayBuffer());

      const { documentId, error } = await ingestFileAsDocument({
        schoolId,
        buffer,
        fileName: filename,
        contentType: att.content_type,
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

    for (const id of documentIds) {
      await triggerProcessingHttp(id, origin);
    }

    return documentIds;
  } catch (err) {
    // Undo the partial ingest so a retry starts clean.
    await removeIngestedDocuments(documentIds);
    throw err;
  }
}

/** Strip HTML tags to a plain-text fallback when no text/plain part exists. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
