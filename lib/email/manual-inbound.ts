import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBlockedFile } from "@/lib/documents/file-types";
import { htmlToText } from "@/lib/email/ingest-message";
import {
  applyRedactions,
  compileRedactions,
  parseRawEmail,
  type Redaction,
} from "@/lib/email/inbound-content";
import {
  processInboundEmail,
  type ProcessInboundDeps,
  type ProcessInboundResult,
} from "@/lib/email/process-inbound";

// Manual submissions: a raw RFC822 message (e.g. read from a parent's Gmail by
// a scheduled job) run through the same pipeline as the Resend webhook, so it
// is routed, gated, de-duplicated, ingested and logged exactly like mail that
// reached the inbound address. Nothing is sent or forwarded.
//
// Differences from the webhook, all because there is no Resend copy to fetch
// later:
//   - email_id is null on the logged rows;
//   - with no allowlist the message is rejected (rejected_domain), not held
//     for review: an admin's "Approve" re-fetches from Resend, which can't
//     work for manual mail;
//   - a Message-ID header is required, since it is the only duplicate key.

export interface ManualInboundBody {
  token: string;
  /** Base64 (or base64url, as Gmail's API returns it) RFC822 message. */
  raw: string;
  dryRun?: boolean;
  /** Default true: pre-mark the documents so parents get no push. */
  suppressPush?: boolean;
  /** Regex replacements applied to the text and HTML bodies before storage. */
  redactions?: Redaction[];
  /** Short label for the log, e.g. "gmail-intake". */
  source?: string;
}

export interface ManualResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Bearer-only CRON_SECRET check. Unlike the cron routes, `?key=` isn't
 * accepted: this endpoint creates documents, and query strings end up in logs.
 */
export function isBearerAuthorized(header: string | null, secret: string): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const presented = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  // timingSafeEqual throws on a length mismatch rather than returning false.
  if (presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(presented, expected);
}

const SOURCE_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/i;
const PREVIEW_CHARS = 300;

export interface ManualInboundDeps {
  process: typeof processInboundEmail;
  processDeps?: ProcessInboundDeps;
  folders: (documentIds: string[]) => Promise<DocumentFolder[]>;
}

const defaultDeps: ManualInboundDeps = {
  process: processInboundEmail,
  folders: lookupFolders,
};

export async function handleManualInbound(
  request: Request,
  opts: { secret: string | undefined; origin: string },
  deps: ManualInboundDeps = defaultDeps
): Promise<ManualResponse> {
  if (!opts.secret) {
    console.error("[inbound-email/manual] CRON_SECRET not set");
    return { status: 500, body: { error: "Server misconfigured" } };
  }
  if (!isBearerAuthorized(request.headers.get("authorization"), opts.secret)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  let input: ManualInboundBody;
  try {
    input = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  if (!input || typeof input !== "object") return badRequest("Invalid JSON");
  if (typeof input.token !== "string" || !input.token.trim()) {
    return badRequest("token is required");
  }
  if (typeof input.raw !== "string" || !input.raw.trim()) {
    return badRequest("raw (base64 RFC822) is required");
  }
  const source = input.source ?? "manual";
  if (typeof source !== "string" || !SOURCE_RE.test(source)) {
    return badRequest("source must be 1-40 letters, digits, '.', '_' or '-'");
  }
  if (input.redactions !== undefined && !Array.isArray(input.redactions)) {
    return badRequest("redactions must be an array");
  }
  const compiled = compileRedactions(input.redactions ?? []);
  if ("error" in compiled) return badRequest(compiled.error);

  const buffer = Buffer.from(input.raw.trim(), "base64");
  if (!buffer.length) return badRequest("raw is not valid base64");

  let parsed: Awaited<ReturnType<typeof parseRawEmail>>;
  try {
    parsed = await parseRawEmail(buffer);
  } catch (err) {
    return badRequest(
      `Could not parse message: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!parsed.messageId) {
    return badRequest("The message has no Message-ID header, so it can't be de-duplicated");
  }

  const content = applyRedactions(parsed.content, compiled.rules);
  const dryRun = input.dryRun === true;

  let outcome: ProcessInboundResult;
  try {
    outcome = await deps.process(
      {
        routing: { token: input.token },
        meta: {
          emailId: null,
          messageId: parsed.messageId,
          from: parsed.from,
          subject: parsed.subject,
        },
        loadContent: async () => content,
        origin: opts.origin,
        onReview: "reject",
        reasonSuffix: ` (manual: ${source})`,
        suppressPush: input.suppressPush !== false,
        dryRun,
      },
      deps.processDeps
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[inbound-email/manual] Processing failed:", message);
    return { status: 500, body: { status: "error", error: message } };
  }

  if (dryRun) {
    const bodyText = content.text?.trim() || (content.html ? htmlToText(content.html) : "");
    return {
      status: 200,
      body: {
        status: "dry_run",
        outcome: outcome.status,
        reason: outcome.reason,
        gate: outcome.gate ?? null,
        duplicate: outcome.duplicate ?? false,
        documentIds: outcome.documentIds,
        ingestionId: outcome.ingestionId,
        schoolId: outcome.schoolId,
        divisionIds: outcome.divisionIds,
        from: parsed.from,
        subject: parsed.subject,
        message_id: parsed.messageId,
        text_preview: bodyText.slice(0, PREVIEW_CHARS),
        attachments: content.attachments.map((att) => {
          const filename = att.filename || "attachment";
          return {
            filename,
            contentType: att.contentType,
            disposition: att.disposition,
            // Mirrors ingestReceivedEmail's filters.
            ingest:
              att.disposition !== "inline" && !isBlockedFile(filename),
          };
        }),
      },
    };
  }

  const body: Record<string, unknown> = {
    status: outcome.status,
    documentIds: outcome.documentIds,
    ingestionId: outcome.ingestionId,
    reason: outcome.reason,
  };
  if (outcome.status === "accepted" && outcome.documentIds.length) {
    body.folders = await deps.folders(outcome.documentIds);
  }
  return { status: outcome.httpStatus, body };
}

function badRequest(error: string): ManualResponse {
  return { status: 400, body: { error } };
}

export interface DocumentFolder {
  documentId: string;
  folderId: string | null;
  folder: string | null;
}

/**
 * The library folder each new document was sorted into. Processing runs
 * inline in production, so auto-sort has usually finished by now; a document
 * still processing reports no folder. Best-effort: never throws.
 */
async function lookupFolders(documentIds: string[]): Promise<DocumentFolder[]> {
  try {
    const supabase = createAdminClient();
    const { data: docs } = await supabase
      .from("documents")
      .select("id, folder_id")
      .in("id", documentIds);
    const folderIds = [
      ...new Set((docs ?? []).map((d) => d.folder_id).filter((id): id is string => !!id)),
    ];
    const { data: folders } = folderIds.length
      ? await supabase.from("folders").select("id, name").in("id", folderIds)
      : { data: [] as { id: string; name: string }[] };
    const names = new Map((folders ?? []).map((f) => [f.id, f.name as string]));
    return documentIds.map((id) => {
      const folderId = docs?.find((d) => d.id === id)?.folder_id ?? null;
      return { documentId: id, folderId, folder: folderId ? names.get(folderId) ?? null : null };
    });
  } catch (err) {
    console.warn("[inbound-email/manual] Folder lookup failed:", err);
    return documentIds.map((id) => ({ documentId: id, folderId: null, folder: null }));
  }
}
