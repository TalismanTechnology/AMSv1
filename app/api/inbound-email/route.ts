import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import {
  parseEmailAddress,
  senderDomainAllowed,
  extractInboundToken,
} from "@/lib/email/inbound";
import { isBlockedFile } from "@/lib/documents/file-types";
import {
  ingestFileAsDocument,
  triggerProcessingHttp,
} from "@/lib/documents/ingest";

export const maxDuration = 300;

const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "";
const INBOUND_SECRET = process.env.RESEND_INBOUND_SECRET || "";

type IngestStatus =
  | "accepted"
  | "rejected_disabled"
  | "rejected_domain"
  | "rejected_unknown"
  | "duplicate"
  | "error";

interface ReceivedEvent {
  type: string;
  data: {
    email_id: string;
    message_id?: string;
    subject?: string;
    from?: string;
    to?: string[];
  };
}

async function record(
  schoolId: string | null,
  data: ReceivedEvent["data"],
  status: IngestStatus,
  reason: string,
  documentIds: string[] = []
) {
  const supabase = createAdminClient();
  await supabase.from("email_ingestions").insert({
    school_id: schoolId,
    email_id: data.email_id ?? null,
    message_id: data.message_id ?? null,
    from_address: data.from ?? null,
    subject: data.subject ?? null,
    status,
    reason,
    document_ids: documentIds,
  });
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

export async function POST(request: NextRequest) {
  if (!INBOUND_SECRET || !INBOUND_DOMAIN) {
    console.error("[inbound-email] Missing RESEND_INBOUND_SECRET / INBOUND_EMAIL_DOMAIN");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const resend = getResendClient();
  if (!resend) {
    console.error("[inbound-email] RESEND_API_KEY not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // 1. Verify the webhook signature against the raw body.
  const raw = await request.text();
  try {
    resend.webhooks.verify({
      payload: raw,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: INBOUND_SECRET,
    });
  } catch (err) {
    console.error("[inbound-email] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: ReceivedEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ignored: event.type });
  }

  const { data } = event;
  const supabase = createAdminClient();

  // 2. Resolve the school by the inbound address token.
  const token = extractInboundToken(data.to ?? [], INBOUND_DOMAIN);
  if (!token) {
    await record(null, data, "rejected_unknown", "No inbound token in recipients");
    return NextResponse.json({ status: "rejected_unknown" });
  }

  const { data: school } = await supabase
    .from("schools")
    .select("id, email_ingestion_enabled, allowed_sender_domains")
    .eq("inbound_email_token", token)
    .single();

  if (!school) {
    await record(null, data, "rejected_unknown", `Unknown token: ${token}`);
    return NextResponse.json({ status: "rejected_unknown" });
  }

  // 3. Gate on enabled + sender domain allowlist.
  if (!school.email_ingestion_enabled) {
    await record(school.id, data, "rejected_disabled", "Ingestion disabled");
    return NextResponse.json({ status: "rejected_disabled" });
  }

  const fromAddress = parseEmailAddress(data.from ?? "");
  if (!senderDomainAllowed(fromAddress, school.allowed_sender_domains ?? [])) {
    await record(
      school.id,
      data,
      "rejected_domain",
      `Sender ${fromAddress ?? "?"} not in allowlist`
    );
    return NextResponse.json({ status: "rejected_domain" });
  }

  // 4. Idempotency: skip if we already accepted this message.
  if (data.message_id) {
    const { data: existing } = await supabase
      .from("email_ingestions")
      .select("id")
      .eq("school_id", school.id)
      .eq("message_id", data.message_id)
      .eq("status", "accepted")
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ status: "duplicate" });
    }
  }

  // 5. Fetch content + attachments and ingest.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const documentIds: string[] = [];

  try {
    const subject = (data.subject ?? "").trim() || "(no subject)";

    // Body as one text document.
    const { data: email } = await resend.emails.receiving.get(data.email_id);
    const bodyText =
      email?.text?.trim() || (email?.html ? htmlToText(email.html) : "");

    if (bodyText) {
      const { documentId, error } = await ingestFileAsDocument({
        schoolId: school.id,
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
      await resend.emails.receiving.attachments.list({
        emailId: data.email_id,
      });

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
        schoolId: school.id,
        buffer,
        fileName: filename,
        contentType: att.content_type,
        title: filename.replace(/\.[^.]+$/, ""),
        description: `From email: "${subject}"${fromAddress ? ` (${fromAddress})` : ""}`,
      });
      if (documentId) documentIds.push(documentId);
      else console.warn(`[inbound-email] Attachment ingest skipped: ${error}`);
    }

    if (!documentIds.length) {
      await record(school.id, data, "error", "No ingestible content found");
      return NextResponse.json({ status: "empty" });
    }

    // 6. Trigger processing for each new document.
    for (const id of documentIds) {
      await triggerProcessingHttp(id, origin);
    }

    await record(school.id, data, "accepted", "Ingested", documentIds);
    return NextResponse.json({
      status: "accepted",
      documents: documentIds.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[inbound-email] Ingestion failed:", message);
    await record(school.id, data, "error", message, documentIds);
    // 500 so Resend retries transient failures.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
