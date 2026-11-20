import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "./system-prompt";
import {
  formatAnnouncementsContext,
  formatChildrenContext,
  formatEventsContext,
  getTodayString,
  type CalendarEntry,
} from "./context";
import { CALENDAR_FIRST_NUMBER, calendarFirstNumber } from "./chat-turn";
import { minimalThinkingOptions } from "./models";
import type { CitablePassage } from "./rag";

// The provider's prompt cache only reuses a byte-identical prefix, so the
// school-wide material must come before anything that varies per request.

const calendar: CalendarEntry[] = [
  {
    id: "e1",
    title: "Thanksgiving Break (School Closed)",
    description: null,
    date: "2026-11-25",
    date_end: "2026-11-27",
    start_time: null,
    end_time: null,
    location: null,
    event_type: "holiday",
  },
  {
    id: "e2",
    title: "Winter Program",
    description: null,
    date: "2026-12-18",
    date_end: null,
    start_time: "10:00:00",
    end_time: null,
    location: "Auditorium",
    event_type: "event",
  },
];

const announcements = formatAnnouncementsContext([
  {
    id: "a1",
    title: "Winter dress code",
    content: "Begins Monday.",
    priority: "normal",
    pinned: true,
    created_at: "2026-11-10T00:00:00Z",
  },
]);

function passage(n: number, content: string): CitablePassage {
  return {
    document_id: `doc${n}`,
    title: `Document ${n}`,
    content,
    similarity: 0.8,
    chunk_index: n,
    chunk_indexes: [n],
    metadata: { page: n },
  };
}

function promptFor({
  passages,
  children,
  now,
  hasHistory,
}: {
  passages: CitablePassage[];
  children: { name: string; grade: string }[];
  now: Date;
  hasHistory: boolean;
}): string {
  return buildSystemPrompt(passages, {
    eventsContext: formatEventsContext(calendar, calendarFirstNumber(passages.length)),
    announcementsContext: announcements,
    childrenContext: formatChildrenContext(children),
    childCount: children.length,
    todayString: getTodayString(now),
    schoolInstructions: "Be warm.",
    hasHistory,
  });
}

function commonPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

const first = promptFor({
  passages: [passage(1, "Classes begin at 8:30 AM."), passage(2, "First bell at 8:25 AM.")],
  children: [{ name: "Mia", grade: "8" }],
  now: new Date("2026-11-19T15:00:00Z"),
  hasHistory: false,
});
const second = promptFor({
  passages: [passage(1, "Students wear collared shirts.")],
  children: [
    { name: "Leo", grade: "3" },
    { name: "Ava", grade: "11" },
  ],
  now: new Date("2026-11-20T15:00:00Z"),
  hasHistory: true,
});

test("two parents' questions share the whole calendar and announcements as a prefix", () => {
  const prefix = commonPrefix(first, second);
  assert.ok(prefix.includes("</calendar>"), "calendar is in the shared prefix");
  assert.ok(prefix.includes("</announcements>"), "announcements are in the shared prefix");
  assert.ok(prefix.includes('"Thanksgiving Break (School Closed)" from 2026-11-25 through 2026-11-27'));
  assert.ok(prefix.includes(`[Source ${CALENDAR_FIRST_NUMBER}]`));
  // Most of the prompt (in production the calendar alone is ~30k tokens).
  assert.ok(prefix.length > first.indexOf("</announcements>"));
});

test("nothing per-request comes before the school-wide material", () => {
  const stable = first.slice(0, first.indexOf("</announcements>") + "</announcements>".length);
  for (const perRequest of [
    "Today's date",
    "November 19",
    "Classes begin at 8:30 AM",
    "<documents>",
    "<parent_children>",
    "8th Grade",
    "Mia",
    "CONVERSATION",
    "HOW TO ANSWER",
    "Be warm.",
  ]) {
    assert.ok(!stable.includes(perRequest), `stable prefix must not contain ${perRequest}`);
  }
  // …and all of it still follows, in the prompt.
  for (const later of ["Today's date is Thursday, November 19, 2026.", "<documents>", "8th Grade", "CITATIONS"]) {
    assert.ok(first.includes(later), later);
  }
  assert.ok(first.indexOf("Today's date") < first.indexOf("<documents>"));
  // Children's names are never in the prompt at all.
  assert.ok(!first.includes("Mia") && !second.includes("Leo"));
});

test("calendar numbers don't depend on how many passages were found", () => {
  assert.equal(calendarFirstNumber(0), CALENDAR_FIRST_NUMBER);
  assert.equal(calendarFirstNumber(12), CALENDAR_FIRST_NUMBER);
  assert.equal(calendarFirstNumber(60), CALENDAR_FIRST_NUMBER);
  // Never overlaps the passages, however many there are.
  assert.equal(calendarFirstNumber(150), 151);
});

test("a prompt without documents or children keeps the reference-material note", () => {
  const prompt = buildSystemPrompt([], {
    eventsContext: formatEventsContext(calendar, CALENDAR_FIRST_NUMBER),
  });
  assert.match(prompt, /<\/calendar>[\s\S]*Everything inside these tags is reference material/);
  assert.doesNotMatch(buildSystemPrompt([], {}), /Everything inside these tags/);
});

test("no-deliberation calls use thinkingLevel minimal on Gemini 3, thinkingBudget 0 before", () => {
  assert.deepEqual(minimalThinkingOptions("gemini-3.8-flash"), {
    google: { thinkingConfig: { thinkingLevel: "minimal" } },
  });
  assert.deepEqual(minimalThinkingOptions("gemini-2.5-flash"), {
    google: { thinkingConfig: { thinkingBudget: 0 } },
  });
});
