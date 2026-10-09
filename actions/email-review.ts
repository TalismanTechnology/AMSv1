"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSchoolAdmin } from "@/lib/auth/require-school-admin";
import { getResendClient } from "@/lib/email/resend";
import { parseEmailAddress } from "@/lib/email/inbound";
import { ingestReceivedEmail } from "@/lib/email/ingest-message";
import { logAudit } from "@/lib/audit";

type ReviewResult = { success: true; documents?: number } | { error: string };

async function appOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * Approve an email that was held for review (sent while the school had no
 * allowed sender domains): fetch it from Resend and ingest it exactly as the
 * webhook would have.
 *
 * The row is flipped pending_review → processing with a conditional update
 * first, so two admins clicking Approve at once can't ingest it twice.
 */
export async function approveHeldEmail(
  schoolId: string,
  ingestionId: string
): Promise<ReviewResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const resend = getResendClient();
  if (!resend) return { error: "Email isn't configured on the server (RESEND_API_KEY)." };

  const admin = createAdminClient();
  const { data: row, error: claimError } = await admin
    .from("email_ingestions")
    .update({ status: "processing", reason: "Approved; ingesting" })
    .eq("id", ingestionId)
    .eq("school_id", schoolId)
    .eq("status", "pending_review")
    .select("id, email_id, subject, from_address, division_ids")
    .maybeSingle();

  if (claimError) return { error: claimError.message };
  if (!row) return { error: "This email is no longer waiting for review." };
  if (!row.email_id) {
    await admin
      .from("email_ingestions")
      .update({ status: "error", reason: "No email id to fetch" })
      .eq("id", row.id);
    return { error: "This email can't be fetched (no email id)." };
  }

  try {
    const documentIds = await ingestReceivedEmail({
      resend,
      schoolId,
      emailId: row.email_id,
      subject: row.subject,
      fromAddress: parseEmailAddress(row.from_address ?? ""),
      divisionIds: row.division_ids ?? [],
      origin: await appOrigin(),
    });

    const now = new Date().toISOString();
    await admin
      .from("email_ingestions")
      .update(
        documentIds.length
          ? {
              status: "accepted",
              reason: "Approved by an admin",
              document_ids: documentIds,
              reviewed_by: auth.userId,
              reviewed_at: now,
            }
          : {
              status: "error",
              reason: "Approved, but no ingestible content was found",
              reviewed_by: auth.userId,
              reviewed_at: now,
            }
      )
      .eq("id", row.id);

    logAudit(
      auth.userId,
      "approve_held_email",
      "email_ingestion",
      row.id,
      { documents: documentIds.length, from: row.from_address, subject: row.subject },
      schoolId
    );
    revalidatePath("/", "layout");

    return documentIds.length
      ? { success: true, documents: documentIds.length }
      : { error: "The email had nothing to add (no text or supported attachments)." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Put it back in the queue so the admin can retry or reject it.
    await admin
      .from("email_ingestions")
      .update({ status: "pending_review", reason: `Approval failed: ${message}` })
      .eq("id", row.id);
    revalidatePath("/", "layout");
    return { error: `Couldn't add this email: ${message}` };
  }
}

/** Reject an email that was held for review. Nothing was ingested; the row stays in the log. */
export async function rejectHeldEmail(
  schoolId: string,
  ingestionId: string
): Promise<ReviewResult> {
  const auth = await requireSchoolAdmin(schoolId);
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("email_ingestions")
    .update({
      status: "rejected_review",
      reason: "Rejected by an admin",
      reviewed_by: auth.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", ingestionId)
    .eq("school_id", schoolId)
    .eq("status", "pending_review")
    .select("id, from_address, subject")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!row) return { error: "This email is no longer waiting for review." };

  logAudit(
    auth.userId,
    "reject_held_email",
    "email_ingestion",
    row.id,
    { from: row.from_address, subject: row.subject },
    schoolId
  );
  revalidatePath("/", "layout");
  return { success: true };
}
