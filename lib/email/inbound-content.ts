import PostalMime from "postal-mime";
import type { Resend } from "resend";

// Where an inbound email's content comes from. The webhook fetches it from
// Resend by email id; a manual submission hands us the raw RFC822 message.
// Both become an InboundContent, so ingestReceivedEmail treats them the same.

export interface InboundAttachment {
  filename: string | null;
  contentType: string;
  /** "inline" parts (signatures, tracking pixels) are skipped. */
  disposition: string | null;
  /** The bytes, or null when they couldn't be fetched (the part is skipped). */
  load: () => Promise<Buffer | null>;
}

export interface InboundContent {
  subject: string | null;
  from: string | null;
  to: string[];
  cc: string[];
  replyTo: string[];
  /** When the mail was received / sent, ISO when known. */
  date: string | null;
  text: string | null;
  html: string | null;
  attachments: InboundAttachment[];
}

/** Fetch a received email and its attachment list from Resend. */
export async function fetchResendEmail(
  resend: Resend,
  emailId: string
): Promise<InboundContent> {
  const { data: email, error } = await resend.emails.receiving.get(emailId);
  if (error) {
    throw new Error(`Could not fetch email from Resend: ${error.message}`);
  }

  const { data: attachmentList } =
    await resend.emails.receiving.attachments.list({ emailId });

  return {
    subject: email?.subject ?? null,
    from: email?.from || null,
    to: email?.to ?? [],
    cc: email?.cc ?? [],
    replyTo: email?.reply_to ?? [],
    date: email?.created_at || null,
    text: email?.text ?? null,
    html: email?.html ?? null,
    attachments: (attachmentList?.data ?? []).map((att) => ({
      filename: att.filename ?? null,
      contentType: att.content_type,
      disposition: att.content_disposition ?? null,
      load: async () => {
        const dl = await fetch(att.download_url);
        return dl.ok ? Buffer.from(await dl.arrayBuffer()) : null;
      },
    })),
  };
}

/** A raw RFC822 message parsed into the headers we route on plus its content. */
export interface ParsedRawEmail {
  messageId: string | null;
  /** The From header as "Name <addr>" (or just the address). */
  from: string | null;
  subject: string | null;
  content: InboundContent;
}

type MimeAddress = { name?: string; address?: string; group?: MimeAddress[] };

function formatAddress(address: MimeAddress | undefined): string | null {
  if (!address) return null;
  const name = address.name?.trim();
  const email = address.address?.trim();
  if (name && email) return `${name} <${email}>`;
  return email || name || null;
}

function formatAddresses(addresses: MimeAddress[] | undefined): string[] {
  return (addresses ?? [])
    .flatMap((a) => (a.group ? a.group : [a]))
    .map(formatAddress)
    .filter((a): a is string => !!a);
}

/** Parse a raw RFC822 message (e.g. a Gmail "raw" export). */
export async function parseRawEmail(raw: Buffer): Promise<ParsedRawEmail> {
  const parsed = await PostalMime.parse(raw);

  let date: string | null = null;
  if (parsed.date) {
    const d = new Date(parsed.date);
    date = Number.isNaN(d.getTime()) ? parsed.date : d.toISOString();
  }

  const from = formatAddress(parsed.from as MimeAddress | undefined);
  const subject = parsed.subject ?? null;

  return {
    messageId: parsed.messageId?.trim() || null,
    from,
    subject,
    content: {
      subject,
      from,
      to: formatAddresses(parsed.to as MimeAddress[] | undefined),
      cc: formatAddresses(parsed.cc as MimeAddress[] | undefined),
      replyTo: formatAddresses(parsed.replyTo as MimeAddress[] | undefined),
      date,
      text: parsed.text ?? null,
      html: parsed.html ?? null,
      attachments: (parsed.attachments ?? []).map((att) => {
        const buffer =
          typeof att.content === "string"
            ? Buffer.from(att.content, "utf-8")
            : Buffer.from(att.content as ArrayBuffer);
        return {
          filename: att.filename ?? null,
          contentType: att.mimeType || "application/octet-stream",
          disposition: att.disposition ?? null,
          load: async () => buffer,
        };
      }),
    },
  };
}

export interface Redaction {
  pattern: string;
  flags?: string;
  replace?: string;
}

/**
 * Compile redactions up front so a bad pattern is reported before anything
 * is written. Every match is replaced ("g" is always added).
 */
export function compileRedactions(
  redactions: Redaction[]
): { rules: { re: RegExp; replace: string }[] } | { error: string } {
  const rules: { re: RegExp; replace: string }[] = [];
  for (const r of redactions) {
    if (!r || typeof r.pattern !== "string" || !r.pattern) {
      return { error: "Each redaction needs a non-empty pattern" };
    }
    const flags = r.flags ?? "";
    try {
      rules.push({
        re: new RegExp(r.pattern, flags.includes("g") ? flags : flags + "g"),
        replace: typeof r.replace === "string" ? r.replace : "[redacted]",
      });
    } catch (err) {
      return {
        error: `Invalid redaction pattern ${JSON.stringify(r.pattern)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }
  return { rules };
}

/** Apply compiled redactions to the text and HTML bodies. */
export function applyRedactions(
  content: InboundContent,
  rules: { re: RegExp; replace: string }[]
): InboundContent {
  if (!rules.length) return content;
  const redact = (s: string | null) =>
    s == null ? s : rules.reduce((acc, { re, replace }) => acc.replace(re, replace), s);
  return { ...content, text: redact(content.text), html: redact(content.html) };
}
