import { truncateBody, type PushMessage } from "./messages";

// Pure pieces of the "new documents" push: which documents qualify, when a
// school's batch is due, and what the notification says. The database side is
// in document-push-runner.ts; the cron is app/api/cron/send-document-pushes.

/** At most one new-document push per school in this many hours. */
export const MIN_INTERVAL_HOURS = 3;

/** A batch waits until its oldest document has been ready this long, so a bulk upload goes out as one push. */
export const SETTLE_MINUTES = 10;

/** Only documents created this recently are queued when processing finishes (guards re-processing old ones). */
export const ENQUEUE_MAX_AGE_HOURS = 24;

/** Wider window for a held document an admin approves: it may have waited days for review. */
export const APPROVAL_MAX_AGE_DAYS = 7;

/** Website pages are synced in bulk and change often; only these sources notify. */
export const NOTIFYING_SOURCES: readonly string[] = ["upload", "email"];

const HOUR_MS = 60 * 60 * 1000;
export const ENQUEUE_MAX_AGE_MS = ENQUEUE_MAX_AGE_HOURS * HOUR_MS;
export const APPROVAL_MAX_AGE_MS = APPROVAL_MAX_AGE_DAYS * 24 * HOUR_MS;

/** document_push_queue.outcome values; must match the check in migration 042. */
export const OUTCOMES = {
  sent: "sent",
  skippedDisabled: "skipped_disabled",
  skippedNotReady: "skipped_not_ready",
  skippedNotConfigured: "skipped_not_configured",
  skippedNoRecipients: "skipped_no_recipients",
  failed: "failed",
} as const;

export type DocumentPushOutcome = (typeof OUTCOMES)[keyof typeof OUTCOMES];

export interface QueueableDocument {
  source: string | null;
  status: string | null;
  created_at: string;
}

/** Whether a document that just became visible to parents should be queued for a push. */
export function isQueueable(doc: QueueableDocument, now: Date, maxAgeMs: number): boolean {
  if (doc.status !== "ready") return false;
  if (!NOTIFYING_SOURCES.includes(doc.source ?? "upload")) return false;

  const created = Date.parse(doc.created_at);
  if (Number.isNaN(created)) return false;
  return now.getTime() - created <= maxAgeMs;
}

export type BatchDecision =
  | { send: true }
  | { send: false; reason: "empty" | "settling" | "rate_limited" };

/**
 * Whether a school's pending documents should go out now. Rows left pending
 * are picked up by a later run and sent together.
 */
export function shouldSend(
  pendingRows: ReadonlyArray<{ queued_at: string }>,
  lastSentAt: string | null,
  now: Date
): BatchDecision {
  if (pendingRows.length === 0) return { send: false, reason: "empty" };

  const oldest = Math.min(...pendingRows.map((row) => Date.parse(row.queued_at)));
  if (now.getTime() - oldest < SETTLE_MINUTES * 60 * 1000) {
    return { send: false, reason: "settling" };
  }

  if (lastSentAt) {
    const last = Date.parse(lastSentAt);
    if (!Number.isNaN(last) && now.getTime() - last < MIN_INTERVAL_HOURS * HOUR_MS) {
      return { send: false, reason: "rate_limited" };
    }
  }

  return { send: true };
}

/** Where a tap on the notification lands: the school's chat. */
export function documentPushPath(schoolSlug: string): string {
  return `/s/${encodeURIComponent(schoolSlug)}/parent/chat`;
}

// Keeps the multi-document body to about two lines on a lock screen.
const MAX_LIST_BODY = 110;

/**
 * The notification for a school's batch. Same for every parent: nothing
 * parent-specific ever goes in the payload.
 */
export function buildDocumentPushMessage(params: {
  /** Display name, or null when the school has none (see resolveSchoolName). */
  schoolName: string | null;
  schoolSlug: string;
  /** Titles of the batch's documents, oldest first. */
  titles: string[];
}): PushMessage {
  const school = params.schoolName?.trim() || null;
  const titles = params.titles.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  const count = Math.max(params.titles.length, 1);
  const url = documentPushPath(params.schoolSlug);

  if (count === 1) {
    return {
      title: school ? `New from ${school}` : "New school document",
      body: truncateBody(titles[0] ?? "A new document was added."),
      url,
    };
  }

  const summary = `${count} new documents from ${school ?? "your school"}`;
  return {
    title: school ?? "New school documents",
    body: truncateBody(withTitles(summary, titles, count)),
    url,
  };
}

/** "3 new documents from X: A, B and 1 more" when it fits, else just the summary. */
function withTitles(summary: string, titles: string[], count: number): string {
  for (const listed of [2, 1]) {
    const shown = titles.slice(0, listed);
    if (shown.length === 0) continue;
    const rest = count - shown.length;
    const list =
      rest > 0
        ? `${shown.join(", ")} and ${rest} more`
        : shown.length === 2
          ? `${shown[0]} and ${shown[1]}`
          : shown[0];
    const body = `${summary}: ${list}`;
    if (body.length <= MAX_LIST_BODY) return body;
  }
  return summary;
}
