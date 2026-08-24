import { createAdminClient } from "@/lib/supabase/admin";

// Copies approved staging rows into public.events.
//
// public.events stores one row per day with a local date and time, which is
// exactly the shape blackbaud_events already holds — so publishing is a copy,
// with the only real work being expanding a multi-day span into its days.

// A span longer than this is a bad upstream end date rather than a real event,
// and expanding it would insert a row per day for years.
const MAX_SPAN_DAYS = 60;

export interface PublishResult {
  staged: number;
  eventsCreated: number;
  skipped: number;
}

interface StagedEvent {
  id: string;
  school_id: string;
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

/**
 * Publish staged occurrences to the school calendar.
 *
 * Re-approving an occurrence that was already published deletes its previous
 * rows first, so an upstream time change replaces the event rather than leaving
 * the old one beside it.
 */
export async function publishStagedEvents(
  schoolId: string,
  stagedIds: string[],
  userId: string
): Promise<PublishResult> {
  if (stagedIds.length === 0) {
    return { staged: 0, eventsCreated: 0, skipped: 0 };
  }

  const supabase = createAdminClient();

  const { data: stagedData, error: loadError } = await supabase
    .from("blackbaud_events")
    .select(
      "id, school_id, title, description, location, all_day, local_date, local_end_date, local_start_time, local_end_time, suggested_event_type"
    )
    .eq("school_id", schoolId)
    .in("id", stagedIds);

  if (loadError) {
    throw new Error(`Could not load staged events: ${loadError.message}`);
  }

  const staged = (stagedData ?? []) as StagedEvent[];
  if (staged.length === 0) {
    return { staged: 0, eventsCreated: 0, skipped: stagedIds.length };
  }

  const stagedIdSet = staged.map((row) => row.id);

  const { data: suggestionData } = await supabase
    .from("blackbaud_event_calendar_suggestions")
    .select("blackbaud_event_id, calendar_id")
    .in("blackbaud_event_id", stagedIdSet);

  const calendarsByStaged = new Map<string, string[]>();
  for (const row of suggestionData ?? []) {
    const key = row.blackbaud_event_id as string;
    calendarsByStaged.set(key, [
      ...(calendarsByStaged.get(key) ?? []),
      row.calendar_id as string,
    ]);
  }

  // Clear anything these occurrences published before, so re-approval replaces
  // rather than duplicates.
  await supabase.from("events").delete().in("blackbaud_event_id", stagedIdSet);

  const rows: Record<string, unknown>[] = [];
  const calendarIdsPerRow: string[][] = [];

  for (const event of staged) {
    const tags = calendarsByStaged.get(event.id) ?? [];

    for (const date of expandDays(event.local_date, event.local_end_date)) {
      rows.push({
        title: event.title,
        description: event.description,
        date,
        start_time: event.all_day ? null : event.local_start_time,
        end_time: event.all_day ? null : event.local_end_time,
        location: event.location,
        event_type: event.suggested_event_type,
        created_by: userId,
        school_id: schoolId,
        source: "blackbaud",
        blackbaud_event_id: event.id,
      });
      calendarIdsPerRow.push(tags);
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("events")
    .insert(rows)
    .select("id");

  if (insertError) {
    throw new Error(`Publishing events failed: ${insertError.message}`);
  }

  // insert().select() preserves input order, so inserted[i] pairs with
  // calendarIdsPerRow[i] — the same assumption actions/event-import.ts makes.
  const links = (inserted ?? []).flatMap((row, index) =>
    calendarIdsPerRow[index].map((calendar_id) => ({
      event_id: row.id as string,
      calendar_id,
    }))
  );

  if (links.length > 0) {
    const { error: linkError } = await supabase
      .from("event_calendar_links")
      .insert(links);

    if (linkError) {
      throw new Error(`Tagging published events failed: ${linkError.message}`);
    }
  }

  const { error: statusError } = await supabase
    .from("blackbaud_events")
    .update({
      status: "approved",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .in("id", stagedIdSet);

  if (statusError) {
    throw new Error(`Could not mark events approved: ${statusError.message}`);
  }

  return {
    staged: staged.length,
    eventsCreated: rows.length,
    skipped: stagedIds.length - staged.length,
  };
}

/**
 * Reject staged occurrences and remove anything they had published.
 *
 * A reject after an approve is how an admin undoes a mistake, so it has to take
 * the published rows with it.
 */
export async function rejectStagedEvents(
  schoolId: string,
  stagedIds: string[],
  userId: string
): Promise<{ rejected: number }> {
  if (stagedIds.length === 0) return { rejected: 0 };

  const supabase = createAdminClient();

  const { data: owned } = await supabase
    .from("blackbaud_events")
    .select("id")
    .eq("school_id", schoolId)
    .in("id", stagedIds);

  const ids = (owned ?? []).map((row) => row.id as string);
  if (ids.length === 0) return { rejected: 0 };

  await supabase.from("events").delete().in("blackbaud_event_id", ids);

  const { error } = await supabase
    .from("blackbaud_events")
    .update({
      status: "rejected",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (error) throw new Error(`Could not reject events: ${error.message}`);

  return { rejected: ids.length };
}
