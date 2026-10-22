import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyRedactions,
  compileRedactions,
  emailBodyText,
  isIngestibleAttachment,
  parseRawEmail,
  type Redaction,
} from "@/lib/email/inbound-content";
import {
  processInboundEmail,
  type ProcessInboundDeps,
  type ProcessInboundResult,
} from "@/lib/email/process-inbound";
import {
  findForbiddenTokens,
  recipientAddresses,
  sanitizeInboundContent,
} from "@/lib/email/sanitize-inbound";
import {
  ensureDocumentFolder,
  isProcessed,
  waitForProcessing,
  type ProcessedState,
} from "@/lib/email/post-process";

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
//   - a Message-ID header is required (the claim key);
//   - by default the content is also checked against the school's library
//     (contentDedupe), the body is sanitized for having been read from a
//     recipient's mailbox (sanitize), and the request waits for processing
//     and makes sure each new document is in a folder (ensureFolder), so the
//     caller can confirm the result from the response alone;
//   - documents are processed in this process (processDocument), awaited,
//     rather than through /api/process-document.
//
// forbiddenTokens: a message whose stored content would contain any of them
// is refused with 422 { status: "rejected_personal" } and nothing is written,
// not even an email_ingestions row: the row's subject and sender would put
// the personal mail in the school's admin log, which is what the check is
// there to prevent. The caller records the refusal on its side.

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
  /**
   * Default true: strip tracking pixels, per-recipient tracked links (their
   * words kept), unsubscribe/view-online lines and the recipients' addresses;
   * save no To/Cc.
   */
  sanitize?: boolean;
  /** Case-insensitive words that must not be stored; any hit refuses the message (422). */
  forbiddenTokens?: string[];
  /**
   * Default true: skip content the school's library already has
   * (lib/email/content-dedupe.ts; the webhook runs the same check).
   */
  contentDedupe?: boolean;
  /**
   * Default true: wait for processing, then file each new document into an
   * existing folder (never Website/Responses) if auto-sort left it unfiled.
   */
  ensureFolder?: boolean;
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

/**
 * How long ingestion may wait for processing, from the start of the request.
 * The route's maxDuration is 300 s; the rest is left for folder sorting.
 */
const PROCESSING_BUDGET_MS = 230_000;

export interface ManualInboundDeps {
  process: typeof processInboundEmail;
  processDeps?: ProcessInboundDeps;
  folders: (documentIds: string[]) => Promise<DocumentFolder[]>;
  /** Final processing state and folder of each new document (ensureFolder). */
  finalize?: (documentIds: string[], deadline: number) => Promise<DocumentFolder[]>;
}

const defaultDeps: ManualInboundDeps = {
  process: processInboundEmail,
  folders: lookupFolders,
  finalize: finalizeDocuments,
};

export async function handleManualInbound(
  request: Request,
  opts: { secret: string | undefined; origin: string },
  deps: ManualInboundDeps = defaultDeps
): Promise<ManualResponse> {
  const started = Date.now();
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
  if (
    input.forbiddenTokens !== undefined &&
    (!Array.isArray(input.forbiddenTokens) ||
      input.forbiddenTokens.some((t) => typeof t !== "string"))
  ) {
    return badRequest("forbiddenTokens must be an array of strings");
  }
  for (const flag of ["dryRun", "suppressPush", "sanitize", "contentDedupe", "ensureFolder"] as const) {
    if (input[flag] !== undefined && typeof input[flag] !== "boolean") {
      return badRequest(`${flag} must be a boolean`);
    }
  }
  const sanitize = input.sanitize !== false;
  const ensureFolder = input.ensureFolder !== false;

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

  const cleaned = sanitize
    ? sanitizeInboundContent(
        parsed.content,
        recipientAddresses(parsed.content, parsed.deliveredTo)
      )
    : parsed.content;
  const content = applyRedactions(cleaned, compiled.rules);
  const dryRun = input.dryRun === true;

  // Checked on exactly what would be stored, before anything is written.
  const forbidden = findForbiddenTokens(content, input.forbiddenTokens ?? []);
  if (forbidden.length) {
    return {
      status: 422,
      body: {
        status: "rejected_personal",
        reason: `Message contains forbidden tokens: ${forbidden.join(", ")}`,
        tokens: forbidden,
        message_id: parsed.messageId,
        dryRun,
      },
    };
  }

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
        contentDedupe: input.contentDedupe !== false,
        processingDeadline: ensureFolder ? started + PROCESSING_BUDGET_MS : undefined,
        // Here, not over HTTP: the intake box has no PROCESS_DOCUMENT_SECRET.
        processInline: true,
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
    const bodyText = emailBodyText(content);
    return {
      status: 200,
      body: {
        status: "dry_run",
        outcome: outcome.status,
        reason: outcome.reason,
        gate: outcome.gate ?? null,
        duplicate: outcome.duplicate ?? false,
        contentDuplicates: outcome.contentDuplicates ?? [],
        documentIds: outcome.documentIds,
        ingestionId: outcome.ingestionId,
        schoolId: outcome.schoolId,
        divisionIds: outcome.divisionIds,
        from: parsed.from,
        subject: parsed.subject,
        message_id: parsed.messageId,
        sanitized: sanitize,
        text_preview: bodyText.slice(0, PREVIEW_CHARS),
        attachments: content.attachments.map((att) => ({
          filename: att.filename || "attachment",
          contentType: att.contentType,
          disposition: att.disposition,
          // Mirrors ingestReceivedEmail's filters.
          ingest: isIngestibleAttachment(att),
        })),
      },
    };
  }

  const body: Record<string, unknown> = {
    status: outcome.status,
    documentIds: outcome.documentIds,
    ingestionId: outcome.ingestionId,
    reason: outcome.reason,
  };
  if (outcome.contentDuplicates?.length) body.contentDuplicates = outcome.contentDuplicates;
  if (outcome.status === "accepted" && outcome.documentIds.length) {
    const folders =
      ensureFolder && deps.finalize
        ? await deps.finalize(outcome.documentIds, started + PROCESSING_BUDGET_MS)
        : await deps.folders(outcome.documentIds);
    body.folders = folders;
    if (ensureFolder) body.ready = folders.every((f) => f.status === "ready" && (f.chunks ?? 0) > 0);
  } else if (outcome.status === "duplicate" && outcome.documentIds.length) {
    // The documents it duplicates, as they are (never re-filed from here).
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
  /** With ensureFolder: the processing outcome. */
  status?: string;
  chunks?: number;
  /** Why it was left unfiled, or why it isn't ready. */
  note?: string;
}

/**
 * Where each new document ended up: wait for processing to settle, then make
 * sure every ready document is in a folder. Never throws.
 */
async function finalizeDocuments(
  documentIds: string[],
  deadline: number
): Promise<DocumentFolder[]> {
  let states: ProcessedState[];
  try {
    states = await waitForProcessing(documentIds, deadline);
  } catch (err) {
    console.warn("[inbound-email/manual] Status check failed:", err);
    const folders = await lookupFolders(documentIds);
    return folders.map((f) => ({ ...f, status: "unknown", chunks: 0, note: "status check failed" }));
  }
  return Promise.all(
    states.map(async (state): Promise<DocumentFolder> => {
      const base = { documentId: state.documentId, status: state.status, chunks: state.chunks };
      if (!isProcessed(state)) {
        const [found] = await lookupFolders([state.documentId]);
        return {
          ...found,
          ...base,
          note:
            state.status === "processing"
              ? "still processing; folder not checked yet"
              : `not ready: ${state.error ?? state.status}`,
        };
      }
      const { folderId, folder, note } = await ensureDocumentFolder(state.documentId);
      return { ...base, folderId, folder, ...(note ? { note } : {}) };
    })
  );
}

/**
 * The library folder each new document was sorted into. Processing was
 * awaited in-process, so auto-sort has usually finished by now; a document
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
