import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { CHAT_LIST_LIMIT, listParentChats, loadParentChat } from "./history";
import { retentionCutoff } from "./retention";

const NOW = new Date(Date.UTC(2026, 9, 20, 12, 0));
const S1 = "11111111-1111-4111-8111-111111111111";

type Op = { table: string; filters: [string, string, unknown][]; modifiers: string[] };

function fakeAdmin(respond: (op: Op) => { data: unknown; error: unknown }) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const op: Op = { table, filters: [], modifiers: [] };
      ops.push(op);
      const f = (kind: string) => (col: string, val: unknown) => (op.filters.push([kind, col, val]), b);
      const b = {
        select: () => b,
        eq: f("eq"),
        gte: f("gte"),
        order: (col: string) => (op.modifiers.push(`order:${col}`), b),
        limit: (n: number) => (op.modifiers.push(`limit:${n}`), b),
        maybeSingle: () => b,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(respond(op)).then(resolve, reject),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { client, ops };
}

test("list: only this parent's visible, unexpired chats in this school, newest first, capped", async () => {
  const { client, ops } = fakeAdmin(() => ({ data: [], error: null }));
  await listParentChats(client, "p1", "sch", NOW);
  assert.deepEqual(ops[0].filters, [
    ["eq", "user_id", "p1"],
    ["eq", "school_id", "sch"],
    ["eq", "hidden_from_parent", false],
    ["gte", "updated_at", retentionCutoff(NOW)],
  ]);
  assert.deepEqual(ops[0].modifiers, ["order:updated_at", `limit:${CHAT_LIST_LIMIT}`]);
});

test("open: the session is checked for owner, school and visibility before messages are read", async () => {
  const { client, ops } = fakeAdmin(() => ({ data: null, error: null }));
  assert.equal(await loadParentChat(client, "p1", "sch", S1, NOW), null);
  assert.equal(ops.length, 1, "no message read for a chat that isn't theirs");
  assert.deepEqual(ops[0].filters, [
    ["eq", "id", S1],
    ["eq", "user_id", "p1"],
    ["eq", "school_id", "sch"],
    ["eq", "hidden_from_parent", false],
    ["gte", "updated_at", retentionCutoff(NOW)],
  ]);
});

test("open: returns every message of an owned chat; a malformed id is never queried", async () => {
  const { client, ops } = fakeAdmin((op) =>
    op.table === "chat_sessions"
      ? { data: { id: S1, title: "Pickup", created_at: "", updated_at: "" }, error: null }
      : { data: [{ id: "m1", sources: [{ title: "Handbook" }] }], error: null }
  );
  const chat = await loadParentChat(client, "p1", "sch", S1, NOW);
  assert.equal(chat?.messages.length, 1);
  assert.deepEqual(ops[1].filters, [["eq", "session_id", S1]]);

  const bad = fakeAdmin(() => ({ data: null, error: null }));
  assert.equal(await loadParentChat(bad.client, "p1", "sch", "../x", NOW), null);
  assert.equal(bad.ops.length, 0);
});
