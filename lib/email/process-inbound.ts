import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseEmailAddress,
  senderGate,
  extractInboundTokens,
  routeInboundMessage,
  isStaleClaim,
  type SenderGateDecision,
} from "@/lib/email/inbound";
import { addDocumentDivisions } from "@/lib/documents/ingest";
import { ingestReceivedEmail } from "@/lib/email/ingest-message";
import type { InboundContent } from "@/lib/email/inbound-content";

// The one inbound-email pipeline: route to a school by address token, gate on
// the sender allowlist, claim the message so it is ingested once, ingest, and
// log every attempt in email_ingestions (the admin's "Recent emails"). The
// Resend webhook and manual raw-MIME submissions both run through here; they
// differ only in where the content comes from and how a result is reported.

export type IngestStatus =
  | "processing"
  | "accepted"
  | "pending_review"
  | "rejected_disabled"
  | "rejected_domain"
  | "rejected_unknown"
  | "duplicate"
  | "error";

export interface InboundMeta {
  /** Resend's received-email id; null for manual submissions. */
  emailId: string | null;
  messageId: string | null;
  /** The From header, "Name <addr>" or a bare address. */
  from: string | null;
  subject: string | null;
}

/** How the school is found: from the inbound addresses a delivery reached, or a token named outright. */
export type InboundRouting =
  | { recipients: string[]; inboundDomain: string }
  | { token: string };

export interface ProcessInboundParams {
  routing: InboundRouting;
  meta: InboundMeta;
  loadContent: () => Promise<InboundContent>;
  /** App origin used to kick off document processing. */
  origin: string;
  /**
   * What to do with mail when the school has no allowlist. "hold" logs it as
   * pending_review for an admin to approve, which re-fetches it from Resend;
   * "reject" logs it as rejected_domain (for content that can't be re-fetched).
   */
  onReview: "hold" | "reject";
  /** Appended to every logged reason, e.g. " (manual: gmail-intake)". */
  reasonSuffix?: string;
  suppressPush?: boolean;
  /** Route, gate and check for duplicates, but write nothing. */
  dryRun?: boolean;
}

export type InboundOutcomeStatus = IngestStatus | "in_progress" | "empty";

export interface ProcessInboundResult {
  status: InboundOutcomeStatus;
  /** The HTTP status the webhook answers with (non-2xx makes Resend retry). */
  httpStatus: number;
  /** Set when the webhook answers `{ error }` instead of `{ status }`. */
  error?: string;
  reason: string;
  documentIds: string[];
  /** The email_ingestions row written for this attempt, if any. */
  ingestionId: string | null;
  schoolId: string | null;
  divisionIds: string[];
  gate?: SenderGateDecision;
  /** Dry run only: whether the message is already held, claimed or ingested. */
  duplicate?: boolean;
  dryRun?: boolean;
}

type Db = Pick<ReturnType<typeof createAdminClient>, "from">;

export interface ProcessInboundDeps {
  db: () => Db;
  ingest: typeof ingestReceivedEmail;
  addDivisions: typeof addDocumentDivisions;
}

const defaultDeps: ProcessInboundDeps = {
  db: createAdminClient,
  ingest: ingestReceivedEmail,
  addDivisions: addDocumentDivisions,
};

export async function processInboundEmail(
  params: ProcessInboundParams,
  deps: ProcessInboundDeps = defaultDeps
): Promise<ProcessInboundResult> {
  const { meta, dryRun = false } = params;
  const suffix = params.reasonSuffix ?? "";
  const supabase = deps.db();

  // What is known so far, reported with every outcome.
  const known: {
    schoolId: string | null;
    divisionIds: string[];
    gate?: SenderGateDecision;
  } = { schoolId: null, divisionIds: [] };

  const result = (
    status: InboundOutcomeStatus,
    reason: string,
    extra: Partial<ProcessInboundResult> = {}
  ): ProcessInboundResult => ({
    status,
    httpStatus: 200,
    reason,
    documentIds: [],
    ingestionId: null,
    ...known,
    ...(dryRun ? { dryRun: true } : {}),
    ...extra,
  });

  /** Log a finished attempt as its own row. */
  const record = async (
    status: IngestStatus,
    reason: string,
    documentIds: string[] = []
  ): Promise<ProcessInboundResult> => {
    let ingestionId: string | null = null;
    if (!dryRun) {
      const { data: row } = await supabase
        .from("email_ingestions")
        .insert({
          school_id: known.schoolId,
          email_id: meta.emailId,
          message_id: meta.messageId,
          from_address: meta.from,
          subject: meta.subject,
          status,
          reason: reason + suffix,
          document_ids: documentIds,
        })
        .select("id")
        .single();
      ingestionId = row?.id ?? null;
    }
    return result(status, reason + suffix, { documentIds, ingestionId });
  };

  // 1. Resolve the school, and the divisions the mail is for, from the
  // inbound addresses it reached (or the token it was submitted for).
  const tokens =
    "token" in params.routing
      ? [params.routing.token.trim().toLowerCase()].filter(Boolean)
      : extractInboundTokens(params.routing.recipients, params.routing.inboundDomain);
  if (!tokens.length) {
    return record("rejected_unknown", "No inbound token in recipients");
  }

  const { data: addresses, error: addressError } = await supabase
    .from("email_ingestion_addresses")
    .select("token, school_id, division_id")
    .in("token", tokens);
  if (addressError) {
    console.error("[inbound-email] Address lookup failed:", addressError.message);
    return result("error", "Address lookup failed", {
      httpStatus: 500,
      error: "Address lookup failed",
    });
  }

  const route = routeInboundMessage(tokens, addresses ?? []);
  if (!route) {
    return record("rejected_unknown", `Unknown token: ${tokens.join(", ")}`);
  }

  const { data: school } = await supabase
    .from("schools")
    .select("id, email_ingestion_enabled, allowed_sender_domains")
    .eq("id", route.schoolId)
    .single();

  if (!school) {
    return record("rejected_unknown", `Unknown school: ${route.schoolId}`);
  }
  const schoolId = school.id as string;
  known.schoolId = schoolId;
  known.divisionIds = route.divisionIds;

  // 2. Gate on enabled + sender domain allowlist.
  if (!school.email_ingestion_enabled) {
    return record("rejected_disabled", "Ingestion disabled");
  }

  // Secure by default: with no allowlist, the private address token would be
  // the only gate between a stranger and documents parents read, so the
  // message is held for an admin to approve instead of being ingested.
  const fromAddress = parseEmailAddress(meta.from ?? "");
  const gate = senderGate(fromAddress, school.allowed_sender_domains);
  known.gate = gate;
  if (gate === "reject") {
    return record("rejected_domain", `Sender ${fromAddress ?? "?"} not in allowlist`);
  }
  if (gate === "review") {
    if (params.onReview === "reject") {
      return record(
        "rejected_domain",
        "No allowed sender domains are set, and this submission can't be held for review"
      );
    }
    if (dryRun) {
      return result("pending_review", "Would hold for review: no allowed sender domains are set");
    }
    return holdForReview(
      supabase,
      deps,
      { ...meta, schoolId, divisionIds: route.divisionIds },
      result
    );
  }

  if (dryRun) {
    if (!meta.messageId) {
      return result("accepted", "Would ingest (no message id, so no duplicate check)", {
        duplicate: false,
      });
    }
    const { data: holder } = await supabase
      .from("email_ingestions")
      .select("id, status, created_at, document_ids")
      .eq("school_id", schoolId)
      .eq("message_id", meta.messageId)
      .in("status", ["processing", "accepted", "pending_review"])
      .maybeSingle();
    if (!holder || (holder.status === "processing" && isStaleClaim(holder.created_at))) {
      return result("accepted", "Would ingest", { duplicate: false });
    }
    return holder.status === "accepted"
      ? result("duplicate", "Already ingested", {
          duplicate: true,
          ingestionId: holder.id,
          documentIds: holder.document_ids ?? [],
        })
      : result("in_progress", `Message is ${holder.status}`, {
          duplicate: true,
          ingestionId: holder.id,
        });
  }

  // 3. Idempotency: claim the message so retries and concurrent deliveries
  // of the same email can't ingest it twice. Without a message id there is
  // nothing to key on, so the attempt is only logged when it finishes.
  let claimId: string | null = null;
  if (meta.messageId) {
    const claim = await claimMessage(supabase, schoolId, {
      ...meta,
      messageId: meta.messageId,
      reason: "Ingesting" + suffix,
    });
    if ("skip" in claim) {
      const skipped = { ingestionId: claim.holderId ?? null };
      // One email can reach two division addresses as separate deliveries
      // with the same message id (each mailing list forwards its own copy).
      // The later copy adds its divisions to what the first one ingested.
      if (route.divisionIds.length && claim.skip === "duplicate") {
        try {
          await deps.addDivisions(claim.documentIds, route.divisionIds);
        } catch (err) {
          console.error("[inbound-email] Adding divisions to a duplicate failed:", err);
          return result("error", "Adding divisions to a duplicate failed", {
            httpStatus: 500,
            error: "Retry later",
          });
        }
      } else if (route.divisionIds.length) {
        // The first copy is still ingesting. Fail this one so Resend retries
        // it after that finishes, when it can add its divisions.
        return result(claim.skip, "Already being ingested", { httpStatus: 409, ...skipped });
      }
      return claim.skip === "duplicate"
        ? result("duplicate", "Already ingested", {
            ...skipped,
            documentIds: claim.documentIds,
          })
        : result("in_progress", "Already being ingested", skipped);
    }
    claimId = claim.claimId;
  }

  const finish = async (
    status: "accepted" | "error",
    reason: string,
    ids: string[] = []
  ): Promise<string | null> => {
    if (!claimId) return (await record(status, reason, ids)).ingestionId;
    const { error } = await supabase
      .from("email_ingestions")
      .update({ status, reason: reason + suffix, document_ids: ids })
      .eq("id", claimId);
    if (error) {
      console.error(`[inbound-email] Failed to settle claim ${claimId}:`, error.message);
    }
    return claimId;
  };

  // 4. Load content + attachments, ingest, tag divisions and kick off
  // processing. Partial ingests are undone inside ingestReceivedEmail.
  try {
    const documentIds = await deps.ingest({
      schoolId,
      loadContent: params.loadContent,
      subject: meta.subject,
      fromAddress,
      divisionIds: route.divisionIds,
      origin: params.origin,
      suppressPush: params.suppressPush ?? false,
    });

    if (!documentIds.length) {
      const ingestionId = await finish("error", "No ingestible content found");
      return result("empty", "No ingestible content found" + suffix, { ingestionId });
    }

    const ingestionId = await finish("accepted", "Ingested", documentIds);
    return result("accepted", "Ingested" + suffix, { documentIds, ingestionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[inbound-email] Ingestion failed:", message);
    // Release the claim (status 'error') so a retry is allowed through.
    const ingestionId = await finish("error", message);
    // 500 so Resend retries transient failures.
    return result("error", message + suffix, { httpStatus: 500, error: message, ingestionId });
  }
}

/**
 * Claim a message before creating any documents by inserting its 'processing'
 * row; 027's partial unique index lets only one processing/accepted row exist
 * per message. Returns the claim row id, or why the message must be skipped.
 * A claim older than STALE_CLAIM_MS belonged to an attempt that died, so it is
 * cleared and taken over once.
 */
async function claimMessage(
  supabase: Db,
  schoolId: string,
  data: InboundMeta & { messageId: string; reason: string }
): Promise<
  | { claimId: string }
  | { skip: "duplicate"; documentIds: string[]; holderId?: string }
  | { skip: "in_progress"; holderId?: string }
> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: row, error } = await supabase
      .from("email_ingestions")
      .insert({
        school_id: schoolId,
        email_id: data.emailId,
        message_id: data.messageId,
        from_address: data.from,
        subject: data.subject,
        status: "processing",
        reason: data.reason,
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
      .eq("message_id", data.messageId)
      .in("status", ["processing", "accepted"])
      .maybeSingle();

    if (!holder) continue; // released between our insert and this read
    if (holder.status === "accepted") {
      return { skip: "duplicate", documentIds: holder.document_ids ?? [], holderId: holder.id };
    }
    if (!isStaleClaim(holder.created_at)) return { skip: "in_progress", holderId: holder.id };

    await supabase
      .from("email_ingestions")
      .update({ status: "error", reason: "Timed out; claim taken over by a retry" })
      .eq("id", holder.id)
      .eq("status", "processing");
  }

  return { skip: "in_progress" };
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
  supabase: Db,
  deps: ProcessInboundDeps,
  data: InboundMeta & { schoolId: string; divisionIds: string[] },
  result: (
    status: InboundOutcomeStatus,
    reason: string,
    extra?: Partial<ProcessInboundResult>
  ) => ProcessInboundResult
): Promise<ProcessInboundResult> {
  const { schoolId, divisionIds } = data;
  const reason = "Held for review: no allowed sender domains are set";

  const { data: row, error } = await supabase
    .from("email_ingestions")
    .insert({
      school_id: schoolId,
      email_id: data.emailId,
      message_id: data.messageId,
      from_address: data.from,
      subject: data.subject,
      status: "pending_review" as const,
      reason,
      division_ids: divisionIds,
    })
    .select("id")
    .single();
  if (!error) return result("pending_review", reason, { ingestionId: row?.id ?? null });
  if (error.code !== "23505" || !data.messageId) {
    console.error("[inbound-email] Could not hold message for review:", error.message);
    return result("error", "Could not hold message", {
      httpStatus: 500,
      error: "Could not hold message",
    });
  }

  const { data: holder } = await supabase
    .from("email_ingestions")
    .select("id, status, division_ids, document_ids")
    .eq("school_id", schoolId)
    .eq("message_id", data.messageId)
    .in("status", ["pending_review", "processing", "accepted"])
    .maybeSingle();

  if (!holder) {
    // Released between our insert and this read; let Resend retry.
    return result("in_progress", "Retry later", { httpStatus: 409, error: "Retry later" });
  }

  if (holder.status === "pending_review") {
    const merged = [...new Set([...(holder.division_ids ?? []), ...divisionIds])];
    await supabase
      .from("email_ingestions")
      .update({ division_ids: merged })
      .eq("id", holder.id)
      .eq("status", "pending_review");
    return result("pending_review", reason, { ingestionId: holder.id });
  }

  if (holder.status === "accepted") {
    try {
      await deps.addDivisions(holder.document_ids ?? [], divisionIds);
    } catch (err) {
      console.error("[inbound-email] Adding divisions to a duplicate failed:", err);
      return result("error", "Adding divisions to a duplicate failed", {
        httpStatus: 500,
        error: "Retry later",
      });
    }
    return result("duplicate", "Already ingested", { ingestionId: holder.id });
  }

  // Being ingested right now (an admin just approved it). Retry later so
  // this copy's divisions land on the finished documents.
  return result("in_progress", "Already being ingested", {
    httpStatus: divisionIds.length ? 409 : 200,
    ingestionId: holder.id,
  });
}
