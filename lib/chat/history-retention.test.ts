import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CHAT_HISTORY_LIMIT,
  planRetention,
  pruneChatHistory,
  truncateTitle,
} from "./history-retention";

// Session i is i minutes old: s0 is the newest.
function sessions(n: number, flagged: number[] = []) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    updated_at: new Date(Date.UTC(2026, 9, 12, 12, 0) - i * 60_000).toISOString(),
    flagged: flagged.includes(i),
  }));
}

test("the limit is 10", () => {
  assert.equal(CHAT_HISTORY_LIMIT, 10);
});

test("10 or fewer sessions are all kept", () => {
  assert.deepEqual(planRetention([]), { keep: [], hide: [], remove: [] });
  const plan = planRetention(sessions(10));
  assert.equal(plan.keep.length, 10);
  assert.deepEqual(plan.hide, []);
  assert.deepEqual(plan.remove, []);
});

test("the 11th session removes the oldest", () => {
  const plan = planRetention(sessions(11));
  assert.equal(plan.keep.length, 10);
  assert.ok(!plan.keep.includes("s10"));
  assert.deepEqual(plan.remove, ["s10"]);
  assert.deepEqual(plan.hide, []);
});

test("a flagged oldest session is hidden, not removed", () => {
  const plan = planRetention(sessions(11, [10]));
  assert.deepEqual(plan.hide, ["s10"]);
  assert.deepEqual(plan.remove, []);
});

test("ordering is by updated_at desc, not input order", () => {
  const input = sessions(11).reverse(); // oldest first
  const plan = planRetention(input);
  assert.deepEqual(plan.keep, ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"]);
  assert.deepEqual(plan.remove, ["s10"]);
});

test("flagged sessions inside the limit are simply kept", () => {
  const plan = planRetention(sessions(10, [0, 9]));
  assert.equal(plan.keep.length, 10);
  assert.deepEqual(plan.hide, []);
});

test("mixed overflow splits into hide and remove", () => {
  const plan = planRetention(sessions(15, [3, 11, 13]));
  assert.equal(plan.keep.length, 10);
  assert.deepEqual(plan.hide, ["s11", "s13"]);
  assert.deepEqual(plan.remove, ["s10", "s12", "s14"]);
});

test("custom limit", () => {
  const plan = planRetention(sessions(3, [2]), 1);
  assert.deepEqual(plan, { keep: ["s0"], hide: ["s2"], remove: ["s1"] });
});

test("truncateTitle trims, collapses whitespace and truncates at 60", () => {
  assert.equal(truncateTitle("  When is   the\nbake sale? "), "When is the bake sale?");
  assert.equal(truncateTitle("a".repeat(60)), "a".repeat(60));
  assert.equal(truncateTitle("a".repeat(61)), "a".repeat(60) + "...");
  assert.equal(truncateTitle("abcdef", 3), "abc...");
  assert.equal(truncateTitle("   "), "");
});

// --- pruneChatHistory with a fake Supabase client --------------------------

type Op = {
  table: string;
  action: "select" | "update" | "delete";
  payload?: unknown;
  filters: [string, string, unknown][];
};

function fakeAdmin(data: {
  sessions: { id: string; updated_at: string }[];
  unanswered: { session_id: string }[];
  downvoted: { message_id: string; chat_messages: { session_id: string } }[];
}) {
  const ops: Op[] = [];

  function builder(table: string) {
    const op: Op = { table, action: "select", filters: [] };
    const result = () => {
      if (op.action !== "select") return { data: null, error: null };
      if (table === "chat_sessions") return { data: data.sessions, error: null };
      if (table === "chat_messages") return { data: data.unanswered, error: null };
      if (table === "chat_feedback") return { data: data.downvoted, error: null };
      return { data: [], error: null };
    };
    const b = {
      select: () => b,
      update: (payload: unknown) => ((op.action = "update"), (op.payload = payload), b),
      delete: () => ((op.action = "delete"), b),
      eq: (col: string, val: unknown) => (op.filters.push(["eq", col, val]), b),
      in: (col: string, val: unknown) => (op.filters.push(["in", col, val]), b),
      order: () => b,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    ops.push(op);
    return b;
  }

  return { client: { from: builder } as unknown as SupabaseClient, ops };
}

test("pruneChatHistory hides flagged overflow and deletes the rest", async () => {
  const all = sessions(13).map(({ id, updated_at }) => ({ id, updated_at }));
  const { client, ops } = fakeAdmin({
    sessions: all,
    unanswered: [{ session_id: "s10" }],
    downvoted: [{ message_id: "m1", chat_messages: { session_id: "s12" } }],
  });

  await pruneChatHistory(client, "user-1", "school-1", 10);

  const listing = ops.find((o) => o.table === "chat_sessions" && o.action === "select");
  assert.ok(listing);
  assert.deepEqual(listing.filters, [
    ["eq", "user_id", "user-1"],
    ["eq", "school_id", "school-1"],
    ["eq", "hidden_from_parent", false],
  ]);

  const feedback = ops.find((o) => o.table === "chat_feedback");
  assert.ok(feedback?.filters.some(([, c, v]) => c === "user_id" && v === "user-1"));
  assert.ok(feedback?.filters.some(([, c, v]) => c === "rating" && v === "down"));

  const updates = ops.filter((o) => o.action === "update");
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].payload, { hidden_from_parent: true });
  assert.deepEqual(updates[0].filters, [
    ["in", "id", ["s10", "s12"]],
    ["eq", "user_id", "user-1"],
  ]);

  const deletes = ops.filter((o) => o.action === "delete");
  assert.equal(deletes.length, 1);
  assert.deepEqual(deletes[0].filters, [
    ["in", "id", ["s11"]],
    ["eq", "user_id", "user-1"],
  ]);
});

test("pruneChatHistory does nothing at or under the limit", async () => {
  const { client, ops } = fakeAdmin({
    sessions: sessions(10).map(({ id, updated_at }) => ({ id, updated_at })),
    unanswered: [],
    downvoted: [],
  });
  await pruneChatHistory(client, "user-1", "school-1");
  assert.deepEqual(
    ops.map((o) => [o.table, o.action]),
    [["chat_sessions", "select"]]
  );
});

test("pruneChatHistory never throws and deletes nothing if flag lookup fails", async () => {
  const ops: string[] = [];
  const client = {
    from(table: string) {
      const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        order: () => b,
        update: () => (ops.push(`update:${table}`), b),
        delete: () => (ops.push(`delete:${table}`), b),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            table === "chat_sessions"
              ? { data: sessions(12), error: null }
              : { data: null, error: { message: "boom" } }
          ).then(resolve),
      };
      return b;
    },
  } as unknown as SupabaseClient;

  const origError = console.error;
  console.error = () => {};
  try {
    await pruneChatHistory(client, "user-1", "school-1");
  } finally {
    console.error = origError;
  }
  assert.deepEqual(ops, []);
});
