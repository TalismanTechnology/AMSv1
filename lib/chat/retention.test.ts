import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CHAT_RETENTION_MINUTES,
  buildModelHistory,
  filterRecent,
  flaggedSessionIdsFrom,
  isWithinRetention,
  planPurge,
  purgeExpiredChats,
  retentionCutoff,
  truncateTitle,
} from "./retention";

const NOW = new Date(Date.UTC(2026, 9, 19, 12, 0));
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

test("the window is 30 minutes", () => {
  assert.equal(CHAT_RETENTION_MINUTES, 30);
  assert.equal(retentionCutoff(NOW), minutesAgo(30));
});

test("cutoff filtering keeps the last 30 minutes, inclusive", () => {
  const cutoff = retentionCutoff(NOW);
  assert.equal(isWithinRetention(minutesAgo(29), cutoff), true);
  assert.equal(isWithinRetention(minutesAgo(30), cutoff), true);
  assert.equal(isWithinRetention(minutesAgo(31), cutoff), false);
  assert.equal(isWithinRetention("not a date", cutoff), false);

  const rows = [
    { id: "old", created_at: minutesAgo(45) },
    { id: "a", created_at: minutesAgo(20) },
    { id: "b", created_at: minutesAgo(1) },
  ];
  assert.deepEqual(
    filterRecent(rows, cutoff).map((r) => r.id),
    ["a", "b"]
  );
});

test("flagged: any unanswered message flags its session", () => {
  const flagged = flaggedSessionIdsFrom({
    unansweredSessionIds: ["s1"],
    downvotes: [],
    ownerBySession: new Map([
      ["s1", "parent-1"],
      ["s2", "parent-2"],
    ]),
  });
  assert.deepEqual([...flagged], ["s1"]);
});

test("flagged: only the session owner's thumbs-down counts", () => {
  const ownerBySession = new Map([
    ["s1", "parent-1"],
    ["s2", "parent-2"],
    ["s3", null],
  ]);
  const flagged = flaggedSessionIdsFrom({
    unansweredSessionIds: [],
    downvotes: [
      { session_id: "s1", user_id: "parent-1" }, // owner → flagged
      { session_id: "s2", user_id: "staff-1" }, // someone else → not
      { session_id: "s3", user_id: null }, // unknown owner → not
    ],
    ownerBySession,
  });
  assert.deepEqual([...flagged], ["s1"]);
});

test("purge plan: unflagged sessions lose old messages; idle ones are deleted", () => {
  const cutoff = retentionCutoff(NOW);
  const plan = planPurge(
    [
      // active chat: old messages go, session stays
      { id: "active", flagged: false, hidden: false, hasRecentMessages: true, updated_at: minutesAgo(2) },
      // idle chat: everything goes
      { id: "idle", flagged: false, hidden: false, hasRecentMessages: false, updated_at: minutesAgo(40) },
      // just touched by an in-flight question: kept
      { id: "sending", flagged: false, hidden: false, hasRecentMessages: false, updated_at: minutesAgo(0) },
      // a hidden chat whose flag was removed: deleted
      { id: "unflagged-hidden", flagged: false, hidden: true, hasRecentMessages: false, updated_at: minutesAgo(600) },
    ],
    cutoff
  );
  assert.deepEqual(plan.expireMessagesIn, ["active", "idle", "sending", "unflagged-hidden"]);
  assert.deepEqual(plan.deleteSessions, ["idle", "unflagged-hidden"]);
  assert.deepEqual(plan.hide, []);
});

test("purge plan: flagged sessions are never deleted, only hidden once idle", () => {
  const cutoff = retentionCutoff(NOW);
  const plan = planPurge(
    [
      { id: "flagged-active", flagged: true, hidden: false, hasRecentMessages: true, updated_at: minutesAgo(1) },
      { id: "flagged-idle", flagged: true, hidden: false, hasRecentMessages: false, updated_at: minutesAgo(31) },
      { id: "flagged-hidden", flagged: true, hidden: true, hasRecentMessages: false, updated_at: minutesAgo(500) },
    ],
    cutoff
  );
  assert.deepEqual(plan.expireMessagesIn, []);
  assert.deepEqual(plan.deleteSessions, []);
  assert.deepEqual(plan.hide, ["flagged-idle"]);
});

test("model history: stored window only, in order, plus the new question", () => {
  const cutoff = retentionCutoff(NOW);
  const latest = { id: "client", role: "user", parts: [{ type: "text", text: "And Friday?" }] };
  const history = buildModelHistory(
    [
      { id: "m2", role: "assistant", content: "Pickup is at 3pm.", created_at: minutesAgo(9) },
      { id: "old", role: "user", content: "Expired question", created_at: minutesAgo(31) },
      { id: "m1", role: "user", content: "When is pickup?", created_at: minutesAgo(10) },
      { id: "blank", role: "assistant", content: "  ", created_at: minutesAgo(8) },
    ],
    latest,
    "And Friday?",
    cutoff
  );
  assert.deepEqual(
    history.map((m) => m.id),
    ["m1", "m2", "client"]
  );
  assert.deepEqual(history[0], {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text: "When is pickup?" }],
  });
});

test("model history: a stored copy of the retried question isn't sent twice", () => {
  const cutoff = retentionCutoff(NOW);
  const latest = { id: "client", role: "user" };
  const history = buildModelHistory(
    [{ id: "m1", role: "user", content: "When is pickup? ", created_at: minutesAgo(1) }],
    latest,
    "When is pickup?",
    cutoff
  );
  assert.deepEqual(history, [latest]);
});

test("truncateTitle trims, collapses whitespace and truncates at 60", () => {
  assert.equal(truncateTitle("  When is   the\nbake sale? "), "When is the bake sale?");
  assert.equal(truncateTitle("a".repeat(60)), "a".repeat(60));
  assert.equal(truncateTitle("a".repeat(61)), "a".repeat(60) + "...");
  assert.equal(truncateTitle("   "), "");
});

// --- purgeExpiredChats with a fake Supabase client --------------------------

type Op = {
  table: string;
  action: "select" | "update" | "delete";
  select?: string;
  payload?: unknown;
  filters: [string, string, unknown][];
};

function fakeAdmin(respond: (op: Op) => { data: unknown; error: unknown; count?: number }) {
  const ops: Op[] = [];
  function builder(table: string) {
    const op: Op = { table, action: "select", filters: [] };
    ops.push(op);
    const f = (kind: string) => (col: string, val: unknown) => (op.filters.push([kind, col, val]), b);
    const b = {
      select: (cols: string) => ((op.select = cols), b),
      update: (payload: unknown) => ((op.action = "update"), (op.payload = payload), b),
      delete: () => ((op.action = "delete"), b),
      eq: f("eq"),
      in: f("in"),
      lt: f("lt"),
      gte: f("gte"),
      order: () => b,
      range: () => b,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(respond(op)).then(resolve, reject),
    };
    return b;
  }
  return { client: { from: builder } as unknown as SupabaseClient, ops };
}

test("purgeExpiredChats deletes idle unflagged chats and hides flagged ones", async () => {
  const sessions = [
    { id: "idle", user_id: "p1", hidden_from_parent: false, updated_at: minutesAgo(45) },
    { id: "flagged", user_id: "p2", hidden_from_parent: false, updated_at: minutesAgo(45) },
  ];
  const { client, ops } = fakeAdmin((op) => {
    if (op.action !== "select") return { data: null, error: null, count: 1 };
    if (op.table === "chat_sessions") return { data: sessions, error: null };
    if (op.table === "chat_feedback") {
      return {
        data: [{ user_id: "p2", chat_messages: { session_id: "flagged" } }],
        error: null,
      };
    }
    // chat_messages: old-message scan, unanswered and recent lookups
    return { data: [], error: null };
  });

  const result = await purgeExpiredChats(client, { now: NOW });

  const cutoff = retentionCutoff(NOW);
  const msgDelete = ops.find((o) => o.table === "chat_messages" && o.action === "delete");
  assert.deepEqual(msgDelete?.filters, [
    ["in", "session_id", ["idle"]],
    ["lt", "created_at", cutoff],
  ]);
  const sessionDelete = ops.find((o) => o.table === "chat_sessions" && o.action === "delete");
  assert.deepEqual(sessionDelete?.filters, [
    ["in", "id", ["idle"]],
    ["lt", "updated_at", cutoff],
  ]);
  const hide = ops.find((o) => o.action === "update");
  assert.deepEqual(hide?.payload, { hidden_from_parent: true });
  assert.deepEqual(hide?.filters[0], ["in", "id", ["flagged"]]);
  assert.equal(result.sessionsChecked, 2);
});

test("purgeExpiredChats scoped to a parent filters by user and school", async () => {
  const { client, ops } = fakeAdmin(() => ({ data: [], error: null }));
  await purgeExpiredChats(client, { now: NOW, scope: { userId: "p1", schoolId: "sch" } });
  const listing = ops.find((o) => o.table === "chat_sessions");
  assert.ok(listing?.filters.some(([, c, v]) => c === "user_id" && v === "p1"));
  assert.ok(listing?.filters.some(([, c, v]) => c === "school_id" && v === "sch"));
  const scan = ops.find((o) => o.table === "chat_messages");
  assert.ok(scan?.filters.some(([, c, v]) => c === "chat_sessions.user_id" && v === "p1"));
});

test("purgeExpiredChats deletes nothing if the flag lookup fails", async () => {
  const { client, ops } = fakeAdmin((op) => {
    if (op.table === "chat_sessions") {
      return {
        data: [{ id: "s1", user_id: "p1", hidden_from_parent: false, updated_at: minutesAgo(60) }],
        error: null,
      };
    }
    if (op.table === "chat_feedback") return { data: null, error: { message: "boom" } };
    return { data: [], error: null };
  });
  await assert.rejects(purgeExpiredChats(client, { now: NOW }));
  assert.deepEqual(
    ops.filter((o) => o.action !== "select"),
    []
  );
});
