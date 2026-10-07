import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import {
  parseEmailAddress,
  senderDomainAllowed,
  extractInboundToken,
  isStaleClaim,
} from "@/lib/email/inbound";
import { isBlockedFile } from "@/lib/documents/file-types";
import {
  ingestFileAsDocument,
  removeIngestedDocuments,
  triggerProcessingHttp,
} from "@/lib/documents/ingest";

export const maxDuration = 300;

const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "";
const INBOUND_SECRET = process.env.RESEND_INBOUND_SECRET || "";

type IngestStatus =
  | "processing"
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

/**
 * Claim a message before creating any documents by inserting its 'processing'
 * row; 027's partial unique index lets only one processing/accepted row exist
 * per message. Returns the claim row id, or why the message must be skipped.
 * A claim older than STALE_CLAIM_MS belonged to an attempt that died, so it is
 * cleared and taken over once.
 */
async function claimMessage(
  schoolId: string,
  data: ReceivedEvent["data"] & { message_id: string }
): Promise<{ claimId: string } | { skip: "duplicate" | "in_progress" }> {
  const supabase = createAdminClient();

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: row, error } = await supabase
      .from("email_ingestions")
      .insert({
        school_id: schoolId,
        email_id: data.email_id ?? null,
        message_id: data.message_id,
        from_address: data.from ?? null,
        subject: data.subject ?? null,
        status: "processing",
        reason: "Ingesting",
      })
      .select("id")
      .single();

    if (row) return { claimId: row.id };
    if (error?.code !== "23505") {
      throw new Error(`Could not claim message: ${error?.message}`);
    }

    const { data: holder } = await supabase
      .from("email_ingestions")
      .select("id, status, created_at")
      .eq("school_id", schoolId)
      .eq("message_id", data.message_id)
      .in("status", ["processing", "accepted"])
      .maybeSingle();

    if (!holder) continue; // released between our insert and this read
    if (holder.status === "accepted") return { skip: "duplicate" };
    if (!isStaleClaim(holder.created_at)) return { skip: "in_progress" };

    await supabase
      .from("email_ingestions")
      .update({ status: "error", reason: "Timed out; claim taken over by a retry" })
      .eq("id", holder.id)
      .eq("status", "processing");
  }

  return { skip: "in_progress" };
}

/** Settle a claim row as accepted or error, keeping it in the log. */
async function settleClaim(
  claimId: string,
  status: "accepted" | "error",
  reason: string,
  documentIds: string[] = []
) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("email_ingestions")
    .update({ status, reason, document_ids: documentIds })
    .eq("id", claimId);
  if (error) {
    console.error(`[inbound-email] Failed to settle claim ${claimId}:`, error.message);
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

  // An empty allowlist accepts any sender; the private address token is then
  // the only gate.
  const fromAddress = parseEmailAddress(data.from ?? "");
  const allowedDomains: string[] = school.allowed_sender_domains ?? [];
  if (
    allowedDomains.length > 0 &&
    !senderDomainAllowed(fromAddress, allowedDomains)
  ) {
    await record(
      school.id,
      data,
      "rejected_domain",
      `Sender ${fromAddress ?? "?"} not in allowlist`
    );
    return NextResponse.json({ status: "rejected_domain" });
  }

  // 4. Idempotency: claim the message so retries and concurrent deliveries
  // of the same email can't ingest it twice. Without a message id there is
  // nothing to key on, so the attempt is only logged when it finishes.
  let claimId: string | null = null;
  if (data.message_id) {
    const claim = await claimMessage(school.id, {
      ...data,
      message_id: data.message_id,
    });
    if ("skip" in claim) {
      return NextResponse.json({ status: claim.skip });
    }
    claimId = claim.claimId;
  }

  const finish = (
    status: "accepted" | "error",
    reason: string,
    ids: string[] = []
  ) =>
    claimId
      ? settleClaim(claimId, status, reason, ids)
      : record(school.id, data, status, reason, ids);

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
      await finish("error", "No ingestible content found");
      return NextResponse.json({ status: "empty" });
    }

    // 6. Trigger processing for each new document.
    for (const id of documentIds) {
      await triggerProcessingHttp(id, origin);
    }

    await finish("accepted", "Ingested", documentIds);
    return NextResponse.json({
      status: "accepted",
      documents: documentIds.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[inbound-email] Ingestion failed:", message);
    // Undo the partial ingest so Resend's retry starts clean, and release the
    // claim (status 'error') so that retry is allowed through.
    await removeIngestedDocuments(documentIds);
    await finish("error", message);
    // 500 so Resend retries transient failures.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
