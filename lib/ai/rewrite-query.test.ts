import test from "node:test";
import assert from "node:assert/strict";

import { looksLikeFollowUp, shouldRewriteQuery } from "./rewrite-query";

const user = (text: string) => ({ role: "user", parts: [{ type: "text", text }] });
const assistant = (text: string) => ({ role: "assistant", parts: [{ type: "text", text }] });

test("the first question is never rewritten — there is nothing to resolve", () => {
  assert.equal(shouldRewriteQuery([], "What time does school start?"), false);
  assert.equal(shouldRewriteQuery([user("What about Wednesdays?")], "What about Wednesdays?"), false);
});

test("a short follow-up is rewritten", () => {
  const messages = [
    user("When is pickup?"),
    assistant("Pickup is at 3:15 PM [1]."),
    user("What about Wednesdays?"),
  ];
  assert.equal(shouldRewriteQuery(messages, "What about Wednesdays?"), true);
});

test("assistant turns alone don't make a question a follow-up", () => {
  const messages = [assistant("Hi! Ask me anything."), user("What about Wednesdays?")];
  assert.equal(shouldRewriteQuery(messages, "What about Wednesdays?"), false);
});

test("a follow-up long enough to stand on its own skips the rewrite", () => {
  const messages = [user("When is pickup?"), assistant("3:15 PM."), user("…")];
  const words = (n: number) =>
    ["and", ...Array.from({ length: n - 1 }, (_, i) => `word${i}`)].join(" ");
  assert.equal(shouldRewriteQuery(messages, words(25)), true);
  assert.equal(shouldRewriteQuery(messages, words(26)), false);
});

test("a standalone question after other topics is searched as-is (recap regression)", () => {
  const messages = [
    user("when are finals"),
    assistant("Finals are June 2-5 [1]."),
    user("what are the dress down days?"),
    assistant("Dress down days are Fridays [1]."),
    user("what is the current ranking for 8th grade collegiate soccer?"),
  ];
  assert.equal(
    shouldRewriteQuery(messages, "what is the current ranking for 8th grade collegiate soccer?"),
    false
  );
  assert.equal(shouldRewriteQuery(messages, "what are the dress down days?"), false);
});

test("follow-ups that refer back are recognised", () => {
  for (const q of [
    "What about Wednesdays?",
    "and my other kid?",
    "Is it the same for 8th grade?",
    "Wednesdays?",
    "8th grade?",
    "When does that start?",
    "Do they need a uniform?",
    "How about the younger one?",
  ]) {
    assert.equal(looksLikeFollowUp(q), true, q);
  }
  for (const q of [
    "when are finals",
    "what is the current ranking for 8th grade collegiate soccer?",
    "What time does school start on Mondays?",
    "Who is the middle school principal?",
  ]) {
    assert.equal(looksLikeFollowUp(q), false, q);
  }
});
