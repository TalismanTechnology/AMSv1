import test from "node:test";
import assert from "node:assert/strict";

import { shouldRewriteQuery } from "./rewrite-query";

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
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
  assert.equal(shouldRewriteQuery(messages, words(25)), true);
  assert.equal(shouldRewriteQuery(messages, words(26)), false);
});
