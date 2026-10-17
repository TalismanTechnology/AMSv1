import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  APPROVAL_MAX_AGE_MS,
  buildDocumentPushMessage,
  documentPushPath,
  ENQUEUE_MAX_AGE_MS,
  isQueueable,
  MIN_INTERVAL_HOURS,
  OUTCOMES,
  SETTLE_MINUTES,
  shouldSend,
} from "./document-push";

const NOW = new Date("2026-10-17T15:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);

// ── Which documents are queued ────────────────────────────────────

test("a new uploaded or emailed document that is ready is queued", () => {
  for (const source of ["upload", "email"]) {
    assert.equal(
      isQueueable({ source, status: "ready", created_at: minutesAgo(5) }, NOW, ENQUEUE_MAX_AGE_MS),
      true,
      source
    );
  }
});

test("website pages never notify", () => {
  assert.equal(
    isQueueable({ source: "website", status: "ready", created_at: minutesAgo(5) }, NOW, ENQUEUE_MAX_AGE_MS),
    false
  );
});

test("a document that isn't ready is not queued", () => {
  for (const status of ["processing", "pending", "error"]) {
    assert.equal(
      isQueueable({ source: "upload", status, created_at: minutesAgo(5) }, NOW, ENQUEUE_MAX_AGE_MS),
      false,
      status
    );
  }
});

test("re-processing an old document doesn't queue it", () => {
  const doc = { source: "upload", status: "ready", created_at: hoursAgo(25) };
  assert.equal(isQueueable(doc, NOW, ENQUEUE_MAX_AGE_MS), false);
  assert.equal(isQueueable({ ...doc, created_at: hoursAgo(23) }, NOW, ENQUEUE_MAX_AGE_MS), true);
});

test("an approved held document may be up to a week old", () => {
  const doc = { source: "email", status: "ready", created_at: hoursAgo(6 * 24) };
  assert.equal(isQueueable(doc, NOW, APPROVAL_MAX_AGE_MS), true);
  assert.equal(isQueueable({ ...doc, created_at: hoursAgo(8 * 24) }, NOW, APPROVAL_MAX_AGE_MS), false);
});

test("a document from before the source column counts as an upload; a bad date never queues", () => {
  assert.equal(
    isQueueable({ source: null, status: "ready", created_at: minutesAgo(1) }, NOW, ENQUEUE_MAX_AGE_MS),
    true
  );
  assert.equal(
    isQueueable({ source: "upload", status: "ready", created_at: "nope" }, NOW, ENQUEUE_MAX_AGE_MS),
    false
  );
});

// ── When a batch goes out ─────────────────────────────────────────

test("nothing pending, nothing to send", () => {
  assert.deepEqual(shouldSend([], null, NOW), { send: false, reason: "empty" });
});

test("waits for a fresh batch to settle", () => {
  assert.deepEqual(shouldSend([{ queued_at: minutesAgo(SETTLE_MINUTES - 1) }], null, NOW), {
    send: false,
    reason: "settling",
  });
});

test("sends once the oldest pending document has settled, even if newer ones just arrived", () => {
  const rows = [{ queued_at: minutesAgo(1) }, { queued_at: minutesAgo(SETTLE_MINUTES) }];
  assert.deepEqual(shouldSend(rows, null, NOW), { send: true });
});

test("at most one push per school per interval", () => {
  const rows = [{ queued_at: minutesAgo(30) }];
  assert.deepEqual(shouldSend(rows, minutesAgo(MIN_INTERVAL_HOURS * 60 - 1), NOW), {
    send: false,
    reason: "rate_limited",
  });
  assert.deepEqual(shouldSend(rows, hoursAgo(MIN_INTERVAL_HOURS), NOW), { send: true });
});

test("the limit is three hours", () => {
  assert.equal(MIN_INTERVAL_HOURS, 3);
  assert.equal(SETTLE_MINUTES, 10);
});

// ── The message ───────────────────────────────────────────────────

test("one document: the school in the title, the document as the body", () => {
  const message = buildDocumentPushMessage({
    schoolName: "Westfield Academy",
    schoolSlug: "westfield",
    titles: ["Field Trip Permission Form"],
  });
  assert.deepEqual(message, {
    title: "New from Westfield Academy",
    body: "Field Trip Permission Form",
    url: "/s/westfield/parent/chat",
  });
});

test("several documents: a count, with titles when they fit", () => {
  assert.deepEqual(
    buildDocumentPushMessage({
      schoolName: "Westfield Academy",
      schoolSlug: "westfield",
      titles: ["Lunch Menu", "Bus Schedule", "Spirit Week"],
    }),
    {
      title: "Westfield Academy",
      body: "3 new documents from Westfield Academy: Lunch Menu, Bus Schedule and 1 more",
      url: "/s/westfield/parent/chat",
    }
  );

  assert.equal(
    buildDocumentPushMessage({
      schoolName: "Westfield Academy",
      schoolSlug: "westfield",
      titles: ["Lunch Menu", "Bus Schedule"],
    }).body,
    "2 new documents from Westfield Academy: Lunch Menu and Bus Schedule"
  );
});

test("long titles fall back to fewer titles, then just the count", () => {
  const long = "A very long document title that goes on and on about the spring concert";
  assert.equal(
    buildDocumentPushMessage({
      schoolName: "Westfield Academy",
      schoolSlug: "westfield",
      titles: ["Lunch Menu", long, "Spirit Week"],
    }).body,
    "3 new documents from Westfield Academy: Lunch Menu and 2 more"
  );
  assert.equal(
    buildDocumentPushMessage({
      schoolName: "Westfield Academy",
      schoolSlug: "westfield",
      titles: [long, long],
    }).body,
    "2 new documents from Westfield Academy"
  );
});

test("a long single title is truncated", () => {
  const body = buildDocumentPushMessage({
    schoolName: "Westfield Academy",
    schoolSlug: "westfield",
    titles: ["word ".repeat(100)],
  }).body;
  assert.ok(body.length <= 180);
  assert.ok(body.endsWith("…"));
});

test("a school without a name still reads naturally", () => {
  assert.deepEqual(
    buildDocumentPushMessage({ schoolName: null, schoolSlug: "x", titles: ["Handbook"] }),
    { title: "New school document", body: "Handbook", url: "/s/x/parent/chat" }
  );
  const many = buildDocumentPushMessage({ schoolName: "  ", schoolSlug: "x", titles: ["A", "B"] });
  assert.equal(many.title, "New school documents");
  assert.equal(many.body, "2 new documents from your school: A and B");
});

test("a blank title doesn't make an empty notification", () => {
  assert.equal(
    buildDocumentPushMessage({ schoolName: "Westfield", schoolSlug: "w", titles: ["  "] }).body,
    "A new document was added."
  );
});

test("the tap opens the school's chat, an in-app path", () => {
  assert.equal(documentPushPath("west field"), "/s/west%20field/parent/chat");
});

test("outcome names match the migration's check constraint", () => {
  const sql = readFileSync(
    join(__dirname, "../../supabase/migrations/042_new_document_push.sql"),
    "utf8"
  );
  for (const outcome of Object.values(OUTCOMES)) {
    assert.match(sql, new RegExp(`'${outcome}'`), outcome);
  }
});
