import PostalMime from "postal-mime";
import { extensionOf, isBlockedFile } from "./file-types";

// Parsing for saved email messages (.eml / RFC822).
//
// The raw source of an email is mostly machinery: MIME boundaries, encoded
// header words, quoted-printable soft breaks, and base64 attachment payloads
// that can dwarf the actual message. None of that should reach an embedding
// index, so we extract the parts a parent would actually ask about — who sent
// it, when, what it said, and what was attached.

export interface ParsedEmail {
  subject: string;
  from: string | null;
  to: string | null;
  date: string | null;
  /** Header block plus body, ready to chunk. */
  text: string;
  attachments: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  buffer: Buffer;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    // Inline tags become spaces so words don't fuse ("is<b>Monday" -> "isMonday"),
    // which leaves punctuation stranded: "<b>Monday</b>." -> "Monday .". Reattach it.
    .replace(/[ \t]+([.,;:!?)\]}])/g, "$1")
    .replace(/([([{])[ \t]+/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatAddress(
  address: { name?: string; address?: string } | undefined
): string | null {
  if (!address) return null;
  const name = address.name?.trim();
  const email = address.address?.trim();
  if (name && email) return `${name} <${email}>`;
  return email || name || null;
}

function formatAddressList(
  addresses: { name?: string; address?: string }[] | undefined
): string | null {
  if (!addresses?.length) return null;
  const formatted = addresses.map(formatAddress).filter(Boolean);
  return formatted.length > 0 ? formatted.join(", ") : null;
}

/**
 * Parse a raw .eml buffer into indexable text plus its attachments.
 *
 * The returned `text` leads with a header block. Emails are often replied to
 * as "the email the office sent on the 3rd", so sender and date need to be
 * searchable content, not just metadata.
 */
export async function parseEml(buffer: Buffer): Promise<ParsedEmail> {
  const parsed = await PostalMime.parse(buffer);

  const subject = parsed.subject?.trim() || "(no subject)";
  const from = formatAddress(parsed.from);
  const to = formatAddressList(parsed.to);

  // Normalise to ISO so downstream formatting is predictable; fall back to the
  // raw header when it isn't a date we can parse.
  let date: string | null = null;
  if (parsed.date) {
    const parsedDate = new Date(parsed.date);
    date = Number.isNaN(parsedDate.getTime())
      ? parsed.date
      : parsedDate.toISOString();
  }

  // Prefer the plain-text part. HTML is a fallback because stripping tags
  // loses structure that the text alternative usually preserves.
  const bodyText =
    parsed.text?.trim() || (parsed.html ? stripHtml(parsed.html) : "");

  const attachments: EmailAttachment[] = [];

  for (const attachment of parsed.attachments ?? []) {
    const filename = attachment.filename?.trim();

    // Inline parts are signatures, tracking pixels, and layout images — not
    // documents anyone means to send.
    if (!filename || attachment.disposition === "inline") continue;
    if (isBlockedFile(filename)) continue;
    if (!extensionOf(filename)) continue;

    attachments.push({
      filename,
      contentType: attachment.mimeType || "application/octet-stream",
      buffer: Buffer.from(attachment.content as ArrayBuffer),
    });
  }

  const headerLines = [
    `Subject: ${subject}`,
    from ? `From: ${from}` : null,
    to ? `To: ${to}` : null,
    date ? `Date: ${new Date(date).toUTCString()}` : null,
    attachments.length > 0
      ? `Attachments: ${attachments.map((a) => a.filename).join(", ")}`
      : null,
  ].filter(Boolean);

  const text = [headerLines.join("\n"), bodyText].filter(Boolean).join("\n\n");

  return { subject, from, to, date, text, attachments };
}
