import { createAdminClient } from "@/lib/supabase/admin";

// Copies staging rows into public.events.
//
// public.events stores one row per day with a local date and time, which is
// exactly the shape blackbaud_events already holds — so publishing is a copy,
// with the only real work being expanding a multi-day span into its days.

// A span longer than this is a bad upstream end date rather than a real event,
// and expanding it would insert a row per day for years.
const MAX_SPAN_DAYS = 60;

// Ids per query. A first sync can stage a whole school year, and a few
// hundred uuids is about as many as fit comfortably in one request URL.
const ID_CHUNK = 200;

export interface PublishResult {
  staged: number;
  eventsCreated: number;
}

interface StagedEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  all_day: boolean;
  local_date: string;
  local_end_date: string | null;
  local_start_time: string | null;
  local_end_time: string | null;
  suggested_event_type: string;
}

/** Inclusive list of ISO dates from start to end, capped. */
export function expandDays(start: string, end: string | null): string[] {
  if (!end || end <= start) return [start];

  const dates: string[] = [];
  // Parsed at UTC midnight and stepped in whole days, so a DST transition in
  // the school's zone cannot shift the sequence onto the wrong dates.
  const current = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);

  while (current <= last && dates.length < MAX_SPAN_DAYS) {
    dates.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Publish staged occurrences to the school calendar under the feed's label.
 *
 * Publishing an occurrence that was already published deletes its previous
 * rows first, so an upstream time change replaces the event rather than
 * leaving the old one beside it.
 */
export async function publishStagedEvents(
  schoolId: string,
  stagedIds: string[],
  labelId: string | null
): Promise<PublishResult> {
  const result: PublishResult = { staged: 0, eventsCreated: 0 };

  for (const ids of chunk(stagedIds, ID_CHUNK)) {
    const batch = await publishBatch(schoolId, ids, labelId);
    result.staged += batch.staged;
    result.eventsCreated += batch.eventsCreated;
  }

  return result;
}

async function publishBatch(
  schoolId: string,
  stagedIds: string[],
  labelId: string | null
): Promise<PublishResult> {
  const supabase = createAdminClient();

  const { data: stagedData, error: loadError } = await supabase
    .from("blackbaud_events")
    .select(
      "id, title, description, location, all_day, local_date, local_end_date, local_start_time, local_end_time, suggested_event_type"
    )
    .eq("school_id", schoolId)
    .in("id", stagedIds);

  if (loadError) {
    throw new Error(`Could not load staged events: ${loadError.message}`);
  }

  const staged = (stagedData ?? []) as StagedEvent[];
  if (staged.length === 0) return { staged: 0, eventsCreated: 0 };

  const ids = staged.map((row) => row.id);

  // Clear anything these occurrences published before, so a re-publish
  // replaces rather than duplicates.
  const { error: clearError } = await supabase
    .from("events")
    .delete()
    .in("blackbaud_event_id", ids);
  if (clearError) {
    throw new Error(`Could not replace synced events: ${clearError.message}`);
  }

  const rows = staged.flatMap((event) =>
    expandDays(event.local_date, event.local_end_date).map((date) => ({
      title: event.title,
      description: event.description,
      date,
      start_time: event.all_day ? null : event.local_start_time,
      end_time: event.all_day ? null : event.local_end_time,
      location: event.location,
      event_type: event.suggested_event_type,
      created_by: null,
      school_id: schoolId,
      source: "blackbaud",
      blackbaud_event_id: event.id,
      label_id: labelId,
    }))
  );

  const { error: insertError } = await supabase.from("events").insert(rows);
  if (insertError) {
    throw new Error(`Publishing events failed: ${insertError.message}`);
  }

  const { error: statusError } = await supabase
    .from("blackbaud_events")
    .update({ status: "approved", reviewed_by: null, reviewed_at: new Date().toISOString() })
    .in("id", ids);

  if (statusError) {
    throw new Error(`Could not mark events published: ${statusError.message}`);
  }

  return { staged: staged.length, eventsCreated: rows.length };
}

/** Take the published rows of these staged occurrences off the calendar. */
export async function unpublishStagedEvents(stagedIds: string[]): Promise<void> {
  const supabase = createAdminClient();

  for (const ids of chunk(stagedIds, ID_CHUNK)) {
    const { error } = await supabase.from("events").delete().in("blackbaud_event_id", ids);
    if (error) throw new Error(`Could not remove cancelled events: ${error.message}`);
  }
}
