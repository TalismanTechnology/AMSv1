import crypto from "node:crypto";

// Least retention for question analytics (analytics_events, event_type
// 'question'). A fresh event holds the parent's user_id and question text
// (metadata.question) so it can be given a generic topic label
// (lib/insights/topics.ts). Once it is QUESTION_TEXT_MINUTES old (well
// inside the chat's own 30-day retention, lib/chat/retention.ts — the parent
// keeps their chat; analytics don't keep the text) the purge cron labels it,
// then "scrubs" it:
// the text and anything linking it to a parent or chat is dropped, user_id is
// nulled, and a keyed hash of (school, user) is kept as metadata.asker so
// Analytics (lib/metrics) can still count DISTINCT askers for its k-anonymity threshold and
// active-parent total — without holding a parent id.
//
// If labeling keeps failing, an event is scrubbed unlabeled after
// SCRUB_MAX_AGE_HOURS, so question text never outlives that.

export const SCRUB_MAX_AGE_HOURS = 24;

/** Question events older than this are labeled, then scrubbed. */
export const QUESTION_TEXT_MINUTES = 30;

/** ISO timestamp before which question events are due for scrubbing. */
export function questionScrubCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - QUESTION_TEXT_MINUTES * 60 * 1000).toISOString();
}
const ASKER_HASH_HEX = 32;

/**
 * Key for asker hashes. A dedicated ANALYTICS_HASH_SECRET if set, else
 * CRON_SECRET. Rotating it splits distinct-asker counts across the change
 * (old and new hashes of one parent look like two people).
 */
export function askerHashSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.ANALYTICS_HASH_SECRET || env.CRON_SECRET || null;
}

/** HMAC-SHA256(school:user) under `secret`, truncated hex. Stable. */
export function hashAsker(schoolId: string, userId: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${schoolId}:${userId}`)
    .digest("hex")
    .slice(0, ASKER_HASH_HEX);
}

/**
 * The distinct-asker key for an event: the stored hash once scrubbed, the
 * same hash computed from user_id before that (so a parent counts once
 * either side of the scrub), or the raw id when no secret is configured.
 */
export function askerKey(
  event: { user_id: string | null; asker?: string | null },
  schoolId: string,
  secret: string | null
): string | null {
  if (event.asker) return event.asker;
  if (!event.user_id) return null;
  return secret ? hashAsker(schoolId, event.user_id, secret) : event.user_id;
}

// Only these metadata keys survive a scrub: flags and counts, no free text
// and nothing that leads back to a parent or a chat (session_id would).
const KEPT_KEYS = ["unanswered", "source_count", "source_document_ids"] as const;

export interface ScrubInput {
  metadata: Record<string, unknown> | null;
  /** hashAsker(...) of the event's user, or null if it had none. */
  asker: string | null;
  /** Whether that user was a parent of the school (for "active parents"). */
  askerIsParent: boolean;
  /**
   * Resolved answer flag for events logged before metadata.unanswered
   * existed (matched against unanswered_questions while the text was still
   * there). Ignored when the event already has the boolean.
   */
  unanswered?: boolean;
}

export function scrubQuestionMetadata({
  metadata,
  asker,
  askerIsParent,
  unanswered,
}: ScrubInput): Record<string, unknown> {
  const src = metadata ?? {};
  const out: Record<string, unknown> = {};
  for (const key of KEPT_KEYS) {
    if (key in src) out[key] = src[key];
  }
  if (typeof out.unanswered !== "boolean" && typeof unanswered === "boolean") {
    out.unanswered = unanswered;
  }
  if (Array.isArray(out.source_document_ids)) {
    out.source_document_ids = out.source_document_ids.filter((id) => typeof id === "string");
  }
  if (out.source_count !== undefined && typeof out.source_count !== "number") {
    delete out.source_count;
  }
  if (asker) out.asker = asker;
  out.asker_parent = askerIsParent;
  out.scrubbed = true;
  return out;
}

export function isScrubbed(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.scrubbed === true;
}

/**
 * Whether an unscrubbed event should be scrubbed now: once labeled, or when
 * it has hit the max age regardless (labeling failed or never reached it).
 */
export function shouldScrub(
  event: { created_at: string; labeled: boolean },
  now: Date = new Date()
): boolean {
  if (event.labeled) return true;
  return now.getTime() - Date.parse(event.created_at) >= SCRUB_MAX_AGE_HOURS * 60 * 60 * 1000;
}
