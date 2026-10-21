import test from "node:test";
import assert from "node:assert/strict";

import {
  CHAT_TITLE_MAX,
  applyLoadedMessages,
  bindCreatedSession,
  canMountChat,
  chatDisplayTitle,
  groupChatsByDate,
  loadedChatView,
  newChatView,
  normalizeChatTitle,
  openChatView,
  parentChatHeading,
  selectChatView,
  shouldAutoTitle,
  sortChatsByActivity,
} from "./chat-view";

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

test("parent chat heading: the school's name, never a session title", () => {
  assert.equal(parentChatHeading("Collegiate School"), "Collegiate School");
  assert.equal(parentChatHeading("  Collegiate  "), "Collegiate");
});

test("parent chat heading: neutral fallback without a real school name", () => {
  assert.equal(parentChatHeading(""), "Ask about your school");
  assert.equal(parentChatHeading(null), "Ask about your school");
  assert.equal(parentChatHeading(undefined), "Ask about your school");
  assert.equal(parentChatHeading("AskMySchool"), "Ask about your school");
});

// --- Grouping (local time) ---------------------------------------------------

// Local-time dates, so these hold in any test timezone.
const local = (y: number, mo: number, d: number, h = 12, mi = 0) =>
  new Date(y, mo, d, h, mi).toISOString();
const NOW_LOCAL = new Date(2026, 9, 20, 9, 30); // Tue 20 Oct 2026, 09:30 local

test("grouping: today, yesterday, previous 7 days, older — by local calendar day", () => {
  const sessions = [
    { id: "older", updated_at: local(2026, 9, 11, 23, 59) }, // 9 days ago
    { id: "today-early", updated_at: local(2026, 9, 20, 0, 0) },
    { id: "yesterday-late", updated_at: local(2026, 9, 19, 23, 59) },
    { id: "yesterday-early", updated_at: local(2026, 9, 19, 0, 0) },
    { id: "week-start", updated_at: local(2026, 9, 12, 0, 0) }, // 8 days ago
    { id: "week-end", updated_at: local(2026, 9, 18, 23, 59) }, // 2 days ago
    { id: "today-late", updated_at: local(2026, 9, 20, 9, 0) },
  ];
  const groups = groupChatsByDate(sessions, NOW_LOCAL);
  assert.deepEqual(
    groups.map((g) => [g.label, g.sessions.map((s) => s.id)]),
    [
      ["Today", ["today-late", "today-early"]],
      ["Yesterday", ["yesterday-late", "yesterday-early"]],
      ["Previous 7 days", ["week-end", "week-start"]],
      ["Older", ["older"]],
    ]
  );
});

test("grouping: empty groups are left out; future and bad timestamps are handled", () => {
  assert.deepEqual(groupChatsByDate([], NOW_LOCAL), []);
  const groups = groupChatsByDate(
    [
      { id: "skew", updated_at: local(2026, 9, 20, 9, 45) },
      { id: "bad", updated_at: "nope" },
    ],
    NOW_LOCAL
  );
  assert.deepEqual(
    groups.map((g) => [g.label, g.sessions.map((s) => s.id)]),
    [
      ["Today", ["skew"]],
      ["Older", ["bad"]],
    ]
  );
});

test("grouping: just after midnight, last evening is yesterday", () => {
  const groups = groupChatsByDate(
    [{ id: "evening", updated_at: local(2026, 9, 19, 22, 0) }],
    new Date(2026, 9, 20, 0, 5)
  );
  assert.equal(groups[0].label, "Yesterday");
});

test("sortChatsByActivity: most recent first, without mutating", () => {
  const list = [
    { id: "a", updated_at: local(2026, 9, 1) },
    { id: "b", updated_at: local(2026, 9, 3) },
    { id: "c", updated_at: local(2026, 9, 2) },
  ];
  assert.deepEqual(sortChatsByActivity(list).map((s) => s.id), ["b", "c", "a"]);
  assert.deepEqual(list.map((s) => s.id), ["a", "b", "c"]);
});

// --- Titles -------------------------------------------------------------------

test("chat names: trimmed, single-spaced, capped; blank is rejected", () => {
  assert.equal(normalizeChatTitle("  Lunch   menu\n "), "Lunch menu");
  assert.equal(normalizeChatTitle("   "), null);
  assert.equal(normalizeChatTitle("x".repeat(200))?.length, CHAT_TITLE_MAX);
  assert.equal(chatDisplayTitle(null), "New chat");
  assert.equal(chatDisplayTitle("  "), "New chat");
  assert.equal(chatDisplayTitle("Pickup"), "Pickup");
});

// --- The open chat ------------------------------------------------------------

test("view: a new chat has no session; a reopened one waits for its messages", () => {
  const fresh = newChatView("new-1");
  assert.equal(fresh.sessionId, null);
  assert.equal(canMountChat(fresh), true);

  const reopened = openChatView("s1");
  assert.equal(canMountChat(reopened), false);
  assert.equal(canMountChat(applyLoadedMessages(reopened, "s1", { messages: [] })), true);
  assert.equal(canMountChat(applyLoadedMessages(reopened, "s1", { error: "x" })), false);
  // A stale response for another chat is ignored.
  assert.equal(applyLoadedMessages(reopened, "s2", { messages: [1] }), reopened);
  assert.equal(canMountChat(loadedChatView("s1", [])), true);
});

test("view: selecting the open chat keeps it; another chat opens fresh", () => {
  const v = loadedChatView("s1", ["m"]);
  assert.equal(selectChatView(v, "s1"), v);
  assert.deepEqual(selectChatView(v, "s2"), openChatView("s2"));
});

test("view: a new chat binds to the session the server created", () => {
  const v = newChatView("new-1");
  assert.deepEqual(bindCreatedSession(v, "new-1", "s9"), { ...v, sessionId: "s9" });
});

test("view: a late session id from a chat the parent left never rebinds the open chat", () => {
  // Parent asks in chat A, then clicks "New chat" while A's reply streams.
  const fresh = newChatView("new-2");
  assert.equal(bindCreatedSession(fresh, "new-1", "sA"), fresh);
  assert.equal(bindCreatedSession(fresh, "sA", "sA"), fresh);
  // ...or opens chat B.
  const b = loadedChatView("sB", []);
  assert.equal(bindCreatedSession(b, "new-1", "sA"), b);
});
