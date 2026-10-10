import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import {
  parseEmailAddress,
  senderGate,
  extractInboundTokens,
  routeInboundMessage,
  isStaleClaim,
} from "@/lib/email/inbound";
import { addDocumentDivisions } from "@/lib/documents/ingest";
import { ingestReceivedEmail } from "@/lib/email/ingest-message";

export const maxDuration = 300;

const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "";
const INBOUND_SECRET = process.env.RESEND_INBOUND_SECRET || "";

type IngestStatus =
  | "processing"
  | "accepted"
  | "pending_review"
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
    cc?: string[];
    bcc?: string[];
    /** Addresses from the `for` clause of the Received headers, i.e. who a
     * forwarded copy was actually delivered to. */
    received_for?: string[];
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
): Promise<
  | { claimId: string }
  | { skip: "duplicate"; documentIds: string[] }
  | { skip: "in_progress" }
> {
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
      .select("id, status, created_at, document_ids")
      .eq("school_id", schoolId)
      .eq("message_id", data.message_id)
      .in("status", ["processing", "accepted"])
      .maybeSingle();

    if (!holder) continue; // released between our insert and this read
    if (holder.status === "accepted") {
      return { skip: "duplicate", documentIds: holder.document_ids ?? [] };
    }
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

/**
 * Hold a message from an unvetted sender for admin review instead of
 * ingesting it. Nothing is fetched or stored but the metadata; an admin's
 * "Approve" later pulls the content from Resend by email id.
 *
 * A held message takes the same per-message slot as a claim (032's unique
 * index covers 'pending_review'), so a copy of the same email reaching a
 * second division address just adds that division to the held row, and a
 * copy of an email that was already approved adds its division to the
 * documents that approval created.
 */
async function holdForReview(
  schoolId: string,
  data: ReceivedEvent["data"],
  divisionIds: string[]
): Promise<NextResponse> {
  const supabase = createAdminClient();
  const row = {
    school_id: schoolId,
    email_id: data.email_id ?? null,
    message_id: data.message_id ?? null,
    from_address: data.from ?? null,
    subject: data.subject ?? null,
    status: "pending_review" as const,
    reason: "Held for review: no allowed sender domains are set",
    division_ids: divisionIds,
  };

  const { error } = await supabase.from("email_ingestions").insert(row);
  if (!error) return NextResponse.json({ status: "pending_review" });
  if (error.code !== "23505" || !data.message_id) {
    console.error("[inbound-email] Could not hold message for review:", error.message);
    return NextResponse.json({ error: "Could not hold message" }, { status: 500 });
  }

  const { data: holder } = await supabase
    .from("email_ingestions")
    .select("id, status, division_ids, document_ids")
    .eq("school_id", schoolId)
    .eq("message_id", data.message_id)
    .in("status", ["pending_review", "processing", "accepted"])
    .maybeSingle();

  if (!holder) {
    // Released between our insert and this read; let Resend retry.
    return NextResponse.json({ error: "Retry later" }, { status: 409 });
  }

  if (holder.status === "pending_review") {
    const merged = [...new Set([...(holder.division_ids ?? []), ...divisionIds])];
    await supabase
      .from("email_ingestions")
      .update({ division_ids: merged })
      .eq("id", holder.id)
      .eq("status", "pending_review");
    return NextResponse.json({ status: "pending_review" });
  }

  if (holder.status === "accepted") {
    try {
      await addDocumentDivisions(holder.document_ids ?? [], divisionIds);
    } catch (err) {
      console.error("[inbound-email] Adding divisions to a duplicate failed:", err);
      return NextResponse.json({ error: "Retry later" }, { status: 500 });
    }
    return NextResponse.json({ status: "duplicate" });
  }

  // Being ingested right now (an admin just approved it). Retry later so
  // this copy's divisions land on the finished documents.
  return divisionIds.length
    ? NextResponse.json({ status: "in_progress" }, { status: 409 })
    : NextResponse.json({ status: "in_progress" });
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

  // 2. Resolve the school, and the divisions the mail is for, from the
  // inbound addresses it reached. Forwarded, CC'd and BCC'd copies can carry
  // our address outside "to", so every recipient list is checked.
  const tokens = extractInboundTokens(
    [
      ...(data.to ?? []),
      ...(data.cc ?? []),
      ...(data.bcc ?? []),
      ...(data.received_for ?? []),
    ],
    INBOUND_DOMAIN
  );
  if (!tokens.length) {
    await record(null, data, "rejected_unknown", "No inbound token in recipients");
    return NextResponse.json({ status: "rejected_unknown" });
  }

  const { data: addresses, error: addressError } = await supabase
    .from("email_ingestion_addresses")
    .select("token, school_id, division_id")
    .in("token", tokens);
  if (addressError) {
    console.error("[inbound-email] Address lookup failed:", addressError.message);
    return NextResponse.json({ error: "Address lookup failed" }, { status: 500 });
  }

  const route = routeInboundMessage(tokens, addresses ?? []);
  if (!route) {
    await record(null, data, "rejected_unknown", `Unknown token: ${tokens.join(", ")}`);
    return NextResponse.json({ status: "rejected_unknown" });
  }

  const { data: school } = await supabase
    .from("schools")
    .select("id, email_ingestion_enabled, allowed_sender_domains")
    .eq("id", route.schoolId)
    .single();

  if (!school) {
    await record(null, data, "rejected_unknown", `Unknown school: ${route.schoolId}`);
    return NextResponse.json({ status: "rejected_unknown" });
  }

  // 3. Gate on enabled + sender domain allowlist.
  if (!school.email_ingestion_enabled) {
    await record(school.id, data, "rejected_disabled", "Ingestion disabled");
    return NextResponse.json({ status: "rejected_disabled" });
  }

  // Secure by default: with no allowlist, the private address token would be
  // the only gate between a stranger and documents parents read, so the
  // message is held for an admin to approve instead of being ingested.
  const fromAddress = parseEmailAddress(data.from ?? "");
  const gate = senderGate(fromAddress, school.allowed_sender_domains);
  if (gate === "reject") {
    await record(
      school.id,
      data,
      "rejected_domain",
      `Sender ${fromAddress ?? "?"} not in allowlist`
    );
    return NextResponse.json({ status: "rejected_domain" });
  }
  if (gate === "review") {
    return holdForReview(school.id, data, route.divisionIds);
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
      // One email can reach two division addresses as separate deliveries
      // with the same message id (each mailing list forwards its own copy).
      // The later copy adds its divisions to what the first one ingested.
      if (route.divisionIds.length && claim.skip === "duplicate") {
        try {
          await addDocumentDivisions(claim.documentIds, route.divisionIds);
        } catch (err) {
          console.error("[inbound-email] Adding divisions to a duplicate failed:", err);
          return NextResponse.json({ error: "Retry later" }, { status: 500 });
        }
      } else if (route.divisionIds.length) {
        // The first copy is still ingesting. Fail this one so Resend retries
        // it after that finishes, when it can add its divisions.
        return NextResponse.json({ status: claim.skip }, { status: 409 });
      }
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

  // 5. Fetch content + attachments, ingest, tag divisions and kick off
  // processing. Partial ingests are undone inside ingestReceivedEmail.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  try {
    const documentIds = await ingestReceivedEmail({
      resend,
      schoolId: school.id,
      emailId: data.email_id,
      subject: data.subject ?? null,
      fromAddress,
      divisionIds: route.divisionIds,
      origin,
    });

    if (!documentIds.length) {
      await finish("error", "No ingestible content found");
      return NextResponse.json({ status: "empty" });
    }

    await finish("accepted", "Ingested", documentIds);
    return NextResponse.json({
      status: "accepted",
      documents: documentIds.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[inbound-email] Ingestion failed:", message);
    // Release the claim (status 'error') so Resend's retry is allowed through.
    await finish("error", message);
    // 500 so Resend retries transient failures.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
