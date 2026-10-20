import test from "node:test";
import assert from "node:assert/strict";

import {
  applyLoadedMessages,
  bindCreatedSession,
  canMountChat,
  initialChatView,
  newChatView,
  openChatView,
  selectChatView,
  shouldAutoTitle,
} from "./chat-view";

const sessions = [{ id: "latest" }, { id: "older" }];

test("page open starts a fresh chat, not the latest session", () => {
  const view = initialChatView(sessions);
  assert.equal(view.sessionId, null);
  assert.ok(view.key.startsWith("new"));
  assert.ok(canMountChat(view));
});

test("?chat=<id> reopens that chat, loading first", () => {
  const view = initialChatView(sessions, "older");
  assert.equal(view.sessionId, "older");
  assert.equal(view.messages, null);
  assert.equal(canMountChat(view), false);
});

test("?chat= naming an unknown or hidden chat starts fresh", () => {
  assert.equal(initialChatView(sessions, "someone-else").sessionId, null);
  assert.equal(initialChatView([], "latest").sessionId, null);
  assert.equal(initialChatView(sessions, "").sessionId, null);
});

test("a reopened chat can't be sent into until its messages load", () => {
  const view = openChatView("older");
  assert.equal(canMountChat(view), false);
  const loaded = applyLoadedMessages(view, "older", { messages: [{ id: "m1" }] });
  assert.deepEqual(loaded.messages, [{ id: "m1" }]);
  assert.ok(canMountChat(loaded));
});

test("an empty stored chat still mounts once loaded", () => {
  const loaded = applyLoadedMessages(openChatView("older"), "older", {});
  assert.deepEqual(loaded.messages, []);
  assert.ok(canMountChat(loaded));
});

test("a failed load never mounts the chat", () => {
  const failed = applyLoadedMessages(openChatView("older"), "older", {
    error: "Chat not found",
    messages: [],
  });
  assert.equal(failed.error, "Chat not found");
  assert.equal(canMountChat(failed), false);
});

test("a stale load for a chat the parent left is ignored", () => {
  const nowOnLatest = openChatView("latest");
  assert.equal(
    applyLoadedMessages(nowOnLatest, "older", { messages: [{ id: "x" }] }),
    nowOnLatest
  );
  const fresh = newChatView("new-1");
  assert.equal(applyLoadedMessages(fresh, "older", { messages: [] }), fresh);
});

test("a late duplicate load doesn't replace messages already shown", () => {
  const loaded = applyLoadedMessages(openChatView("a"), "a", { messages: [{ id: "1" }] });
  assert.equal(applyLoadedMessages(loaded, "a", { messages: [] }), loaded);
});

test("a new chat binds its created session without remounting", () => {
  const bound = bindCreatedSession(newChatView("new-1"), "created");
  assert.equal(bound.key, "new-1");
  assert.equal(bound.sessionId, "created");
  assert.ok(canMountChat(bound));
  // Selecting it in the sidebar keeps the live chat rather than reloading it.
  assert.equal(selectChatView(bound, "created"), bound);
});

test("selecting another chat loads it", () => {
  const view = selectChatView(newChatView("new-1"), "older");
  assert.equal(view.key, "older");
  assert.equal(view.sessionId, "older");
  assert.equal(canMountChat(view), false);
});

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
