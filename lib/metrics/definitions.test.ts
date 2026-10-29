import { test } from "node:test";
import assert from "node:assert/strict";
import { hashAsker } from "@/lib/insights/scrub";
import {
  activeParentKeys,
  answerRate,
  answerRateOf,
  averagePerDay,
  computeHeadlineMetrics,
  countActiveParents,
  countDistinct,
  countDistinctSince,
  dailyCounts,
  documentTypeCounts,
  eventsWindowStart,
  hourlyCounts,
  isUnansweredEvent,
  memberPair,
  parentCounts,
  parentGrowth,
  seriesDays,
  sessionQuestionKey,
  type MetricInputs,
  type ParentMembershipRow,
  type QuestionEventRow,
} from "./definitions";
import type { MetricRange } from "./windows";

const NOW = new Date("2026-10-28T15:00:00Z"); // 11:00 EDT, Oct 28
const SECRET = "test-secret";

function event(overrides: Partial<QuestionEventRow> & { created_at: string }): QuestionEventRow {
  return {
    id: overrides.id ?? `e-${Math.random()}`,
    school_id: "s1",
    user_id: null,
    unanswered: false,
    session_id: null,
    question: null,
    asker: null,
    asker_parent: null,
    ...overrides,
  };
}

const member = (
  user_id: string,
  created_at: string,
  approved: boolean | null = true,
  school_id = "s1"
): ParentMembershipRow => ({ user_id, school_id, created_at, approved });

// --- counting ---

test("countDistinct ignores empty keys and repeats", () => {
  assert.equal(countDistinct(["a", "b", "a", null, undefined, ""]), 2);
  assert.equal(countDistinct([]), 0);
});

test("countDistinctSince counts each user once from the cutoff", () => {
  const since = new Date("2026-10-28T04:00:00Z");
  const rows = [
    { user_id: "u1", created_at: "2026-10-28T05:00:00Z" },
    { user_id: "u1", created_at: "2026-10-28T06:00:00Z" },
    { user_id: "u2", created_at: "2026-10-28T04:00:00Z" },
    { user_id: "u3", created_at: "2026-10-28T03:59:59Z" },
    { user_id: null, created_at: "2026-10-28T07:00:00Z" },
  ];
  assert.equal(countDistinctSince(rows, since), 2);
});

test("averagePerDay divides by the stated window, one decimal", () => {
  assert.equal(averagePerDay(10, 7), 1.4);
  assert.equal(averagePerDay(70, 7), 10);
  assert.equal(averagePerDay(0, 7), 0);
  assert.equal(averagePerDay(5, 0), 0);
});

// --- parents ---

test("parentCounts: approved memberships are parents, the rest pending, distinct users", () => {
  const rows = [
    member("u1", "2025-01-01T12:00:00Z"),
    member("u1", "2026-10-28T12:00:00Z", true, "s2"), // second school: not new, counted once
    member("u2", "2026-10-28T05:00:00Z"), // joined today ET
    member("u3", "2026-10-23T12:00:00Z"), // within 7 days
    member("u4", "2026-10-28T06:00:00Z", false), // pending
    member("u5", "2026-10-28T06:00:00Z", null), // not approved either
  ];
  assert.deepEqual(parentCounts(rows, NOW), { total: 3, pending: 2, newToday: 1, new7d: 2 });
});

test("'today' starts at Eastern midnight, not UTC midnight", () => {
  // 03:00Z Oct 28 = 23:00 EDT Oct 27: yesterday in ET (it was "today" in UTC).
  const rows = [member("u1", "2026-10-28T03:00:00Z")];
  assert.equal(parentCounts(rows, NOW).newToday, 0);
});

test("parentGrowth is cumulative by first approved membership, per Eastern day", () => {
  const rows = [
    member("u1", "2026-01-01T12:00:00Z"),
    member("u2", "2026-10-27T12:00:00Z"),
    member("u2", "2026-10-28T12:00:00Z", true, "s2"),
    member("u3", "2026-10-28T12:00:00Z", false),
  ];
  assert.deepEqual(parentGrowth(rows, ["2026-10-26", "2026-10-27", "2026-10-28"]), [
    { date: "2026-10-26", total: 1 },
    { date: "2026-10-27", total: 2 },
    { date: "2026-10-28", total: 2 },
  ]);
});

// --- active parents ---

test("active parents: one key per parent either side of the scrub, non-parents excluded", () => {
  const pairs = new Set([memberPair("s1", "p1"), memberPair("s1", "p2")]);
  const since = new Date("2026-10-22T04:00:00Z");
  const events = [
    event({ user_id: "p1", created_at: "2026-10-28T12:00:00Z" }), // fresh
    event({ asker: hashAsker("s1", "p1", SECRET), asker_parent: true, created_at: "2026-10-27T12:00:00Z" }), // same parent, scrubbed
    event({ user_id: "p2", created_at: "2026-10-26T12:00:00Z" }),
    event({ user_id: "admin", created_at: "2026-10-26T12:00:00Z" }), // not a parent
    event({ asker: "staffhash", asker_parent: false, created_at: "2026-10-26T12:00:00Z" }),
    event({ user_id: "p2", created_at: "2026-10-01T12:00:00Z" }), // before the window
    event({ user_id: "p1", school_id: null, created_at: "2026-10-28T12:00:00Z" }),
  ];
  assert.equal(countActiveParents(events, since, pairs, SECRET), 2);
});

test("active parents across schools are summed per school", () => {
  const pairs = new Set([memberPair("s1", "p1"), memberPair("s2", "p1")]);
  const events = [
    event({ user_id: "p1", school_id: "s1", created_at: "2026-10-28T12:00:00Z" }),
    event({ user_id: "p1", school_id: "s2", created_at: "2026-10-28T12:00:00Z" }),
  ];
  const bySchool = activeParentKeys(events, null, pairs, SECRET);
  assert.equal(bySchool.get("s1")?.size, 1);
  assert.equal(countActiveParents(events, null, pairs, SECRET), 2);
});

// --- answer rate ---

test("isUnansweredEvent prefers the explicit metadata flag", () => {
  const keys = new Set([sessionQuestionKey("s1", "When is lunch?")]);
  assert.equal(isUnansweredEvent({ unanswered: false, sessionId: "s1", question: "When is lunch?" }, keys), false);
  assert.equal(isUnansweredEvent({ unanswered: true, sessionId: "s2", question: "x" }, keys), true);
});

test("isUnansweredEvent falls back to a same-session, same-text match", () => {
  const keys = new Set([sessionQuestionKey("s1", "When is lunch?")]);
  assert.equal(isUnansweredEvent({ sessionId: "s1", question: "When is lunch?" }, keys), true);
  assert.equal(isUnansweredEvent({ sessionId: "s2", question: "When is lunch?" }, keys), false);
  assert.equal(isUnansweredEvent({ sessionId: "s1", question: "when is lunch?" }, keys), false);
  assert.equal(isUnansweredEvent({ sessionId: null, question: "When is lunch?" }, keys), false);
});

test("answerRate is a whole percentage and null with no questions", () => {
  assert.equal(answerRate(0, 0), null);
  assert.equal(answerRate(10, 0), 100);
  assert.equal(answerRate(3, 1), 67);
  assert.equal(answerRate(4, 4), 0);
  assert.equal(answerRate(4, 9), 0);
});

test("answerRateOf uses the flag, then the legacy match", () => {
  const keys = new Set([sessionQuestionKey("sess", "Q?")]);
  const events = [
    event({ unanswered: true, created_at: NOW.toISOString() }),
    event({ unanswered: undefined, session_id: "sess", question: "Q?", created_at: NOW.toISOString() }),
    event({ unanswered: false, created_at: NOW.toISOString() }),
    event({ unanswered: false, created_at: NOW.toISOString() }),
  ];
  assert.equal(answerRateOf(events, keys), 50);
  assert.equal(answerRateOf([], keys), null);
});

// --- series & documents ---

test("dailyCounts and hourlyCounts use Eastern days and hours", () => {
  const ts = ["2026-10-28T03:30:00Z", "2026-10-28T14:00:00Z"]; // 23:30 Oct 27, 10:00 Oct 28 ET
  assert.deepEqual(dailyCounts(ts, ["2026-10-27", "2026-10-28"]), [
    { date: "2026-10-27", count: 1 },
    { date: "2026-10-28", count: 1 },
  ]);
  const hours = hourlyCounts(ts);
  assert.equal(hours.length, 24);
  assert.equal(hours[23].count, 1);
  assert.equal(hours[10].count, 1);
  assert.equal(hours[3].count, 0);
});

test("documentTypeCounts normalizes MIME types", () => {
  assert.deepEqual(
    documentTypeCounts([
      { file_type: "application/pdf" },
      { file_type: "application/pdf" },
      { file_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      { file_type: null },
    ]),
    [
      { type: "PDF", count: 2 },
      { type: "DOCX", count: 1 },
      { type: "Other", count: 1 },
    ]
  );
});

// --- windows needed ---

test("events are loaded far enough back for the range and the fixed windows", () => {
  assert.equal(eventsWindowStart("7d", NOW)!.toISOString(), "2026-09-29T04:00:00.000Z"); // 30 ET days
  assert.equal(eventsWindowStart("90d", NOW)!.toISOString(), "2026-07-31T04:00:00.000Z");
  assert.equal(eventsWindowStart("all", NOW), null);
});

test("the all-time series starts at the first question or parent (at least 30 days)", () => {
  const base = { now: NOW, memberships: [] as ParentMembershipRow[] };
  assert.equal(seriesDays("all", { ...base, events: [] }), 30);
  assert.equal(
    seriesDays("all", { ...base, events: [event({ created_at: "2026-06-01T12:00:00Z" })] }),
    150
  );
  assert.equal(seriesDays("7d", { ...base, events: [] }), 7);
});

// --- headline ---

function inputs(range: MetricRange, overrides: Partial<MetricInputs> = {}): MetricInputs {
  return {
    now: NOW,
    range,
    memberships: [
      member("p1", "2026-01-01T12:00:00Z"),
      member("p2", "2026-10-28T05:00:00Z"),
      member("p3", "2026-10-28T05:00:00Z", false),
    ],
    events: [
      event({ user_id: "p1", created_at: "2026-10-28T13:00:00Z" }), // today
      event({ user_id: "p1", created_at: "2026-10-28T03:00:00Z" }), // yesterday ET
      event({ user_id: "p2", unanswered: true, created_at: "2026-10-25T12:00:00Z" }),
      event({ user_id: "p1", created_at: "2026-10-10T12:00:00Z" }), // in 30d, not 7d
      event({ user_id: "p2", created_at: "2026-09-01T12:00:00Z" }), // older than 30d
    ],
    unansweredKeys: new Set(),
    questionsAllTime: 40,
    secret: SECRET,
    ...overrides,
  };
}

test("headline metrics: every window as labelled", () => {
  const m = computeHeadlineMetrics(inputs("30d"));
  assert.deepEqual(m.parents, { total: 2, pending: 1, newToday: 1, new7d: 1 });
  assert.equal(m.questions.allTime, 40);
  assert.equal(m.questions.today, 1);
  assert.equal(m.questions.last7d, 3);
  assert.equal(m.questions.inRange, 4);
  assert.equal(m.questions.avgPerDay7d, averagePerDay(3, 7));
  assert.equal(m.activeParents.last7d, 2);
  assert.equal(m.activeParents.inRange, 2);
  assert.equal(m.answerRate.inRange, 75);
  assert.equal(m.answerRate.last30d, 75);
  assert.equal(m.labels.range, "Last 30 days");
  assert.equal(m.labels.today, "Today (ET)");
  assert.equal(m.questionsByDay.length, 30);
  // The ranged number is exactly the sum of the chart.
  assert.equal(m.questionsByDay.reduce((s, d) => s + d.count, 0), m.questions.inRange);
  assert.equal(m.questionsByHour.reduce((s, h) => s + h.count, 0), m.questions.inRange);
  assert.equal(m.parentGrowth.at(-1)?.total, m.parents.total);
});

test("the fixed-window numbers don't depend on the selected range", () => {
  const a = computeHeadlineMetrics(inputs("7d"));
  const b = computeHeadlineMetrics(inputs("30d"));
  const c = computeHeadlineMetrics(inputs("all"));
  for (const m of [a, c]) {
    assert.deepEqual(m.parents, b.parents);
    assert.equal(m.activeParents.last7d, b.activeParents.last7d);
    assert.equal(m.questions.today, b.questions.today);
    assert.equal(m.questions.last7d, b.questions.last7d);
    assert.equal(m.questions.avgPerDay7d, b.questions.avgPerDay7d);
    assert.equal(m.questions.allTime, b.questions.allTime);
    assert.equal(m.answerRate.last30d, b.answerRate.last30d);
  }
  assert.equal(a.questions.inRange, a.questions.last7d);
  assert.equal(c.questions.inRange, 5);
});

test("avg per day is the 7-day count over 7, not the all-time total over 7", () => {
  const m = computeHeadlineMetrics(inputs("7d", { questionsAllTime: 700 }));
  assert.equal(m.questions.avgPerDay7d, averagePerDay(3, 7));
  assert.notEqual(m.questions.avgPerDay7d, 100);
});
