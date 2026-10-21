import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CHAT_RETENTION_DAYS,
  MAX_HISTORY_MESSAGES,
  buildModelHistory,
  claimParentSession,
  createParentSession,
  PURGE_GRACE_MINUTES,
  flaggedSessionIdsFrom,
  graceCutoff,
  isSessionId,
  isWithinRetention,
  parseRequestedSessionId,
  planPurge,
  purgeExpiredChats,
  resolveParentSession,
  retentionCutoff,
  stillDeletable,
  truncateTitle,
} from "./retention";

const NOW = new Date(Date.UTC(2026, 9, 19, 12, 0));
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const daysAgo = (d: number) => minutesAgo(d * 24 * 60);

test("the window is 30 days from last activity", () => {
  assert.equal(CHAT_RETENTION_DAYS, 30);
  assert.equal(retentionCutoff(NOW), daysAgo(30));
});

test("retention: a chat active within 30 days is kept, inclusive", () => {
  const cutoff = retentionCutoff(NOW);
  assert.equal(isWithinRetention(minutesAgo(31), cutoff), true); // the old 30-minute rule is gone
  assert.equal(isWithinRetention(daysAgo(29), cutoff), true);
  assert.equal(isWithinRetention(daysAgo(30), cutoff), true);
  assert.equal(isWithinRetention(daysAgo(30.01), cutoff), false);
  assert.equal(isWithinRetention("not a date", cutoff), false);
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

test("purge plan: whole unflagged chats idle 30 days are deleted; active ones are untouched", () => {
  const cutoff = retentionCutoff(NOW);
  const plan = planPurge(
    [
      // used yesterday, with messages from 40 days ago: kept whole
      { id: "active", flagged: false, hidden: false, hasRecentMessages: true, updated_at: daysAgo(1) },
      // last used 29 days ago: kept
      { id: "recent", flagged: false, hidden: false, hasRecentMessages: false, updated_at: daysAgo(29) },
      // idle 31 days: deleted
      { id: "idle", flagged: false, hidden: false, hasRecentMessages: false, updated_at: daysAgo(31) },
      // updated_at not touched, but a message landed recently: kept
      { id: "late-message", flagged: false, hidden: false, hasRecentMessages: true, updated_at: daysAgo(40) },
      // a hidden chat whose flag was removed: deleted
      { id: "unflagged-hidden", flagged: false, hidden: true, hasRecentMessages: false, updated_at: daysAgo(60) },
    ],
    cutoff
  );
  assert.deepEqual(plan.deleteSessions, ["idle", "unflagged-hidden"]);
  assert.deepEqual(plan.hide, []);
});

test("purge plan: flagged chats are never deleted, only hidden once idle 30 days", () => {
  const cutoff = retentionCutoff(NOW);
  const plan = planPurge(
    [
      { id: "flagged-active", flagged: true, hidden: false, hasRecentMessages: true, updated_at: daysAgo(3) },
      { id: "flagged-29d", flagged: true, hidden: false, hasRecentMessages: false, updated_at: daysAgo(29) },
      { id: "flagged-idle", flagged: true, hidden: false, hasRecentMessages: false, updated_at: daysAgo(31) },
      { id: "flagged-hidden", flagged: true, hidden: true, hasRecentMessages: false, updated_at: daysAgo(90) },
      // deleted by the parent (hidden) but still recent: left alone for staff
      { id: "parent-deleted", flagged: true, hidden: true, hasRecentMessages: true, updated_at: daysAgo(2) },
    ],
    cutoff
  );
  assert.deepEqual(plan.deleteSessions, []);
  assert.deepEqual(plan.hide, ["flagged-idle"]);
});

test("purge plan: recently active sessions are skipped entirely", () => {
  const cutoff = retentionCutoff(NOW);
  const plan = planPurge(
    [
      // idle by the 30-day rule, but a rating/reply just landed
      { id: "rated", flagged: false, hidden: false, hasRecentMessages: false, updated_at: daysAgo(40), recentlyActive: true },
      { id: "flagged-rated", flagged: true, hidden: false, hasRecentMessages: false, updated_at: daysAgo(40), recentlyActive: true },
      { id: "idle", flagged: false, hidden: false, hasRecentMessages: false, updated_at: daysAgo(40), recentlyActive: false },
    ],
    cutoff
  );
  assert.deepEqual(plan.deleteSessions, ["idle"]);
  assert.deepEqual(plan.hide, []);
});

test("grace window is 2 minutes", () => {
  assert.equal(PURGE_GRACE_MINUTES, 2);
  assert.equal(graceCutoff(NOW), minutesAgo(2));
});

test("stillDeletable drops sessions flagged or active since the plan", () => {
  const ids = ["a", "b", "c", "d"];
  assert.deepEqual(stillDeletable(ids, { flagged: new Set(["b"]) }), ["a", "c", "d"]);
  assert.deepEqual(
    stillDeletable(ids, { flagged: new Set(["b"]), active: new Set(["d", "zz"]) }),
    ["a", "c"]
  );
  assert.deepEqual(stillDeletable([], { flagged: new Set(["a"]) }), []);
});

test("model history: stored messages in order, plus the new question", () => {
  const latest = { id: "client", role: "user", parts: [{ type: "text", text: "And Friday?" }] };
  const history = buildModelHistory(
    [
      { id: "m2", role: "assistant", content: "Pickup is at 3pm.", created_at: minutesAgo(9) },
      { id: "m0", role: "user", content: "Earlier question", created_at: daysAgo(3) },
      { id: "m1", role: "user", content: "When is pickup?", created_at: minutesAgo(10) },
      { id: "blank", role: "assistant", content: "  ", created_at: minutesAgo(8) },
    ],
    latest,
    "And Friday?"
  );
  assert.deepEqual(
    history.map((m) => m.id),
    ["m0", "m1", "m2", "client"]
  );
  assert.deepEqual(history[1], {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text: "When is pickup?" }],
  });
});

test("model history: only the latest MAX_HISTORY_MESSAGES are sent", () => {
  const stored = Array.from({ length: MAX_HISTORY_MESSAGES + 5 }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 ? "assistant" : "user",
    content: `message ${i}`,
    created_at: minutesAgo(1000 - i),
  }));
  const history = buildModelHistory(stored, { id: "client" }, "new");
  assert.equal(history.length, MAX_HISTORY_MESSAGES + 1);
  assert.equal(history[0].id, "m5");
  assert.equal(history[history.length - 1].id, "client");
});

test("model history: a stored copy of the retried question isn't sent twice", () => {
  const latest = { id: "client", role: "user" };
  const history = buildModelHistory(
    [{ id: "m1", role: "user", content: "When is pickup? ", created_at: minutesAgo(1) }],
    latest,
    "When is pickup?"
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
  action: "select" | "update" | "delete" | "insert";
  select?: string;
  payload?: unknown;
  filters: [string, string, unknown][];
  /** order()/limit() calls, e.g. "order:updated_at". */
  modifiers: string[];
};

function fakeAdmin(respond: (op: Op) => { data: unknown; error: unknown; count?: number }) {
  const ops: Op[] = [];
  function builder(table: string) {
    const op: Op = { table, action: "select", filters: [], modifiers: [] };
    ops.push(op);
    const f = (kind: string) => (col: string, val: unknown) => (op.filters.push([kind, col, val]), b);
    const b = {
      select: (cols: string) => ((op.select = cols), b),
      update: (payload: unknown) => ((op.action = "update"), (op.payload = payload), b),
      delete: () => ((op.action = "delete"), b),
      insert: (payload: unknown) => ((op.action = "insert"), (op.payload = payload), b),
      eq: f("eq"),
      in: f("in"),
      lt: f("lt"),
      gte: f("gte"),
      order: (col: string) => (op.modifiers.push(`order:${col}`), b),
      limit: (n: number) => (op.modifiers.push(`limit:${n}`), b),
      range: () => b,
      single: () => b,
      maybeSingle: () => b,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(respond(op)).then(resolve, reject),
    };
    return b;
  }
  return { client: { from: builder } as unknown as SupabaseClient, ops };
}

test("purgeExpiredChats deletes idle unflagged chats and hides flagged ones", async () => {
  const sessions = [
    { id: "idle", user_id: "p1", hidden_from_parent: false, updated_at: daysAgo(31) },
    { id: "flagged", user_id: "p2", hidden_from_parent: false, updated_at: daysAgo(31) },
  ];
  const { client, ops } = fakeAdmin((op) => {
    if (op.action !== "select") return { data: null, error: null, count: 1 };
    if (op.table === "chat_sessions") return { data: sessions, error: null };
    if (op.table === "chat_feedback" && op.select?.includes("user_id")) {
      return {
        data: [{ user_id: "p2", chat_messages: { session_id: "flagged" } }],
        error: null,
      };
    }
    // chat_messages: unanswered and recent lookups
    return { data: [], error: null };
  });

  const result = await purgeExpiredChats(client, { now: NOW });

  const cutoff = retentionCutoff(NOW);
  const listing = ops.find((o) => o.table === "chat_sessions" && o.action === "select");
  assert.deepEqual(listing?.filters, [["lt", "updated_at", cutoff]]);
  // Whole sessions go; no per-message expiry any more.
  assert.equal(ops.some((o) => o.table === "chat_messages" && o.action === "delete"), false);
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
});

test("purgeExpiredChats deletes nothing if the flag lookup fails", async () => {
  const { client, ops } = fakeAdmin((op) => {
    if (op.table === "chat_sessions") {
      return {
        data: [{ id: "s1", user_id: "p1", hidden_from_parent: false, updated_at: daysAgo(31) }],
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

test("purgeExpiredChats re-checks flags before deleting: a late flag saves the chat", async () => {
  const sessions = [
    { id: "late", user_id: "p1", hidden_from_parent: false, updated_at: daysAgo(31) },
  ];
  let unansweredLookups = 0;
  const { client, ops } = fakeAdmin((op) => {
    if (op.action !== "select") return { data: null, error: null, count: 1 };
    if (op.table === "chat_sessions") return { data: sessions, error: null };
    const unansweredLookup = op.filters.some(([k, c, v]) => k === "eq" && c === "unanswered" && v === true);
    if (op.table === "chat_messages" && unansweredLookup) {
      // Unflagged when planned; an unanswered reply lands before the delete.
      unansweredLookups++;
      return { data: unansweredLookups > 1 ? [{ session_id: "late" }] : [], error: null };
    }
    return { data: [], error: null };
  });

  const result = await purgeExpiredChats(client, { now: NOW });
  assert.ok(unansweredLookups >= 2);
  assert.deepEqual(
    ops.filter((o) => o.action === "delete"),
    []
  );
  assert.equal(result.sessionsDeleted, 0);
});

test("purgeExpiredChats skips a session rated within the grace window", async () => {
  const sessions = [
    { id: "rated", user_id: "p1", hidden_from_parent: false, updated_at: daysAgo(31) },
  ];
  const { client, ops } = fakeAdmin((op) => {
    if (op.action !== "select") return { data: null, error: null, count: 1 };
    if (op.table === "chat_sessions") return { data: sessions, error: null };
    // A thumbs-up (not a flag) left a minute ago.
    if (op.table === "chat_feedback" && !op.select?.includes("user_id")) {
      assert.ok(op.filters.some(([k, c, v]) => k === "gte" && c === "created_at" && v === graceCutoff(NOW)));
      return { data: [{ chat_messages: { session_id: "rated" } }], error: null };
    }
    return { data: [], error: null };
  });

  await purgeExpiredChats(client, { now: NOW });
  assert.deepEqual(
    ops.filter((o) => o.action !== "select"),
    []
  );
});

// --- Which session a question goes into --------------------------------------
// Regression guard: a new chat must never be appended to an older one.

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

test("request sessionId: null means a new chat; missing or malformed is rejected", () => {
  assert.deepEqual(parseRequestedSessionId({ sessionId: null }), { ok: true, sessionId: null });
  assert.deepEqual(parseRequestedSessionId({ sessionId: S1 }), { ok: true, sessionId: S1 });
  assert.deepEqual(parseRequestedSessionId({}), { ok: false });
  assert.deepEqual(parseRequestedSessionId({ sessionId: undefined }), { ok: false });
  assert.deepEqual(parseRequestedSessionId({ sessionId: "" }), { ok: false });
  assert.deepEqual(parseRequestedSessionId({ sessionId: "latest" }), { ok: false });
  assert.deepEqual(parseRequestedSessionId({ sessionId: 42 }), { ok: false });
  assert.deepEqual(parseRequestedSessionId(null), { ok: false });
  assert.equal(isSessionId(S1), true);
  assert.equal(isSessionId(`${S1} `), false);
});

/** A fake whose chat_sessions update matches only `owned` (id, user, school, visible, fresh). */
function sessionsAdmin(owned: { id: string; user_id: string; school_id: string; hidden: boolean; updated_at: string }[]) {
  let created = 0;
  return fakeAdmin((op) => {
    if (op.table !== "chat_sessions") return { data: null, error: null };
    if (op.action === "insert") {
      created++;
      return { data: { id: `new-${created}` }, error: null };
    }
    if (op.action === "update") {
      const want = Object.fromEntries(op.filters.filter(([k]) => k === "eq").map(([, c, v]) => [c, v]));
      const fresh = op.filters.find(([k, c]) => k === "gte" && c === "updated_at")?.[2] as string;
      const hit = owned.find(
        (s) =>
          s.id === want.id &&
          s.user_id === want.user_id &&
          s.school_id === want.school_id &&
          s.hidden === want.hidden_from_parent &&
          Date.parse(s.updated_at) >= Date.parse(fresh)
      );
      return { data: hit ? { id: hit.id } : null, error: null };
    }
    return { data: null, error: null };
  });
}

const OWNED = [
  { id: S1, user_id: "p1", school_id: "sch", hidden: false, updated_at: new Date().toISOString() },
];

test("session: null always creates a new session and never looks up the latest", async () => {
  const { client, ops } = sessionsAdmin(OWNED);
  const result = await resolveParentSession(client, "p1", "sch", null, "When is pickup?");
  assert.deepEqual(result, { sessionId: "new-1", created: true });
  assert.deepEqual(ops.map((o) => o.action), ["insert"]);
  assert.deepEqual(ops[0].payload, { user_id: "p1", school_id: "sch", title: "When is pickup?" });
});

test("session: the parent's own visible chat is reused, touched and scoped", async () => {
  const { client, ops } = sessionsAdmin(OWNED);
  const result = await resolveParentSession(client, "p1", "sch", S1);
  assert.deepEqual(result, { sessionId: S1, created: false });
  assert.equal(ops.length, 1);
  const claim = ops[0];
  assert.equal(claim.action, "update");
  assert.ok((claim.payload as { updated_at?: string }).updated_at);
  assert.deepEqual(
    claim.filters.filter(([k]) => k === "eq"),
    [
      ["eq", "id", S1],
      ["eq", "user_id", "p1"],
      ["eq", "school_id", "sch"],
      ["eq", "hidden_from_parent", false],
    ]
  );
  assert.ok(claim.filters.some(([k, c]) => k === "gte" && c === "updated_at"));
});

test("session: someone else's, another school's, hidden, expired or unknown chat gets a new session", async () => {
  const owned = [
    ...OWNED,
    { id: S2, user_id: "p1", school_id: "sch", hidden: true, updated_at: new Date().toISOString() },
  ];
  const cases: [string, string, string][] = [
    ["p2", "sch", S1], // another parent
    ["p1", "other", S1], // another school
    ["p1", "sch", S2], // hidden from the parent
    ["p1", "sch", "33333333-3333-4333-8333-333333333333"], // deleted / unknown
  ];
  for (const [user, school, id] of cases) {
    const { client, ops } = sessionsAdmin(owned);
    const result = await resolveParentSession(client, user, school, id);
    assert.equal(result.created, true, `${user}/${school}/${id}`);
    assert.notEqual(result.sessionId, S1);
    assert.notEqual(result.sessionId, S2);
    const insert = ops.find((o) => o.action === "insert");
    assert.deepEqual(insert?.payload, { user_id: user, school_id: school, title: "New chat" });
  }

  const expired = [{ ...OWNED[0], updated_at: daysAgo(31) }];
  const { client } = sessionsAdmin(expired);
  assert.equal(await claimParentSession(client, "p1", "sch", S1, NOW), null);
});

test("session: no code path ever picks a session by recency", async () => {
  const { client, ops } = sessionsAdmin(OWNED);
  await resolveParentSession(client, "p1", "sch", null);
  await resolveParentSession(client, "p1", "sch", S1);
  await resolveParentSession(client, "p2", "sch", S1);
  await createParentSession(client, "p1", "sch");
  for (const op of ops) {
    assert.equal(op.action === "select", false, "no session lookup");
    assert.deepEqual(op.modifiers, [], "no order/limit");
  }
});

test("session: a malformed id is never queried, and a query error is thrown", async () => {
  const { client, ops } = sessionsAdmin(OWNED);
  assert.equal(await claimParentSession(client, "p1", "sch", "not-a-uuid"), null);
  assert.equal(ops.length, 0);

  const failing = fakeAdmin(() => ({ data: null, error: { message: "boom" } }));
  await assert.rejects(claimParentSession(failing.client, "p1", "sch", S1));
  // ...so the route fails rather than quietly starting a different chat.
  await assert.rejects(resolveParentSession(failing.client, "p1", "sch", S1));
  assert.equal(failing.ops.some((o) => o.action === "insert"), false);
});
