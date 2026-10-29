import type { ChatSource } from "@/lib/types";
import type { CalendarEntry } from "./context";

/**
 * Citation numbering as the parent sees it.
 *
 * The model cites sources by the number they carry in the prompt — every
 * document passage and every calendar entry gets one — so a raw answer reads
 * "[4] … [17] … [8]". Before display those are renumbered per answer: the
 * first source cited becomes [1], the next new one [2], and so on, and the
 * sources are renumbered to match so every marker still opens what the model
 * cited. Pure and idempotent, so it runs both when an answer is saved and
 * whenever one is rendered (streamed, or an older saved answer).
 */

// Inline [N] markers, with the space before them so a dropped one leaves none.
const MARKER_RE = /(\s?)\[(\d+)\]/g;

/** Source numbers in the order the answer first cites them. */
export function citedNumbersInOrder(content: string): number[] {
  const seen = new Set<number>();
  for (const m of content.matchAll(MARKER_RE)) seen.add(Number(m[2]));
  return [...seen];
}

export interface RenumberedAnswer {
  content: string;
  /** Every source, renumbered: cited ones 1..k in order of first citation, then the rest. */
  sources: ChatSource[];
}

/**
 * Renumber an answer's citations to 1, 2, 3… in order of first appearance.
 *
 * Sources the answer never cites keep their relative order after the cited
 * ones. A marker that resolves to no source is removed — it links nowhere.
 * Sources without a number pass through unchanged.
 */
export function renumberCitations(content: string, sources: ChatSource[] = []): RenumberedAnswer {
  const known = new Set(
    sources.map((s) => s.source_number).filter((n): n is number => n != null)
  );

  const remap = new Map<number, number>();
  for (const n of citedNumbersInOrder(content)) {
    if (known.has(n)) remap.set(n, remap.size + 1);
  }
  for (const s of sources) {
    if (s.source_number != null && !remap.has(s.source_number)) {
      remap.set(s.source_number, remap.size + 1);
    }
  }

  const renumbered = content.replace(MARKER_RE, (_, space: string, digits: string) => {
    const n = remap.get(Number(digits));
    return n == null ? "" : `${space}[${n}]`;
  });

  const renumberedSources = sources
    .map((s) =>
      s.source_number == null ? s : { ...s, source_number: remap.get(s.source_number)! }
    )
    .sort(
      (a, b) =>
        (a.source_number ?? Number.MAX_SAFE_INTEGER) - (b.source_number ?? Number.MAX_SAFE_INTEGER)
    );

  return { content: renumbered, sources: renumberedSources };
}

/**
 * The calendar sources an answer cites, in order of first citation. Calendar
 * entries are numbered in the prompt but only the cited ones reach the
 * parent — a school calendar can hold hundreds.
 */
export function citedEventSources(content: string, eventSources: ChatSource[]): ChatSource[] {
  const byNumber = new Map(eventSources.map((s) => [s.source_number, s]));
  return citedNumbersInOrder(content)
    .map((n) => byNumber.get(n))
    .filter((s): s is ChatSource => !!s);
}

// ─── Calendar entries as sources ─────────────────────────

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** A YYYY-MM-DD calendar date, formatted as that same day (no timezone drift). */
function formatDay(date: string, format: Intl.DateTimeFormat): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? date : format.format(ms);
}

/** "15:30:00" → "3:30 PM". */
export function formatClockTime(time: string): string {
  const [h, m = "00"] = time.split(":");
  const hour = Number.parseInt(h, 10);
  if (Number.isNaN(hour)) return time;
  return `${hour % 12 || 12}:${m.padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

/**
 * The date (and time, unless it's all-day) shown beside a cited event:
 * "Fri, Oct 31, 2026 · 3:00 PM – 4:30 PM", or "Dec 22, 2025 – Jan 2, 2026"
 * for an entry spanning several days.
 */
export function formatEventWhen(entry: {
  date: string;
  date_end?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}): string {
  const isRange = !!entry.date_end && entry.date_end !== entry.date;
  const day = isRange
    ? `${formatDay(entry.date, SHORT_DATE_FORMAT)} – ${formatDay(entry.date_end!, SHORT_DATE_FORMAT)}`
    : formatDay(entry.date, DATE_FORMAT);
  if (!entry.start_time) return day;
  const time = entry.end_time
    ? `${formatClockTime(entry.start_time)} – ${formatClockTime(entry.end_time)}`
    : formatClockTime(entry.start_time);
  return `${day} · ${time}`;
}

/**
 * A calendar entry as a citable source numbered `n`. `content` is the line
 * the model read under that number; the date label rides in `location`, so
 * the citation tooltip, the source chip and shared answers all show it.
 */
export function eventSource(entry: CalendarEntry, n: number, content: string): ChatSource {
  return {
    document_id: entry.id,
    title: entry.title,
    chunk_content: content,
    similarity: 1,
    source_number: n,
    source_type: "event",
    location: { label: formatEventWhen(entry) },
    event: {
      date: entry.date,
      date_end: entry.date_end,
      start_time: entry.start_time,
      end_time: entry.end_time,
      location: entry.location,
    },
  };
}

/** Where tapping a cited event goes: the school calendar, open on its day. */
export function eventSourceHref(slug: string, source: ChatSource): string | null {
  const date = source.event?.date;
  if (source.source_type !== "event" || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `/s/${encodeURIComponent(slug)}/parent/events?date=${date}`;
}
