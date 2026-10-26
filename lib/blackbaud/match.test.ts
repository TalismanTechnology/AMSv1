import test from "node:test";
import assert from "node:assert/strict";
import { matchOccurrences, type StagedOccurrence } from "./match";

const START = "2026-10-05T19:00:00.000Z";

const parsed = (title: string, start = START, contentHash = "h1") => ({
  title,
  occurrenceStart: new Date(start),
  contentHash,
});

let nextId = 0;
const staged = (overrides: Partial<StagedOccurrence> = {}): StagedOccurrence => ({
  id: `row-${nextId++}`,
  title: "LS Faculty Meeting",
  occurrence_start: START,
  content_hash: "h1",
  status: "approved",
  last_seen_at: "2026-10-25T00:00:00Z",
  ...overrides,
});

test("an event re-downloaded under a new UID is recognised as unchanged", () => {
  const row = staged();
  const result = matchOccurrences([parsed("LS Faculty Meeting")], [row]);
  assert.equal(result.unchanged.length, 1);
  assert.equal(result.unchanged[0].staged.id, row.id);
  assert.equal(result.added.length, 0);
});

test("copies from earlier syncs are flagged, keeping the published one", () => {
  const live = staged({ status: "approved", last_seen_at: "2026-10-20T00:00:00Z" });
  const stale = staged({ status: "pending", last_seen_at: "2026-10-25T00:00:00Z" });
  const older = staged({ status: "pending", last_seen_at: "2026-10-01T00:00:00Z" });

  const result = matchOccurrences([parsed("LS Faculty Meeting")], [stale, live, older]);

  assert.equal(result.unchanged[0].staged.id, live.id);
  assert.deepEqual(result.duplicates.map((r) => r.id).sort(), [stale.id, older.id].sort());
});

test("a changed event replaces its row instead of adding a new one", () => {
  const row = staged({ content_hash: "old" });
  const result = matchOccurrences([parsed("LS Faculty Meeting", START, "new")], [row]);
  assert.equal(result.changed.length, 1);
  assert.equal(result.changed[0].staged.id, row.id);
});

test("two real events sharing a title and start both survive", () => {
  const a = staged();
  const b = staged();
  const result = matchOccurrences(
    [parsed("LS Faculty Meeting"), parsed("LS Faculty Meeting")],
    [a, b]
  );
  assert.equal(result.unchanged.length, 2);
  assert.equal(result.duplicates.length, 0);
});

test("a row that dropped out of the feed is restaged when it returns", () => {
  const row = staged({ status: "superseded" });
  const result = matchOccurrences([parsed("LS Faculty Meeting")], [row]);
  assert.equal(result.changed.length, 1);
});

test("rows the feed no longer lists are not called duplicates", () => {
  const gone = staged({ title: "Cancelled Assembly" });
  const result = matchOccurrences([parsed("LS Faculty Meeting")], [gone]);
  assert.equal(result.duplicates.length, 0);
  assert.equal(result.added.length, 1);
});

test("titles match regardless of case and surrounding space", () => {
  const row = staged({ title: "  ls faculty meeting " });
  const result = matchOccurrences([parsed("LS Faculty Meeting")], [row]);
  assert.equal(result.unchanged.length, 1);
});
