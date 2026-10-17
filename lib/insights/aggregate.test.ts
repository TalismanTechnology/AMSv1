import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerRate,
  groupFlaggedQuestions,
  isUnansweredEvent,
  matchExistingTopic,
  normalizeQuestion,
  parseRangeDays,
  sanitizeTopic,
  sessionQuestionKey,
  summarizeTopics,
  type FlaggedQuestion,
} from "./aggregate";

// --- range ---

test("parseRangeDays accepts 7/30/90 and defaults to 30", () => {
  assert.equal(parseRangeDays("7"), 7);
  assert.equal(parseRangeDays(90), 90);
  assert.equal(parseRangeDays("30"), 30);
  assert.equal(parseRangeDays("365"), 30);
  assert.equal(parseRangeDays(undefined), 30);
  assert.equal(parseRangeDays("abc"), 30);
});

// --- sanitizeTopic ---

test("sanitizeTopic trims quotes and punctuation at the ends", () => {
  assert.equal(sanitizeTopic('  "Lunch Menu."  '), "Lunch Menu");
  assert.equal(sanitizeTopic("**Dress Code**"), "Dress Code");
  assert.equal(sanitizeTopic("Sports   Schedule"), "Sports Schedule");
  assert.equal(sanitizeTopic("“Pick-up Times”"), "Pick-up Times");
});

test("sanitizeTopic caps length at a word boundary", () => {
  const out = sanitizeTopic("Extremely Long Topic Label That Goes On And On Forever");
  assert.ok(out.length <= 40, out);
  assert.equal(out, "Extremely Long Topic Label That Goes On");
  assert.equal(sanitizeTopic("x".repeat(60)).length, 40);
});

test("sanitizeTopic falls back to Other for unusable output", () => {
  assert.equal(sanitizeTopic(""), "Other");
  assert.equal(sanitizeTopic("  ...  "), "Other");
  assert.equal(sanitizeTopic(null), "Other");
  assert.equal(sanitizeTopic(42), "Other");
});

test("matchExistingTopic reuses an existing label case-insensitively", () => {
  assert.equal(matchExistingTopic("lunch menu", ["Dress Code", "Lunch Menu"]), "Lunch Menu");
  assert.equal(matchExistingTopic("Bus Routes", ["Lunch Menu"]), "Bus Routes");
});

// --- k-anonymity ---

test("summarizeTopics hides topics under 3 questions or 3 distinct askers", () => {
  const rows = [
    // 3 questions, 3 askers → shown
    { topic: "Lunch Menu", askerId: "a" },
    { topic: "Lunch Menu", askerId: "b" },
    { topic: "Lunch Menu", askerId: "c" },
    // 5 questions but 1 asker → hidden
    ...Array.from({ length: 5 }, () => ({ topic: "Dress Code", askerId: "a" })),
    // 2 questions, 2 askers → hidden
    { topic: "Bus Routes", askerId: "a" },
    { topic: "Bus Routes", askerId: "b" },
    // 4 questions, 3 askers + one with no user → shown
    { topic: "Sports Schedule", askerId: "a" },
    { topic: "Sports Schedule", askerId: "b" },
    { topic: "Sports Schedule", askerId: "c" },
    { topic: "Sports Schedule", askerId: null },
  ];
  const { topics, hiddenTopicCount } = summarizeTopics(rows);
  assert.deepEqual(topics, [
    { label: "Sports Schedule", count: 4 },
    { label: "Lunch Menu", count: 3 },
  ]);
  assert.equal(hiddenTopicCount, 2);
});

test("summarizeTopics does not count null askers as distinct", () => {
  const rows = [
    { topic: "Other", askerId: null },
    { topic: "Other", askerId: null },
    { topic: "Other", askerId: null },
    { topic: "Other", askerId: "a" },
  ];
  assert.deepEqual(summarizeTopics(rows), { topics: [], hiddenTopicCount: 1 });
});

test("summarizeTopics returns only labels and counts", () => {
  const rows = ["a", "b", "c"].map((askerId) => ({ topic: "Lunch Menu", askerId }));
  const { topics } = summarizeTopics(rows);
  assert.deepEqual(Object.keys(topics[0]).sort(), ["count", "label"]);
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

// --- flagged grouping ---

test("normalizeQuestion lowercases, collapses whitespace, strips trailing punctuation", () => {
  assert.equal(normalizeQuestion("  When IS   the Book Fair??  "), "when is the book fair");
  assert.equal(normalizeQuestion("Is there school Monday?!."), "is there school monday");
  assert.equal(normalizeQuestion("what's up..."), "what's up");
});

function q(text: string, createdAt: string, extra: Partial<FlaggedQuestion> = {}): FlaggedQuestion {
  return { text, createdAt, reason: "unanswered", ...extra };
}

test("groupFlaggedQuestions groups by cluster, then normalized text", () => {
  const groups = groupFlaggedQuestions([
    q("Is there a book fair?", "2026-10-01T00:00:00Z", { clusterId: "c1", clusterLabel: "Book Fair Dates" }),
    q("When is the book fair", "2026-10-03T00:00:00Z", { clusterId: "c1", clusterLabel: "Book Fair Dates" }),
    q("Where do I park?", "2026-10-02T00:00:00Z"),
    q("where do I  park", "2026-10-04T00:00:00Z", { reason: "unhelpful" }),
    q("What time is pickup?", "2026-10-05T00:00:00Z"),
  ]);
  assert.deepEqual(groups, [
    {
      key: "q:where do i park",
      text: "where do I park",
      count: 2,
      lastAskedAt: "2026-10-04T00:00:00Z",
      reasons: ["unanswered", "unhelpful"],
    },
    {
      key: "cluster:c1",
      text: "Book Fair Dates",
      count: 2,
      lastAskedAt: "2026-10-03T00:00:00Z",
      reasons: ["unanswered"],
    },
    {
      key: "q:what time is pickup",
      text: "What time is pickup?",
      count: 1,
      lastAskedAt: "2026-10-05T00:00:00Z",
      reasons: ["unanswered"],
    },
  ]);
});

test("groupFlaggedQuestions uses latest question text when a cluster has no label", () => {
  const [g] = groupFlaggedQuestions([
    q("Old wording", "2026-10-01T00:00:00Z", { clusterId: "c1" }),
    q("Newest wording", "2026-10-09T00:00:00Z", { clusterId: "c1", clusterLabel: "  " }),
  ]);
  assert.equal(g.text, "Newest wording");
});

test("an unclustered question joins a cluster with the same normalized text", () => {
  const groups = groupFlaggedQuestions([
    q("Is there a book fair?", "2026-10-01T00:00:00Z", { clusterId: "c1", clusterLabel: "Book Fair" }),
    q("is there a book fair", "2026-10-02T00:00:00Z", { reason: "unhelpful" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].reasons, ["unanswered", "unhelpful"]);
});

test("the same exchange flagged twice counts once with both reasons", () => {
  const groups = groupFlaggedQuestions([
    q("Lunch?", "2026-10-01T00:00:00Z", { dedupeKey: "s1|lunch" }),
    q("Lunch?", "2026-10-01T00:00:01Z", { dedupeKey: "s1|lunch", reason: "unhelpful" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 1);
  assert.deepEqual(groups[0].reasons, ["unanswered", "unhelpful"]);
});

test("groupFlaggedQuestions sorts by count then recency and caps the list", () => {
  const items = Array.from({ length: 30 }, (_, i) =>
    q(`Question ${i}`, `2026-10-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`)
  );
  items.push(q("Question 0", "2026-09-01T00:00:00Z"));
  const groups = groupFlaggedQuestions(items, 25);
  assert.equal(groups.length, 25);
  assert.equal(groups[0].key, "q:question 0");
  assert.equal(groups[1].lastAskedAt, "2026-10-28T00:00:00Z");
  // returned groups carry no ids beyond the group key
  assert.deepEqual(Object.keys(groups[0]).sort(), ["count", "key", "lastAskedAt", "reasons", "text"]);
});

test("groupFlaggedQuestions skips empty questions", () => {
  assert.deepEqual(groupFlaggedQuestions([q("   ", "2026-10-01T00:00:00Z")]), []);
});
