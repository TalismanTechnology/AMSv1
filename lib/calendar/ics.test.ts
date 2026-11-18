import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DURATION_MINUTES,
  buildIcs,
  escapeText,
  eventTiming,
  eventUid,
  foldLine,
  googleCalendarUrl,
  icsContentDisposition,
  icsFilename,
  icsPath,
  zonedTimeToUtc,
  type CalendarEventInput,
} from "./ics";

const NOW = new Date("2026-11-17T12:34:56Z");

const base: CalendarEventInput = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "Parent Conferences",
  description: null,
  location: null,
  date: "2026-11-20",
  start_time: null,
  end_time: null,
};

/** Unfold (RFC 5545 §3.1) and split into content lines. */
function contentLines(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
}

function prop(ics: string, name: string): string | undefined {
  return contentLines(ics).find((line) => line.startsWith(`${name}:`) || line.startsWith(`${name};`));
}

// ─── Structure ─────────────────────────────────────────────

test("builds a VCALENDAR 2.0 with one VEVENT, CRLF line endings", () => {
  const ics = buildIcs(base, { now: NOW });
  const lines = contentLines(ics);
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal(lines.at(-1), "END:VCALENDAR");
  assert.ok(lines.includes("VERSION:2.0"));
  assert.ok(lines.some((l) => l.startsWith("PRODID:")));
  assert.equal(lines.filter((l) => l === "BEGIN:VEVENT").length, 1);
  assert.equal(lines.filter((l) => l === "END:VEVENT").length, 1);
  assert.ok(ics.endsWith("\r\n"));
  // No bare LF anywhere.
  assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false);
});

test("UID is stable per event and DTSTAMP is UTC", () => {
  const ics = buildIcs(base, { now: NOW });
  assert.equal(prop(ics, "UID"), "UID:event-11111111-2222-3333-4444-555555555555@askmyschool.app");
  assert.equal(prop(ics, "DTSTAMP"), "DTSTAMP:20261117T123456Z");
  assert.equal(buildIcs(base, { now: new Date() }).includes(prop(ics, "UID")!), true);
});

test("UID strips anything but letters, digits and hyphens", () => {
  assert.equal(eventUid("abc\r\nEND:VEVENT;,"), "event-abcENDVEVENT@askmyschool.app");
  assert.equal(eventUid(""), "event-unknown@askmyschool.app");
});

// ─── All-day ───────────────────────────────────────────────

test("an all-day event uses DATE values with an exclusive end", () => {
  const ics = buildIcs(base, { now: NOW });
  assert.equal(prop(ics, "DTSTART"), "DTSTART;VALUE=DATE:20261120");
  assert.equal(prop(ics, "DTEND"), "DTEND;VALUE=DATE:20261121");
  assert.equal(prop(ics, "TRANSP"), "TRANSP:TRANSPARENT");
});

test("a multi-day all-day range ends the day after its last day", () => {
  const ics = buildIcs({ ...base, date_end: "2026-11-22" }, { now: NOW });
  assert.equal(prop(ics, "DTSTART"), "DTSTART;VALUE=DATE:20261120");
  assert.equal(prop(ics, "DTEND"), "DTEND;VALUE=DATE:20261123");
});

test("an all-day range crosses month and year ends", () => {
  const timing = eventTiming({ ...base, date: "2026-12-30", date_end: "2026-12-31" });
  assert.deepEqual(timing, { allDay: true, start: "20261230", endExclusive: "20270101" });
});

test("a date_end before the start or absurdly far out is ignored", () => {
  assert.deepEqual(eventTiming({ ...base, date_end: "2026-11-19" }), {
    allDay: true,
    start: "20261120",
    endExclusive: "20261121",
  });
  assert.deepEqual(eventTiming({ ...base, date_end: "2027-11-20" }), {
    allDay: true,
    start: "20261120",
    endExclusive: "20261121",
  });
});

test("an invalid date throws instead of writing a broken file", () => {
  assert.throws(() => buildIcs({ ...base, date: "2026-02-30" }));
  assert.throws(() => buildIcs({ ...base, date: "next friday" }));
});

// ─── Timed + time zone ─────────────────────────────────────

test("3:00 PM in New York in November (EST) is 20:00 UTC, not 15:00 UTC", () => {
  const ics = buildIcs({ ...base, start_time: "15:00:00", end_time: "16:30:00" }, { now: NOW });
  assert.equal(prop(ics, "DTSTART"), "DTSTART:20261120T200000Z");
  assert.equal(prop(ics, "DTEND"), "DTEND:20261120T213000Z");
  assert.equal(ics.includes("T150000"), false);
  assert.equal(prop(ics, "TRANSP"), "TRANSP:OPAQUE");
});

test("3:00 PM in New York in July (EDT) is 19:00 UTC", () => {
  const ics = buildIcs({ ...base, date: "2026-07-15", start_time: "15:00" }, { now: NOW });
  assert.equal(prop(ics, "DTSTART"), "DTSTART:20260715T190000Z");
});

test("times are converted across the DST changes", () => {
  // 2026-03-08: clocks go forward at 2 AM. 2026-11-01: back at 2 AM.
  assert.equal(
    new Date(zonedTimeToUtc("2026-03-08", 1 * 60, "America/New_York")).toISOString(),
    "2026-03-08T06:00:00.000Z"
  );
  assert.equal(
    new Date(zonedTimeToUtc("2026-03-08", 9 * 60, "America/New_York")).toISOString(),
    "2026-03-08T13:00:00.000Z"
  );
  assert.equal(
    new Date(zonedTimeToUtc("2026-11-01", 9 * 60, "America/New_York")).toISOString(),
    "2026-11-01T14:00:00.000Z"
  );
});

test("another zone can be passed", () => {
  const ics = buildIcs(
    { ...base, start_time: "15:00", end_time: "16:00" },
    { now: NOW, timeZone: "America/Los_Angeles" }
  );
  assert.equal(prop(ics, "DTSTART"), "DTSTART:20261120T230000Z");
});

test(`a timed event with no end time lasts ${DEFAULT_DURATION_MINUTES} minutes`, () => {
  const ics = buildIcs({ ...base, start_time: "15:00", end_time: null }, { now: NOW });
  assert.equal(prop(ics, "DTSTART"), "DTSTART:20261120T200000Z");
  assert.equal(prop(ics, "DTEND"), "DTEND:20261120T210000Z");
});

test("an end time not after the start is treated as missing", () => {
  const ics = buildIcs({ ...base, start_time: "15:00", end_time: "14:00" }, { now: NOW });
  assert.equal(prop(ics, "DTEND"), "DTEND:20261120T210000Z");
});

test("a timed event that ends late in the evening stays on its day in New York", () => {
  const ics = buildIcs({ ...base, start_time: "19:00", end_time: "21:00" }, { now: NOW });
  // 9 PM EST is 2 AM UTC the next day.
  assert.equal(prop(ics, "DTSTART"), "DTSTART:20261121T000000Z");
  assert.equal(prop(ics, "DTEND"), "DTEND:20261121T020000Z");
});

test("a timed range runs from the first day's start to the last day's end", () => {
  const ics = buildIcs(
    { ...base, date_end: "2026-11-22", start_time: "09:00", end_time: "15:00" },
    { now: NOW }
  );
  assert.equal(prop(ics, "DTSTART"), "DTSTART:20261120T140000Z");
  assert.equal(prop(ics, "DTEND"), "DTEND:20261122T200000Z");
});

test("a timed range with no end time ends an hour after the start on its last day", () => {
  const timing = eventTiming({ ...base, date_end: "2026-11-21", start_time: "09:00" });
  assert.equal(timing.allDay, false);
  if (timing.allDay) return;
  assert.equal(new Date(timing.endUtc).toISOString(), "2026-11-21T15:00:00.000Z");
});

test("an unreadable start time falls back to all-day", () => {
  const timing = eventTiming({ ...base, start_time: "25:99" });
  assert.equal(timing.allDay, true);
});

// ─── Text ──────────────────────────────────────────────────

test("TEXT values escape backslash, semicolon, comma and line breaks", () => {
  assert.equal(escapeText("a\\b;c,d\ne\r\nf\rg"), "a\\\\b\\;c\\,d\\ne\\nf\\ng");
});

test("SUMMARY, LOCATION and DESCRIPTION are escaped and can't add properties", () => {
  const ics = buildIcs(
    {
      ...base,
      title: "Bake sale; bring cookies, please\r\nEND:VEVENT\r\nBEGIN:VEVENT",
      location: "Gym, Building B",
      description: "Line one\nLine two\\done",
    },
    { now: NOW }
  );
  assert.equal(
    prop(ics, "SUMMARY"),
    "SUMMARY:Bake sale\\; bring cookies\\, please\\nEND:VEVENT\\nBEGIN:VEVENT"
  );
  assert.equal(prop(ics, "LOCATION"), "LOCATION:Gym\\, Building B");
  assert.equal(prop(ics, "DESCRIPTION"), "DESCRIPTION:Line one\\nLine two\\\\done");
  const lines = contentLines(ics);
  assert.equal(lines.filter((l) => l === "BEGIN:VEVENT").length, 1);
  assert.equal(lines.filter((l) => l === "END:VEVENT").length, 1);
});

test("control characters are dropped", () => {
  const ics = buildIcs({ ...base, title: "Bell\u0007 \u0000Choir\u001b" }, { now: NOW });
  assert.equal(prop(ics, "SUMMARY"), "SUMMARY:Bell Choir");
});

test("empty location and description are left out; an empty title gets a fallback", () => {
  const ics = buildIcs({ ...base, title: "   ", location: "", description: "  " }, { now: NOW });
  assert.equal(prop(ics, "LOCATION"), undefined);
  assert.equal(prop(ics, "DESCRIPTION"), undefined);
  assert.equal(prop(ics, "SUMMARY"), "SUMMARY:School event");
});

// ─── Folding ───────────────────────────────────────────────

const octets = (s: string) => new TextEncoder().encode(s).length;

test("short lines are not folded", () => {
  assert.equal(foldLine("SUMMARY:Short"), "SUMMARY:Short");
  assert.equal(foldLine("X".repeat(75)), "X".repeat(75));
});

test("long lines fold at 75 octets with a leading space on continuations", () => {
  const line = `DESCRIPTION:${"a".repeat(200)}`;
  const folded = foldLine(line);
  const parts = folded.split("\r\n");
  assert.ok(parts.length > 1);
  for (const [i, part] of parts.entries()) {
    assert.ok(octets(part) <= 75, `line ${i} is ${octets(part)} octets`);
    if (i > 0) assert.ok(part.startsWith(" "));
  }
  assert.equal(folded.replace(/\r\n /g, ""), line);
});

test("folding never splits a multi-byte character", () => {
  const line = `SUMMARY:${"é🎉".repeat(40)}`;
  const folded = foldLine(line);
  for (const part of folded.split("\r\n")) {
    assert.ok(octets(part) <= 75);
    assert.equal(part.includes("�"), false);
  }
  assert.equal(folded.replace(/\r\n /g, ""), line);
});

test("every line of a long event is folded", () => {
  const ics = buildIcs(
    { ...base, description: "Bring a water bottle, sunscreen and a hat. ".repeat(20) },
    { now: NOW }
  );
  for (const line of ics.split("\r\n")) assert.ok(octets(line) <= 75);
});

// ─── Filenames ─────────────────────────────────────────────

test("filenames come from the title, safe for a header", () => {
  assert.deepEqual(icsFilename('Fall "Fest": 6/7'), { ascii: "Fall Fest 6 7.ics", utf8: "Fall Fest 6 7.ics" });
  assert.deepEqual(icsFilename(null), { ascii: "event.ics", utf8: "event.ics" });
  assert.equal(icsFilename("Café night").ascii, "Cafe night.ics");
  assert.equal(icsFilename("日本語").ascii, "event.ics");
  const header = icsContentDisposition("Line\r\nInjected: yes");
  assert.equal(/[\r\n]/.test(header), false);
  assert.ok(header.startsWith('inline; filename="'));
  assert.ok(header.includes("filename*=UTF-8''"));
});

test("icsPath builds the same-site route, with optional range end and token", () => {
  assert.equal(icsPath("abc"), "/api/events/abc/ics");
  assert.equal(icsPath("abc", { end: "2026-11-22" }), "/api/events/abc/ics?end=2026-11-22");
  assert.equal(icsPath("abc", { end: "bad" }), "/api/events/abc/ics");
  assert.equal(icsPath("a/b", { token: "v1.x.y" }), "/api/events/a%2Fb/ics?t=v1.x.y");
});

// ─── Google Calendar ───────────────────────────────────────

function googleParams(url: string) {
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, "https://calendar.google.com/calendar/render");
  return parsed.searchParams;
}

test("Google: a timed event uses UTC Z dates and the school's zone", () => {
  const params = googleParams(
    googleCalendarUrl({ ...base, start_time: "15:00:00", end_time: "16:00:00" })
  );
  assert.equal(params.get("action"), "TEMPLATE");
  assert.equal(params.get("text"), "Parent Conferences");
  assert.equal(params.get("dates"), "20261120T200000Z/20261120T210000Z");
  assert.equal(params.get("ctz"), "America/New_York");
});

test("Google: an all-day event uses dates with an exclusive end", () => {
  assert.equal(googleParams(googleCalendarUrl(base)).get("dates"), "20261120/20261121");
  assert.equal(
    googleParams(googleCalendarUrl({ ...base, date_end: "2026-11-22" })).get("dates"),
    "20261120/20261123"
  );
});

test("Google: no end time gets the same default duration as the .ics", () => {
  assert.equal(
    googleParams(googleCalendarUrl({ ...base, start_time: "15:00" })).get("dates"),
    "20261120T200000Z/20261120T210000Z"
  );
});

test("Google: text, details and location are encoded safely", () => {
  const url = googleCalendarUrl({
    ...base,
    title: "Fish & Chips #1 ? 100% fun",
    description: "Line one\nLine two",
    location: "Gym/Building B, Room 3",
  });
  assert.equal(url.includes(" "), false);
  assert.equal(url.includes("\n"), false);
  assert.equal(url.includes("#"), false);
  const params = googleParams(url);
  assert.equal(params.get("text"), "Fish & Chips #1 ? 100% fun");
  assert.equal(params.get("details"), "Line one\nLine two");
  assert.equal(params.get("location"), "Gym/Building B, Room 3");
  // Only the parameters we set.
  assert.deepEqual([...params.keys()].sort(), ["action", "ctz", "dates", "details", "location", "text"]);
});

test("Google: empty fields are left out and long details are cut", () => {
  const params = googleParams(googleCalendarUrl({ ...base, description: "x".repeat(5000) }));
  assert.equal(params.has("location"), false);
  assert.ok(params.get("details")!.length <= 1500);
});
