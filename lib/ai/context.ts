import { createAdminClient } from "@/lib/supabase/admin";
import { formatGrade } from "@/lib/grades";

// Upper bound on how many calendar events we inject into a single prompt. The
// model scans the whole school calendar, but we cap to keep the prompt bounded;
// a school realistically stays well under this. Truncation is logged, never silent.
const MAX_CALENDAR_EVENTS = 500;

export interface EventContext {
  id: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: string;
}

export interface AnnouncementContext {
  id: string;
  title: string;
  content: string;
  priority: string;
  pinned: boolean;
  created_at: string;
}

/**
 * Fetch the entire school calendar (all events, ordered by date) so the
 * assistant can answer about any event — past or future — not just a rolling
 * window. Capped at MAX_CALENDAR_EVENTS as a safety bound; truncation is logged.
 */
export async function fetchEventsForContext(
  schoolId: string
): Promise<EventContext[]> {
  const supabase = createAdminClient();

  // Fetch newest-first so that if a school ever exceeds the cap we keep all
  // upcoming + recent events and drop only ancient history — then present the
  // calendar chronologically (ascending) for the prompt.
  const { data, error, count } = await supabase
    .from("events")
    .select(
      "id, title, description, date, start_time, end_time, location, event_type",
      { count: "exact" }
    )
    .eq("school_id", schoolId)
    .order("date", { ascending: false })
    .limit(MAX_CALENDAR_EVENTS);

  if (error) {
    console.error("Failed to fetch events for AI context:", error);
    return [];
  }

  if (typeof count === "number" && count > MAX_CALENDAR_EVENTS) {
    console.warn(
      `[Calendar] School ${schoolId} has ${count} events; capped context to the most recent ${MAX_CALENDAR_EVENTS} (oldest history dropped).`
    );
  }

  return (data || []).slice().reverse();
}

/**
 * Fetch active published, non-expired announcements (max 20).
 */
export async function fetchAnnouncementsForContext(
  schoolId: string
): Promise<AnnouncementContext[]> {
  const supabase = createAdminClient();

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, content, priority, pinned, created_at")
    .eq("school_id", schoolId)
    .eq("status", "published")
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Failed to fetch announcements for AI context:", error);
    return [];
  }

  return data || [];
}

/**
 * A calendar entry as the assistant sees it: one logical event, which may span
 * several consecutive days. The `events` table stores one row per day, so a
 * two-week recess arrives as ~10 rows — see groupEventOccurrences.
 */
export interface CalendarEntry {
  id: string; // first occurrence's event id
  title: string;
  description: string | null;
  date: string; // first day (YYYY-MM-DD)
  date_end: string | null; // last day, when the entry spans more than one day
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: string;
}

const MS_PER_DAY = 86_400_000;

/** Parse a YYYY-MM-DD calendar date as UTC midnight (no local-timezone drift). */
function parseCalendarDate(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/**
 * True when `next` continues the run that ends at `prev`: the same day, the
 * following day, or the next school day across a weekend (Fri → Mon). Multi-day
 * school events are routinely imported as weekday-only rows, so the weekend gap
 * must not split the run.
 */
function continuesRun(prev: string, next: string): boolean {
  const prevMs = parseCalendarDate(prev);
  const nextMs = parseCalendarDate(next);
  if (Number.isNaN(prevMs) || Number.isNaN(nextMs)) return false;

  const gapDays = (nextMs - prevMs) / MS_PER_DAY;
  if (gapDays < 0 || gapDays > 3) return false;
  if (gapDays <= 1) return true;

  // Bridge the gap only if every skipped day is a weekend day.
  for (let d = 1; d < gapDays; d++) {
    const day = new Date(prevMs + d * MS_PER_DAY).getUTCDay();
    if (day !== 0 && day !== 6) return false;
  }
  return true;
}

/** Occurrences of the same logical event share title, time, place, and type. */
function occurrenceKey(e: EventContext): string {
  return [
    e.title.trim().toLowerCase(),
    e.start_time ?? "",
    e.end_time ?? "",
    (e.location ?? "").trim().toLowerCase(),
    e.event_type,
  ].join("|");
}

/**
 * Collapse runs of consecutive same-event rows into single date-ranged entries.
 *
 * Without this, a 10-school-day recess becomes 10 separately numbered sources
 * and the model dutifully cites all ten — one sentence trailing a wall of
 * identical citation chips. Grouping must happen before numbering so the prompt
 * labels and the returned source cards stay aligned.
 *
 * Input is expected in ascending date order (as fetchEventsForContext returns).
 */
export function groupEventOccurrences(events: EventContext[]): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  // Last entry produced for each occurrence key, so a run can be extended even
  // when unrelated events sit between its days in the date-ordered list.
  const openRuns = new Map<string, { entry: CalendarEntry; lastDate: string }>();
  const descriptions = new Map<CalendarEntry, Set<string>>();

  for (const event of events) {
    const key = occurrenceKey(event);
    const open = openRuns.get(key);

    if (open && continuesRun(open.lastDate, event.date)) {
      if (event.date !== open.entry.date) open.entry.date_end = event.date;
      if (event.description) descriptions.get(open.entry)?.add(event.description);
      openRuns.set(key, { entry: open.entry, lastDate: event.date });
      continue;
    }

    const entry: CalendarEntry = {
      id: event.id,
      title: event.title,
      description: event.description,
      date: event.date,
      date_end: null,
      start_time: event.start_time,
      end_time: event.end_time,
      location: event.location,
      event_type: event.event_type,
    };
    entries.push(entry);
    descriptions.set(entry, new Set(event.description ? [event.description] : []));
    openRuns.set(key, { entry, lastDate: event.date });
  }

  // Merged occurrences may carry differing descriptions — keep them all rather
  // than silently dropping detail from later days of the run.
  return entries.map((entry) => {
    const texts = [...(descriptions.get(entry) ?? [])];
    return { ...entry, description: texts.length > 0 ? texts.join(" ") : null };
  });
}

/**
 * Human-readable one-line summary of a calendar entry (without any source
 * number). Shared by the prompt block and the citable source card so they
 * stay in sync.
 */
function formatEventLine(e: CalendarEntry): string {
  const isRange = !!e.date_end && e.date_end !== e.date;
  const parts = [
    isRange
      ? `"${e.title}" from ${e.date} through ${e.date_end}`
      : `"${e.title}" on ${e.date}`,
  ];
  if (e.start_time) {
    parts.push(isRange ? `each day from ${e.start_time}` : `from ${e.start_time}`);
    if (e.end_time) parts.push(`to ${e.end_time}`);
  }
  if (e.location) parts.push(`at ${e.location}`);
  parts.push(`(${e.event_type})`);
  if (e.description) parts.push(`— ${e.description}`);
  return parts.join(" ");
}

/**
 * Format events as a text block for the system prompt.
 *
 * Calendar entries are deliberately NOT numbered as sources: the calendar is
 * the school's own record, and numbering it turned a single answer about, say,
 * winter break into a stack of near-identical "[16] Winter Break" citation
 * chips. The model reads the calendar and answers from it directly; only
 * documents carry [N] citations.
 */
export function formatEventsContext(events: CalendarEntry[]): string {
  if (events.length === 0) return "";

  const lines = events.map((e) => `- ${formatEventLine(e)}`);

  return `SCHOOL EVENTS (full calendar — authoritative, but NOT a citable source: never attach [N] to a fact taken from here):\n${lines.join(
    "\n"
  )}`;
}

/**
 * Format announcements as a concise text block for the system prompt.
 */
export function formatAnnouncementsContext(
  announcements: AnnouncementContext[]
): string {
  if (announcements.length === 0) return "";

  const lines = announcements.map((a) => {
    const tags: string[] = [];
    if (a.pinned) tags.push("PINNED");
    if (a.priority !== "normal") tags.push(a.priority.toUpperCase());
    const prefix = tags.length > 0 ? `[${tags.join(", ")}] ` : "";
    const content =
      a.content.length > 500 ? a.content.slice(0, 500) + "..." : a.content;
    return `- ${prefix}"${a.title}": ${content}`;
  });

  return `SCHOOL ANNOUNCEMENTS (active):\n${lines.join("\n")}`;
}

export interface ChildContext {
  name: string;
  grade: string;
}

/**
 * Fetch parent's children (name + grade) for context.
 */
export async function fetchChildrenForContext(
  userId: string,
  schoolId: string
): Promise<ChildContext[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("children")
    .select("name, grade")
    .eq("parent_id", userId)
    .eq("school_id", schoolId);

  if (error) {
    console.error("Failed to fetch children for AI context:", error);
    return [];
  }

  return data || [];
}

/**
 * Format children as a text block for the system prompt.
 *
 * Grades are spelled out ("8th Grade", never "8") and labelled as grade levels.
 * The raw stored value is a bare number, and "Lucas (8)" reads to a model as an
 * eight-year-old — which then skews every answer about divisions, deadlines,
 * and age-appropriate policies.
 */
export function formatChildrenContext(children: ChildContext[]): string {
  if (children.length === 0) return "";

  // Numbered so the model tracks them as distinct people rather than blurring
  // two children into one when it answers.
  const lines = children.map(
    (c, i) => `${i + 1}. ${c.name} — enrolled in ${formatGrade(c.grade)}`
  );
  const count =
    children.length === 1 ? "1 child" : `${children.length} children`;
  // The gender warning sits here, beside the names, as well as in the rules —
  // models otherwise guess from the name and address a child as "he"/"she".
  return `PARENT'S CHILDREN (${count}; school grade levels, NOT ages — never state or infer a child's age from these). The school record has no gender for these children: refer to each one by name or as "they", never "he"/"she"/"son"/"daughter", even if the parent used such a word:\n${lines.join(
    "\n"
  )}`;
}

/**
 * Formatted current date for temporal reasoning in the prompt.
 */
export function getTodayString(): string {
  const now = new Date();
  return `Today's date is ${now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })}.`;
}
