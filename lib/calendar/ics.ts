// "Add to calendar" for school events: an iCalendar (.ics) file for Apple
// Calendar (and anything else that opens .ics), and a Google Calendar
// "create event" link. Pure functions, no dependencies, so they can be unit
// tested (ics.test.ts). Parsing inbound feeds is lib/blackbaud/ical.ts.
//
// Times in the database are wall-clock times at the school, with no zone of
// their own. Every school is in SCHOOL_TIME_ZONE, so a timed event is
// converted from that zone to UTC once, here, and written as UTC everywhere
// (`DTSTART:20261120T200000Z`): valid without a VTIMEZONE block, and every
// calendar app shows it at the right local time. All-day events stay as plain
// dates with an exclusive end, as RFC 5545 and Google both expect.

import { SCHOOL_TIME_ZONE } from "@/lib/grades";

export interface CalendarEventInput {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** First day, YYYY-MM-DD. */
  date: string;
  /** Last day (inclusive), YYYY-MM-DD, for an entry spanning several days. */
  date_end?: string | null;
  /** HH:MM or HH:MM:SS; null means all-day. */
  start_time?: string | null;
  end_time?: string | null;
}

export interface CalendarOptions {
  /** IANA zone the event's times are in. */
  timeZone?: string;
  /** For DTSTAMP; defaults to now. */
  now?: Date;
}

/** A timed event with no end time is given this long. */
export const DEFAULT_DURATION_MINUTES = 60;

/** Longest range we'll write, so a bad date_end can't produce a year-long event. */
const MAX_RANGE_DAYS = 31;

const PRODID = "-//AskMySchool//Add to calendar//EN";
const UID_DOMAIN = "askmyschool.app";

// ─── Dates and times ─────────────────────────────────────────

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/;

interface Ymd {
  year: number;
  month: number;
  day: number;
}

function parseDate(value: string | null | undefined): Ymd | null {
  const match = value ? DATE_PATTERN.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Minutes since midnight, or null for a missing / unreadable time. */
function parseTime(value: string | null | undefined): number | null {
  const match = value ? TIME_PATTERN.exec(value.trim()) : null;
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function addDays(date: Ymd, days: number): Ymd {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function dayNumber(date: Ymd): number {
  return Date.UTC(date.year, date.month - 1, date.day) / 86_400_000;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** 20261120 */
function basicDate(date: Ymd): string {
  return `${pad(date.year, 4)}${pad(date.month)}${pad(date.day)}`;
}

/** 20261120T200000Z */
function basicUtc(ms: number): string {
  const d = new Date(ms);
  return (
    `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** How far `timeZone` is ahead of UTC at instant `ms`, in ms. */
function zoneOffset(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(ms));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour") % 24,
    part("minute"),
    part("second")
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The UTC instant of a wall-clock time in `timeZone` (DST-aware). */
export function zonedTimeToUtc(date: string, minutes: number, timeZone: string): number {
  const ymd = parseDate(date);
  if (!ymd) throw new Error(`Invalid date: ${date}`);
  const wall = Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, minutes);
  // Guess with the offset at the wall time, then correct once in case the
  // guess landed on the other side of a DST change.
  const first = wall - zoneOffset(wall, timeZone);
  const second = wall - zoneOffset(first, timeZone);
  return second;
}

export type EventTiming =
  | { allDay: true; start: string; endExclusive: string }
  | { allDay: false; startUtc: number; endUtc: number };

/**
 * When an event happens, normalized:
 *
 * - All-day (no start_time): DATE values with an exclusive end, so a one-day
 *   event on Nov 20 ends Nov 21, and Nov 20–22 ends Nov 23.
 * - Timed: UTC instants. With only `date`, start and end are both that day;
 *   with `date_end`, the end time is on the last day. A missing (or not
 *   later) end is DEFAULT_DURATION_MINUTES after the start.
 */
export function eventTiming(
  event: CalendarEventInput,
  timeZone: string = SCHOOL_TIME_ZONE
): EventTiming {
  const start = parseDate(event.date);
  if (!start) throw new Error(`Invalid event date: ${event.date}`);

  let last = parseDate(event.date_end) ?? start;
  const span = dayNumber(last) - dayNumber(start);
  if (span < 0 || span > MAX_RANGE_DAYS) last = start;

  const startMinutes = parseTime(event.start_time);
  if (startMinutes === null) {
    return { allDay: true, start: basicDate(start), endExclusive: basicDate(addDays(last, 1)) };
  }

  const startUtc = zonedTimeToUtc(event.date, startMinutes, timeZone);
  const endMinutes = parseTime(event.end_time);
  const lastDate = `${pad(last.year, 4)}-${pad(last.month)}-${pad(last.day)}`;
  let endUtc =
    endMinutes === null ? Number.NaN : zonedTimeToUtc(lastDate, endMinutes, timeZone);
  if (!(endUtc > startUtc)) {
    endUtc =
      lastDate === event.date
        ? startUtc + DEFAULT_DURATION_MINUTES * 60_000
        : zonedTimeToUtc(lastDate, startMinutes + DEFAULT_DURATION_MINUTES, timeZone);
  }
  return { allDay: false, startUtc, endUtc };
}

// ─── iCalendar text ─────────────────────────────────────────

/** Drops control characters (other than line breaks and tab) that iCalendar forbids. */
function stripControls(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/** RFC 5545 §3.3.11 TEXT escaping. Line breaks become a literal \n. */
export function escapeText(value: string): string {
  return stripControls(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 line folding: no line longer than 75 octets; continuation
 * lines start with a space. Never splits a UTF-8 character.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  // Continuation lines carry a leading space, so they hold one octet less.
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (currentBytes + bytes > limit) {
      out.push(current);
      current = "";
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** A UID that's stable for the event and safe in any calendar. */
export function eventUid(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9-]/g, "");
  return `event-${safe || "unknown"}@${UID_DOMAIN}`;
}

function clean(value: string | null | undefined): string {
  return value ? stripControls(value).trim() : "";
}

/** A complete VCALENDAR 2.0 document with one VEVENT, CRLF line endings. */
export function buildIcs(event: CalendarEventInput, options: CalendarOptions = {}): string {
  const timeZone = options.timeZone ?? SCHOOL_TIME_ZONE;
  const timing = eventTiming(event, timeZone);
  const title = clean(event.title) || "School event";
  const description = clean(event.description);
  const location = clean(event.location);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${eventUid(event.id)}`,
    `DTSTAMP:${basicUtc((options.now ?? new Date()).getTime())}`,
    ...(timing.allDay
      ? [`DTSTART;VALUE=DATE:${timing.start}`, `DTEND;VALUE=DATE:${timing.endExclusive}`]
      : [`DTSTART:${basicUtc(timing.startUtc)}`, `DTEND:${basicUtc(timing.endUtc)}`]),
    `SUMMARY:${escapeText(title)}`,
    ...(location ? [`LOCATION:${escapeText(location)}`] : []),
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    // All-day school events (no-school days, spirit week) shouldn't block
    // a parent's day as busy.
    `TRANSP:${timing.allDay ? "TRANSPARENT" : "OPAQUE"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * Content-Disposition filename parameters for an event's .ics: an ASCII
 * fallback plus the UTF-8 title (RFC 6266 / 5987).
 */
export function icsFilename(title: string | null | undefined): { ascii: string; utf8: string } {
  const base = clean(title).replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  const trimmed = Array.from(base).slice(0, 60).join("").trim() || "event";
  const ascii =
    trimmed
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/["\\;%]/g, "")
      .trim() || "event";
  return { ascii: `${ascii}.ics`, utf8: `${trimmed}.ics` };
}

export function icsContentDisposition(title: string | null | undefined): string {
  const { ascii, utf8 } = icsFilename(title);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`;
}

// ─── Google Calendar ────────────────────────────────────────

/** Keep the link well under URL limits; long descriptions are cut. */
const GOOGLE_DETAILS_MAX = 1500;

/**
 * https://calendar.google.com/calendar/render?action=TEMPLATE&… — opens
 * Google Calendar's "new event" form filled in. `dates` is UTC (…Z) for a
 * timed event and date-only with an exclusive end for an all-day one.
 */
export function googleCalendarUrl(
  event: CalendarEventInput,
  options: Pick<CalendarOptions, "timeZone"> = {}
): string {
  const timeZone = options.timeZone ?? SCHOOL_TIME_ZONE;
  const timing = eventTiming(event, timeZone);
  const dates = timing.allDay
    ? `${timing.start}/${timing.endExclusive}`
    : `${basicUtc(timing.startUtc)}/${basicUtc(timing.endUtc)}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: clean(event.title) || "School event",
    dates,
    ctz: timeZone,
  });
  const description = clean(event.description);
  if (description) {
    params.set(
      "details",
      description.length > GOOGLE_DETAILS_MAX
        ? `${description.slice(0, GOOGLE_DETAILS_MAX - 1)}…`
        : description
    );
  }
  const location = clean(event.location);
  if (location) params.set("location", location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ─── Links to the .ics route ────────────────────────────────

/** Same-site path of app/api/events/[id]/ics. `end` extends a chat range. */
export function icsPath(
  eventId: string,
  query: { end?: string | null; token?: string | null } = {}
): string {
  const params = new URLSearchParams();
  if (query.end && DATE_PATTERN.test(query.end)) params.set("end", query.end);
  if (query.token) params.set("t", query.token);
  const search = params.toString();
  return `/api/events/${encodeURIComponent(eventId)}/ics${search ? `?${search}` : ""}`;
}
