import test from "node:test";
import assert from "node:assert/strict";

import { parseFeed, IcalParseError, type NormalizedEvent } from "./ical";
import {
  utcToWallClock,
  wallClockToUtc,
  isValidTimeZone,
} from "./timezone";
import { normalizeFeedUrl, __testing } from "./safe-fetch";
import {
  tagFromMappings,
  inferEventType,
  normalizeSourceValue,
} from "./tagging";
import { expandDays } from "./publish";

const TZ = "America/New_York";

const WINDOW = {
  timezone: TZ,
  windowStart: new Date("2026-01-01T00:00:00Z"),
  windowEnd: new Date("2027-06-30T00:00:00Z"),
};

function feed(...vevents: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Blackbaud//Education Management//EN",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");
}

// ── Timezone ─────────────────────────────────────────

test("wall clock round-trips through UTC", () => {
  const wall = { year: 2026, month: 9, day: 4, hour: 14, minute: 30, second: 0 };
  const instant = wallClockToUtc(wall, TZ);

  // 2:30pm EDT is 18:30 UTC.
  assert.equal(instant.toISOString(), "2026-09-04T18:30:00.000Z");
  assert.deepEqual(utcToWallClock(instant, TZ), wall);
});

test("wall clock respects DST on either side of the boundary", () => {
  // EST (UTC-5) in January, EDT (UTC-4) in July — same clock time, different offsets.
  const winter = wallClockToUtc(
    { year: 2026, month: 1, day: 15, hour: 9, minute: 0, second: 0 },
    TZ
  );
  const summer = wallClockToUtc(
    { year: 2026, month: 7, day: 15, hour: 9, minute: 0, second: 0 },
    TZ
  );

  assert.equal(winter.toISOString(), "2026-01-15T14:00:00.000Z");
  assert.equal(summer.toISOString(), "2026-07-15T13:00:00.000Z");
});

test("invalid timezone names are rejected", () => {
  assert.equal(isValidTimeZone("America/New_York"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
});

// ── Parsing ──────────────────────────────────────────

test("a timed event resolves into the school's wall clock", () => {
  const events = parseFeed(
    feed(
      "BEGIN:VEVENT",
      "UID:game-1@blackbaud",
      "DTSTART:20260904T183000Z",
      "DTEND:20260904T203000Z",
      "SUMMARY:Varsity Soccer vs Riverdale",
      "LOCATION:Home Field",
      "CATEGORIES:Athletics,Upper School",
      "END:VEVENT"
    ),
    WINDOW
  );

  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.title, "Varsity Soccer vs Riverdale");
  assert.equal(event.localDate, "2026-09-04");
  assert.equal(event.localStartTime, "14:30:00");
  assert.equal(event.localEndTime, "16:30:00");
  assert.equal(event.allDay, false);
  assert.equal(event.location, "Home Field");
  assert.deepEqual(event.categories, ["Athletics", "Upper School"]);
});

test("a single all-day event does not gain a phantom second day", () => {
  // RFC 5545 all-day DTEND is exclusive: one day on the 25th ends on the 26th.
  const events = parseFeed(
    feed(
      "BEGIN:VEVENT",
      "UID:holiday-1@blackbaud",
      "DTSTART;VALUE=DATE:20261125",
      "DTEND;VALUE=DATE:20261126",
      "SUMMARY:Professional Day",
      "END:VEVENT"
    ),
    WINDOW
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].allDay, true);
  assert.equal(events[0].localDate, "2026-11-25");
  assert.equal(events[0].localEndDate, null);
  assert.equal(events[0].localStartTime, null);
});

test("a multi-day all-day span keeps an inclusive end date", () => {
  const events = parseFeed(
    feed(
      "BEGIN:VEVENT",
      "UID:break-1@blackbaud",
      "DTSTART;VALUE=DATE:20261125",
      "DTEND;VALUE=DATE:20261128",
      "SUMMARY:Thanksgiving Break",
      "END:VEVENT"
    ),
    WINDOW
  );

  assert.equal(events[0].localDate, "2026-11-25");
  assert.equal(events[0].localEndDate, "2026-11-27");
});

test("a floating time is read in the school's zone, not UTC", () => {
  // No TZID and no Z. Read as UTC this would land at 19:00 the same day;
  // read as local it stays 19:00 local.
  const events = parseFeed(
    feed(
      "BEGIN:VEVENT",
      "UID:concert-1@blackbaud",
      "DTSTART:20261120T190000",
      "DTEND:20261120T210000",
      "SUMMARY:Winter Concert",
      "END:VEVENT"
    ),
    WINDOW
  );

  assert.equal(events[0].localDate, "2026-11-20");
  assert.equal(events[0].localStartTime, "19:00:00");
  assert.equal(events[0].occurrenceStart.toISOString(), "2026-11-21T00:00:00.000Z");
});

test("a recurring series expands to one row per occurrence", () => {
  const events = parseFeed(
    feed(
      "BEGIN:VEVENT",
      "UID:practice-1@blackbaud",
      "DTSTART:20260907T220000Z",
      "DTEND:20260907T233000Z",
      "RRULE:FREQ=WEEKLY;COUNT=4",
      "SUMMARY:JV Basketball Practice",
      "END:VEVENT"
    ),
    WINDOW
  );

  assert.equal(events.length, 4);
  assert.deepEqual(
    events.map((e) => e.localDate),
    ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]
  );
  // Same UID across occurrences; the start is what separates them.
  assert.equal(new Set(events.map((e) => e.uid)).size, 1);
});

test("an excluded date is dropped from the series", () => {
  const events = parseFeed(
    feed(
      "BEGIN:VEVENT",
      "UID:practice-2@blackbaud",
      "DTSTART:20260907T220000Z",
      "DTEND:20260907T233000Z",
      "RRULE:FREQ=WEEKLY;COUNT=4",
      "EXDATE:20260914T220000Z",
      "SUMMARY:JV Basketball Practice",
      "END:VEVENT"
    ),
    WINDOW
  );

  assert.deepEqual(
    events.map((e) => e.localDate),
    ["2026-09-07", "2026-09-21", "2026-09-28"]
  );
});

test("a moved occurrence uses the override, not the original time", () => {
  const events = parseFeed(
    feed(
      "BEGIN:VEVENT",
      "UID:practice-3@blackbaud",
      "DTSTART:20260907T220000Z",
      "DTEND:20260907T233000Z",
      "RRULE:FREQ=WEEKLY;COUNT=3",
      "SUMMARY:JV Basketball Practice",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:practice-3@blackbaud",
      "RECURRENCE-ID:20260914T220000Z",
      "DTSTART:20260914T230000Z",
      "DTEND:20260915T003000Z",
      "SUMMARY:JV Basketball Practice (late start)",
      "END:VEVENT"
    ),
    WINDOW
  );

  const moved = events.find((e) => e.localDate === "2026-09-14");
  assert.ok(moved, "expected the overridden occurrence");
  assert.equal(moved.localStartTime, "19:00:00");
  assert.equal(moved.title, "JV Basketball Practice (late start)");
});

test("events outside the window are skipped", () => {
  const events = parseFeed(
    feed(
      "BEGIN:VEVENT",
      "UID:old-1@blackbaud",
      "DTSTART:20200904T183000Z",
      "DTEND:20200904T203000Z",
      "SUMMARY:Ancient History",
      "END:VEVENT"
    ),
    WINDOW
  );

  assert.equal(events.length, 0);
});

test("an unbounded daily series is capped instead of running away", () => {
  const events = parseFeed(
    feed(
      "BEGIN:VEVENT",
      "UID:forever-1@blackbaud",
      "DTSTART:20260101T120000Z",
      "DTEND:20260101T130000Z",
      "RRULE:FREQ=DAILY",
      "SUMMARY:Morning Meeting",
      "END:VEVENT"
    ),
    WINDOW
  );

  // Bounded by the window (~545 days), never unbounded.
  assert.ok(events.length > 0);
  assert.ok(events.length <= 800, `expected a cap, got ${events.length}`);
});

test("the content hash is stable across parses but moves when a field changes", () => {
  const build = (summary: string) =>
    parseFeed(
      feed(
        "BEGIN:VEVENT",
        "UID:hash-1@blackbaud",
        "DTSTART:20260904T183000Z",
        "DTEND:20260904T203000Z",
        `SUMMARY:${summary}`,
        "END:VEVENT"
      ),
      WINDOW
    )[0];

  assert.equal(build("Open House").contentHash, build("Open House").contentHash);
  assert.notEqual(build("Open House").contentHash, build("Open House (moved)").contentHash);
});

test("one malformed VEVENT does not fail the whole feed", () => {
  const events = parseFeed(
    feed(
      "BEGIN:VEVENT",
      "UID:broken-1@blackbaud",
      "SUMMARY:No start date",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:good-1@blackbaud",
      "DTSTART:20260904T183000Z",
      "DTEND:20260904T203000Z",
      "SUMMARY:Back to School Night",
      "END:VEVENT"
    ),
    WINDOW
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Back to School Night");
});

test("garbage input raises a typed parse error", () => {
  assert.throws(() => parseFeed("this is not a calendar", WINDOW), IcalParseError);
});

// ── SSRF guard ───────────────────────────────────────

test("webcal links are normalized to https", () => {
  assert.equal(
    normalizeFeedUrl("webcal://school.myschoolapp.com/feed.ics"),
    "https://school.myschoolapp.com/feed.ics"
  );
  assert.equal(
    normalizeFeedUrl("  https://school.myschoolapp.com/feed.ics  "),
    "https://school.myschoolapp.com/feed.ics"
  );
});

test("private and metadata addresses are blocked", () => {
  const blocked = [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254", // cloud instance metadata
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:10.0.0.1", // IPv4-mapped private
  ];

  for (const ip of blocked) {
    assert.equal(__testing.isBlockedIp(ip), true, `${ip} should be blocked`);
  }
});

test("public addresses are allowed", () => {
  for (const ip of ["8.8.8.8", "151.101.1.140", "2606:4700::1111"]) {
    assert.equal(__testing.isBlockedIp(ip), false, `${ip} should be allowed`);
  }
});

test("non-https feed URLs are refused", async () => {
  await assert.rejects(
    () => __testing.assertPublicHost(new URL("http://school.myschoolapp.com/feed.ics")),
    /must use https/
  );
});

test("an https URL pointing straight at a private IP is refused", async () => {
  await assert.rejects(
    () => __testing.assertPublicHost(new URL("https://169.254.169.254/latest/meta-data/")),
    /not a public address/
  );
});

// ── Tagging ──────────────────────────────────────────

const CALENDARS = [
  { id: "div-lower", kind: "division" as const, name: "Lower School" },
  { id: "div-upper", kind: "division" as const, name: "Upper School" },
  { id: "cat-athletics", kind: "category" as const, name: "Athletics" },
  { id: "cat-arts", kind: "category" as const, name: "Arts" },
];

function stagedEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    uid: "e1",
    occurrenceStart: new Date("2026-09-04T18:30:00Z"),
    title: "Varsity Soccer vs Riverdale",
    description: null,
    location: null,
    allDay: false,
    localDate: "2026-09-04",
    localEndDate: null,
    localStartTime: "14:30:00",
    localEndTime: "16:30:00",
    categories: [],
    contentHash: "hash",
    ...overrides,
  };
}

test("a feed mapping tags every event on that feed", () => {
  const result = tagFromMappings(
    stagedEvent({ title: "Some Event", categories: [] }),
    "feed-1",
    CALENDARS,
    [
      { source_kind: "feed", source_value: "feed-1", calendar_id: "div-upper" },
      { source_kind: "feed", source_value: "feed-1", calendar_id: "cat-athletics" },
    ]
  );

  assert.ok(result);
  assert.equal(result.source, "mapping");
  assert.deepEqual(result.calendarIds.sort(), ["cat-athletics", "div-upper"]);
});

test("a feed category matches a calendar by name without a stored rule", () => {
  const result = tagFromMappings(
    stagedEvent({ title: "Some Event", categories: ["Athletics"] }),
    "feed-1",
    CALENDARS,
    []
  );

  assert.ok(result);
  assert.deepEqual(result.calendarIds, ["cat-athletics"]);
});

test("a compound category resolves to both a division and a category", () => {
  const result = tagFromMappings(
    stagedEvent({ title: "Some Event", categories: ["Upper School Athletics"] }),
    "feed-1",
    CALENDARS,
    []
  );

  assert.ok(result);
  assert.deepEqual(result.calendarIds.sort(), ["cat-athletics", "div-upper"]);
});

test("a division named in the title is picked up", () => {
  const result = tagFromMappings(
    stagedEvent({ title: "Lower School Open House", categories: [] }),
    "feed-1",
    CALENDARS,
    []
  );

  assert.ok(result);
  assert.deepEqual(result.calendarIds, ["div-lower"]);
});

test("nothing matching returns null so the model gets a turn", () => {
  const result = tagFromMappings(
    stagedEvent({ title: "Picture Day", categories: [] }),
    "feed-1",
    CALENDARS,
    []
  );

  assert.equal(result, null);
});

test("a mapping for another school's feed does not leak across", () => {
  const result = tagFromMappings(
    stagedEvent({ title: "Picture Day", categories: [] }),
    "feed-1",
    CALENDARS,
    [{ source_kind: "feed", source_value: "feed-2", calendar_id: "div-upper" }]
  );

  assert.equal(result, null);
});

test("a mapping pointing at a deleted calendar is ignored", () => {
  const result = tagFromMappings(
    stagedEvent({ title: "Picture Day", categories: [] }),
    "feed-1",
    CALENDARS,
    [{ source_kind: "feed", source_value: "feed-1", calendar_id: "div-deleted" }]
  );

  assert.equal(result, null);
});

test("event types are inferred from the title", () => {
  assert.equal(inferEventType(stagedEvent({ title: "Varsity Soccer vs Riverdale" })), "sports");
  assert.equal(inferEventType(stagedEvent({ title: "Winter Concert" })), "arts");
  assert.equal(inferEventType(stagedEvent({ title: "Thanksgiving Break" })), "holiday");
  assert.equal(inferEventType(stagedEvent({ title: "PTA Meeting" })), "meeting");
  assert.equal(inferEventType(stagedEvent({ title: "Midterm Exams" })), "academic");
  assert.equal(inferEventType(stagedEvent({ title: "Picture Day" })), "general");
});

test("source values normalize consistently for matching", () => {
  assert.equal(normalizeSourceValue("  Upper-School / Athletics "), "upper school athletics");
  assert.equal(normalizeSourceValue("ARTS"), "arts");
});

// ── Publishing ───────────────────────────────────────

test("a single-day event expands to one day", () => {
  assert.deepEqual(expandDays("2026-11-25", null), ["2026-11-25"]);
});

test("a multi-day span expands inclusively", () => {
  assert.deepEqual(expandDays("2026-11-25", "2026-11-27"), [
    "2026-11-25",
    "2026-11-26",
    "2026-11-27",
  ]);
});

test("a span crossing a DST boundary does not skip or repeat a day", () => {
  // US DST ends 2026-11-01.
  assert.deepEqual(expandDays("2026-10-31", "2026-11-02"), [
    "2026-10-31",
    "2026-11-01",
    "2026-11-02",
  ]);
});

test("an absurd end date is capped instead of inserting years of rows", () => {
  assert.equal(expandDays("2026-01-01", "2099-01-01").length, 60);
});

test("an end date before the start collapses to a single day", () => {
  assert.deepEqual(expandDays("2026-11-25", "2026-11-20"), ["2026-11-25"]);
});
