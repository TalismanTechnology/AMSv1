import test from "node:test";
import assert from "node:assert/strict";

import { shouldAutoTitle } from "./chat-view";

test("auto-title: a session's first stored question titles it", () => {
  assert.equal(shouldAutoTitle({ title: "New chat", priorMessageCount: 0 }), true);
  assert.equal(shouldAutoTitle({ title: "What time is pickup?", priorMessageCount: 0 }), true);
});

test("auto-title: an untitled session gets a title", () => {
  assert.equal(shouldAutoTitle({ title: null, priorMessageCount: 4 }), true);
  assert.equal(shouldAutoTitle({ title: "  ", priorMessageCount: 4 }), true);
});

test("auto-title: a session with history keeps its title", () => {
  // The prod bug: the client sent only 1 user message for an old session.
  assert.equal(shouldAutoTitle({ title: "Lunch menu", priorMessageCount: 6 }), false);
});

test("auto-title: an unknown message count keeps the title", () => {
  assert.equal(shouldAutoTitle({ title: "Lunch menu", priorMessageCount: null }), false);
});
