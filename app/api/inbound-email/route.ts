import { NextRequest, NextResponse } from "next/server";
import { getResendClient } from "@/lib/email/resend";
import { fetchResendEmail } from "@/lib/email/inbound-content";
import { processInboundEmail } from "@/lib/email/process-inbound";

export const maxDuration = 300;

const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "";
const INBOUND_SECRET = process.env.RESEND_INBOUND_SECRET || "";

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

  // Routing, the sender gate, claiming, ingest and logging are shared with
  // manual submissions (lib/email/process-inbound.ts). Forwarded, CC'd and
  // BCC'd copies can carry our address outside "to", so every recipient list
  // is checked.
  const outcome = await processInboundEmail({
    routing: {
      recipients: [
        ...(data.to ?? []),
        ...(data.cc ?? []),
        ...(data.bcc ?? []),
        ...(data.received_for ?? []),
      ],
      inboundDomain: INBOUND_DOMAIN,
    },
    meta: {
      emailId: data.email_id ?? null,
      messageId: data.message_id ?? null,
      from: data.from ?? null,
      subject: data.subject ?? null,
    },
    loadContent: () => fetchResendEmail(resend, data.email_id),
    origin: process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin,
    onReview: "hold",
    // The same content check as manual submissions: a native copy of mail
    // already added another way is logged as a duplicate of it.
    contentDedupe: true,
  });

  const body = outcome.error
    ? { error: outcome.error }
    : outcome.status === "accepted"
      ? { status: outcome.status, documents: outcome.documentIds.length }
      : { status: outcome.status };
  return NextResponse.json(body, { status: outcome.httpStatus });
}
