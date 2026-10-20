import test from "node:test";
import assert from "node:assert/strict";

import {
  SCRUB_MAX_AGE_HOURS,
  askerHashSecret,
  askerKey,
  hashAsker,
  isScrubbed,
  scrubQuestionMetadata,
  shouldScrub,
} from "./scrub";
import { summarizeTopics } from "./aggregate";

const SECRET = "test-secret";

test("asker hash is stable, keyed, school-scoped and truncated hex", () => {
  const a = hashAsker("school-1", "user-1", SECRET);
  assert.equal(a, hashAsker("school-1", "user-1", SECRET));
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, hashAsker("school-1", "user-2", SECRET));
  assert.notEqual(a, hashAsker("school-2", "user-1", SECRET));
  assert.notEqual(a, hashAsker("school-1", "user-1", "other-secret"));
  assert.ok(!a.includes("user-1"));
  // Pinned so a change to the scheme (which would split counts) is noticed.
  assert.equal(a, "c6ccf1d3cd5f23a67749451d7fee257f");
});

test("asker hash secret: dedicated env first, then CRON_SECRET", () => {
  assert.equal(askerHashSecret({ ANALYTICS_HASH_SECRET: "a", CRON_SECRET: "c" }), "a");
  assert.equal(askerHashSecret({ CRON_SECRET: "c" }), "c");
  assert.equal(askerHashSecret({}), null);
});

test("askerKey: one key per parent before and after the scrub", () => {
  const before = askerKey({ user_id: "user-1" }, "school-1", SECRET);
  const after = askerKey(
    { user_id: null, asker: hashAsker("school-1", "user-1", SECRET) },
    "school-1",
    SECRET
  );
  assert.equal(before, after);
  assert.equal(askerKey({ user_id: null }, "school-1", SECRET), null);
  // No secret configured: fall back to the raw id.
  assert.equal(askerKey({ user_id: "user-1" }, "school-1", null), "user-1");
});

test("scrub removes question text, session link and anything unknown", () => {
  const out = scrubQuestionMetadata({
    metadata: {
      question: "Is Emma's allergy form in?",
      session_id: "sess-1",
      source_count: 3,
      unanswered: false,
      source_document_ids: ["doc-1", 42, "doc-2"],
      note: "free text",
    },
    asker: "abc123",
    askerIsParent: true,
  });
  assert.deepEqual(out, {
    unanswered: false,
    source_count: 3,
    source_document_ids: ["doc-1", "doc-2"],
    asker: "abc123",
    asker_parent: true,
    scrubbed: true,
  });
  assert.ok(!JSON.stringify(out).includes("Emma"));
  assert.ok(!JSON.stringify(out).includes("sess-1"));
  assert.equal(isScrubbed(out), true);
  assert.equal(isScrubbed({ question: "x" }), false);
});

test("scrub resolves the answer flag for legacy events, never overriding a stored one", () => {
  const legacy = scrubQuestionMetadata({
    metadata: { question: "q", session_id: "s" },
    asker: null,
    askerIsParent: false,
    unanswered: true,
  });
  assert.equal(legacy.unanswered, true);
  assert.equal("asker" in legacy, false);
  assert.equal(legacy.asker_parent, false);

  const stored = scrubQuestionMetadata({
    metadata: { unanswered: false },
    asker: null,
    askerIsParent: false,
    unanswered: true,
  });
  assert.equal(stored.unanswered, false);

  const empty = scrubQuestionMetadata({ metadata: null, asker: null, askerIsParent: false });
  assert.deepEqual(empty, { asker_parent: false, scrubbed: true });
});

test("shouldScrub: once labeled, or at the max age regardless", () => {
  const now = new Date(Date.UTC(2026, 9, 19, 12, 0));
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  assert.equal(SCRUB_MAX_AGE_HOURS, 24);
  assert.equal(shouldScrub({ created_at: hoursAgo(1), labeled: true }, now), true);
  assert.equal(shouldScrub({ created_at: hoursAgo(1), labeled: false }, now), false);
  assert.equal(shouldScrub({ created_at: hoursAgo(24), labeled: false }, now), true);
});

test("topics still meet k-anonymity with a mix of scrubbed and fresh events", () => {
  const key = (u: string) => askerKey({ user_id: u }, "school-1", SECRET);
  const scrubbed = (u: string) =>
    askerKey({ user_id: null, asker: hashAsker("school-1", u, SECRET) }, "school-1", SECRET);
  const { topics } = summarizeTopics([
    { topic: "Lunch Menu", askerId: scrubbed("a") },
    { topic: "Lunch Menu", askerId: scrubbed("b") },
    { topic: "Lunch Menu", askerId: key("c") },
    // the same parent before/after the scrub counts once
    { topic: "Dress Code", askerId: scrubbed("a") },
    { topic: "Dress Code", askerId: key("a") },
    { topic: "Dress Code", askerId: key("b") },
  ]);
  assert.deepEqual(topics, [{ label: "Lunch Menu", count: 3 }]);
});
