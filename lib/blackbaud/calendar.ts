import { createAdminClient } from "@/lib/supabase/admin";
import { fetchFeedText } from "./safe-fetch";
import { parseFeed, type NormalizedEvent } from "./ical";
import { inferEventType } from "./tagging";
import { publishStagedEvents, unpublishStagedEvents } from "./publish";
import { matchOccurrences, type StagedOccurrence } from "./match";
import { selectAll } from "@/lib/supabase/select-all";

// Fetch -> parse -> stage -> publish. Every occurrence is staged in
// blackbaud_events (which is what lets a sync tell new, changed and cancelled
// events apart), then published straight onto the calendar under the feed's
// label. There is no review step: the label's iCal link is the source of truth.

// How far either side of today we keep occurrences. Back far enough that a
// mid-year connection still shows recent history, forward far enough to cover
// a published school year.
const WINDOW_BACK_DAYS = 30;
const WINDOW_FORWARD_DAYS = 400;

const UPSERT_CHUNK = 500;
const TOUCH_CHUNK = 200;

export interface FeedSyncResult {
  feedId: string;
  label: string;
  seen: number;
  created: number;
  updated: number;
  superseded: number;
  published: number;
}

interface FeedRow {
  id: string;
  school_id: string;
  label_id: string | null;
  label: string;
  url: string;
  timezone: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Sync one feed.
 *
 * Everything is fetched and parsed before any write, so a feed that fails
 * halfway leaves the calendar untouched rather than removing events whose
 * pages never arrived.
 */
export async function syncFeed(feed: FeedRow): Promise<FeedSyncResult> {
  const supabase = createAdminClient();
  const now = new Date();

  const windowStart = new Date(now.getTime() - WINDOW_BACK_DAYS * 86_400_000);
  const windowEnd = new Date(now.getTime() + WINDOW_FORWARD_DAYS * 86_400_000);

  const text = await fetchFeedText(feed.url);
  const parsed = parseFeed(text, {
    timezone: feed.timezone,
    windowStart,
    windowEnd,
  });

  let existing: StagedOccurrence[];
  try {
    existing = await selectAll<StagedOccurrence>((from, to) =>
      supabase
        .from("blackbaud_events")
        .select("id, title, occurrence_start, content_hash, status, last_seen_at")
        .eq("feed_id", feed.id)
        .order("id")
        .range(from, to)
    );
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "unknown error";
    throw new Error(`Could not load synced events: ${message}`);
  }

  // A feed that suddenly lists nothing is far more likely a broken link or an
  // upstream outage than a school cancelling its whole calendar. Refuse rather
  // than wipe every event off the parent calendar.
  if (parsed.length === 0 && existing.length > 0) {
    throw new Error(
      "The link returned no events, so nothing was changed. Check the link still works in Blackbaud."
    );
  }

  // Unchanged rows are only touched — an event an admin deleted from the
  // calendar stays deleted until it changes upstream. Changed rows are
  // rewritten in place (new UID included) and go back to pending.
  const match = matchOccurrences(parsed, existing);
  const syncedAt = now.toISOString();
  const unchanged = match.unchanged.map(({ staged }) => staged.id);

  const replacements = match.changed.map(({ parsed: event, staged }) => ({
    id: staged.id,
    ...buildRow(feed, event, syncedAt),
  }));
  const additions = match.added.map((event) => buildRow(feed, event, syncedAt));

  // Kept as two batches: PostgREST rejects a bulk write whose rows don't all
  // carry the same keys, and only replacements carry an id.
  for (const batch of chunk(replacements, UPSERT_CHUNK)) {
    const { error } = await supabase.from("blackbaud_events").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`Updating calendar events failed: ${error.message}`);
  }

  for (const batch of chunk(additions, UPSERT_CHUNK)) {
    const { error } = await supabase
      .from("blackbaud_events")
      .upsert(batch, { onConflict: "school_id,feed_id,external_uid,occurrence_start" });
    if (error) throw new Error(`Staging calendar events failed: ${error.message}`);
  }

  // Ids travel in the request URL, so these batches stay small. A failed touch
  // must stop the sync: supersedeMissing would read those rows as cancelled
  // and take live events off the calendar.
  for (const batch of chunk(unchanged, TOUCH_CHUNK)) {
    const { error } = await supabase
      .from("blackbaud_events")
      .update({ last_seen_at: syncedAt })
      .in("id", batch);

    if (error) {
      throw new Error(`Recording synced events failed: ${error.message}`);
    }
  }

  // Copies go before publishing, or pending copies would go live.
  const duplicates = await retireDuplicates(match.duplicates.map((row) => row.id));
  const superseded = await supersedeMissing(feed, syncedAt);
  const published = await publishPending(feed);

  await supabase
    .from("blackbaud_calendar_feeds")
    .update({
      last_synced_at: syncedAt,
      last_error: null,
      updated_at: syncedAt,
    })
    .eq("id", feed.id);

  return {
    feedId: feed.id,
    label: feed.label,
    seen: parsed.length,
    created: additions.length,
    updated: replacements.length,
    superseded: superseded + duplicates,
    published,
  };
}

/**
 * Publish every staged row of this feed that isn't on the calendar yet: what
 * this sync created or changed, plus anything left pending from before syncs
 * published directly.
 */
async function publishPending(feed: FeedRow): Promise<number> {
  const supabase = createAdminClient();

  const rows = await selectAll<{ id: string }>((from, to) =>
    supabase
      .from("blackbaud_events")
      .select("id")
      .eq("feed_id", feed.id)
      .eq("status", "pending")
      .order("id")
      .range(from, to)
  );

  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return 0;

  const result = await publishStagedEvents(feed.school_id, ids, feed.label_id);
  return result.staged;
}

function buildRow(
  feed: FeedRow,
  event: NormalizedEvent,
  syncedAt: string
): Record<string, unknown> {
  return {
    school_id: feed.school_id,
    feed_id: feed.id,
    external_uid: event.uid,
    occurrence_start: event.occurrenceStart.toISOString(),
    title: event.title,
    description: event.description,
    location: event.location,
    all_day: event.allDay,
    local_date: event.localDate,
    local_end_date: event.localEndDate,
    local_start_time: event.localStartTime,
    local_end_time: event.localEndTime,
    raw_categories: event.categories,
    suggested_event_type: inferEventType(event),
    suggested_category_id: null,
    tag_source: "none",
    tag_confidence: null,
    content_hash: event.contentHash,
    // New or changed upstream, so it goes back to pending and publishPending
    // (re)publishes it. Rows it published before stay linked through
    // events.blackbaud_event_id and are replaced, not duplicated.
    //
    // Every key here must be present on every row of the batch — PostgREST
    // rejects a bulk insert with ragged keys.
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    last_seen_at: syncedAt,
  };
}

/**
 * Retire staged copies of an occurrence the feed still lists, and take their
 * published rows off the calendar. Past dates included: unlike a vanished
 * event, a copy is never the real thing.
 */
async function retireDuplicates(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = createAdminClient();

  for (const batch of chunk(ids, TOUCH_CHUNK)) {
    const { error } = await supabase
      .from("blackbaud_events")
      .update({ status: "superseded" })
      .in("id", batch);
    if (error) throw new Error(`Could not retire duplicate events: ${error.message}`);
  }

  await unpublishStagedEvents(ids);
  return ids.length;
}

/**
 * Take occurrences that vanished from the feed off the calendar.
 *
 * Only forward-looking rows: an event dropping off the back of the window is
 * ordinary ageing, not a cancellation, so past events stay put.
 */
async function supersedeMissing(
  feed: FeedRow,
  syncedAt: string
): Promise<number> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // Ids first, then the update: a returned representation is row-capped like
  // any other response, and a missed id would leave its event published.
  const rows = await selectAll<{ id: string }>((from, to) =>
    supabase
      .from("blackbaud_events")
      .select("id")
      .eq("feed_id", feed.id)
      .in("status", ["pending", "approved"])
      .gte("local_date", today)
      .lt("last_seen_at", syncedAt)
      .order("id")
      .range(from, to)
  );
  const ids = rows.map((row) => row.id);

  for (const batch of chunk(ids, TOUCH_CHUNK)) {
    const { error } = await supabase
      .from("blackbaud_events")
      .update({ status: "superseded" })
      .in("id", batch);
    if (error) throw new Error(`Could not mark cancelled events: ${error.message}`);
  }

  await unpublishStagedEvents(ids);
  return ids.length;
}

export interface SchoolSyncSummary {
  results: FeedSyncResult[];
  failures: Array<{ feedId: string; label: string; error: string }>;
}

/** Sync every active feed for one school. */
export async function syncSchoolCalendars(
  schoolId: string
): Promise<SchoolSyncSummary> {
  const supabase = createAdminClient();

  const { data: feeds, error } = await supabase
    .from("blackbaud_calendar_feeds")
    .select("id, school_id, label_id, label, url, timezone")
    .eq("school_id", schoolId)
    .eq("is_active", true);

  if (error) throw new Error(`Could not load calendar feeds: ${error.message}`);

  const results: FeedSyncResult[] = [];
  const failures: SchoolSyncSummary["failures"] = [];

  // Sequential, and one failure never stops the rest: a school with a stale URL
  // on its Arts feed should still get tonight's Athletics events.
  for (const feed of (feeds ?? []) as FeedRow[]) {
    try {
      results.push(await syncFeed(feed));
    } catch (caught: unknown) {
      const message =
        caught instanceof Error ? caught.message : "Calendar sync failed";

      await supabase
        .from("blackbaud_calendar_feeds")
        .update({ last_error: message, updated_at: new Date().toISOString() })
        .eq("id", feed.id);

      failures.push({ feedId: feed.id, label: feed.label, error: message });
    }
  }

  return { results, failures };
}
