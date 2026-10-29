import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketByEtDay,
  clampDimension,
  countDistinct,
  countDistinctSince,
  etDayKey,
  etStartOfDay,
  formatEtTime,
  formatRate,
  lastEtDayKeys,
  parseWallLayout,
  sparklinePaths,
} from "./aggregate";

// --- Eastern days ---

test("etDayKey uses the Eastern calendar day, not UTC", () => {
  // 02:30 UTC on Oct 28 is 22:30 EDT on Oct 27.
  assert.equal(etDayKey("2026-10-28T02:30:00Z"), "2026-10-27");
  assert.equal(etDayKey("2026-10-28T04:00:00Z"), "2026-10-28");
  // Winter: EST is UTC-5.
  assert.equal(etDayKey("2026-01-15T04:59:00Z"), "2026-01-14");
  assert.equal(etDayKey("2026-01-15T05:00:00Z"), "2026-01-15");
});

test("etStartOfDay returns Eastern midnight in EDT and EST", () => {
  const now = new Date("2026-10-28T15:00:00Z");
  assert.equal(etStartOfDay(now).toISOString(), "2026-10-28T04:00:00.000Z");
  assert.equal(etStartOfDay(new Date("2026-01-15T03:00:00Z")).toISOString(), "2026-01-14T05:00:00.000Z");
});

test("etStartOfDay crosses a DST change correctly", () => {
  // DST ends Nov 1 2026: Nov 2 is EST, Oct 31 was EDT.
  const now = new Date("2026-11-02T17:00:00Z");
  assert.equal(etStartOfDay(now).toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(etStartOfDay(now, 2).toISOString(), "2026-10-31T04:00:00.000Z");
  // DST starts Mar 8 2026.
  const spring = new Date("2026-03-09T17:00:00Z");
  assert.equal(etStartOfDay(spring).toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(etStartOfDay(spring, 1).toISOString(), "2026-03-08T05:00:00.000Z");
});

test("lastEtDayKeys lists days oldest first ending today, across month ends", () => {
  const keys = lastEtDayKeys(new Date("2026-11-02T17:00:00Z"), 4);
  assert.deepEqual(keys, ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.equal(lastEtDayKeys(new Date("2026-10-28T12:00:00Z"), 14).length, 14);
});

test("bucketByEtDay counts per Eastern day and ignores out-of-range rows", () => {
  const now = new Date("2026-10-28T15:00:00Z");
  const buckets = bucketByEtDay(
    [
      "2026-10-28T14:00:00Z",
      "2026-10-28T03:00:00Z", // Oct 27 ET
      "2026-10-27T12:00:00Z",
      "2026-10-26T12:00:00Z",
      "2026-09-01T12:00:00Z", // too old
    ],
    now,
    3
  );
  assert.deepEqual(buckets, [
    { date: "2026-10-26", count: 1 },
    { date: "2026-10-27", count: 2 },
    { date: "2026-10-28", count: 1 },
  ]);
});

test("formatEtTime formats in Eastern time", () => {
  assert.equal(formatEtTime("2026-10-28T14:05:00Z"), "10:05 AM");
});

// --- counting ---

test("countDistinct ignores empty keys and repeats", () => {
  assert.equal(countDistinct(["a", "b", "a", null, undefined, ""]), 2);
  assert.equal(countDistinct([]), 0);
});

test("countDistinctSince counts each user once from the cutoff", () => {
  const since = new Date("2026-10-28T04:00:00Z");
  const rows = [
    { user_id: "u1", created_at: "2026-10-28T05:00:00Z" },
    { user_id: "u1", created_at: "2026-10-28T06:00:00Z" },
    { user_id: "u2", created_at: "2026-10-28T04:00:00Z" },
    { user_id: "u3", created_at: "2026-10-28T03:59:59Z" },
    { user_id: null, created_at: "2026-10-28T07:00:00Z" },
  ];
  assert.equal(countDistinctSince(rows, since), 2);
});

// --- sparkline ---

test("sparklinePaths spans the box and puts the max at the top", () => {
  const { line, area, points } = sparklinePaths([0, 5, 10], 100, 50, 0);
  assert.deepEqual(points, [
    { x: 0, y: 50 },
    { x: 50, y: 25 },
    { x: 100, y: 0 },
  ]);
  assert.ok(line.startsWith("M0 50"));
  assert.ok(line.endsWith("L100 0"));
  assert.ok(area.endsWith("L100 50 L0 50 Z"));
});

test("sparklinePaths handles empty, single, and all-zero input", () => {
  assert.deepEqual(sparklinePaths([], 100, 50), { line: "", area: "", points: [] });
  const single = sparklinePaths([3], 100, 50, 0);
  assert.deepEqual(single.points, [{ x: 50, y: 0 }]);
  const flat = sparklinePaths([0, 0, 0], 100, 50, 5);
  assert.ok(flat.points.every((p) => p.y === 45));
  assert.ok(!/NaN|Infinity/.test(flat.line + flat.area));
});

// --- params ---

test("parseWallLayout and clampDimension", () => {
  assert.equal(parseWallLayout("phone"), "phone");
  assert.equal(parseWallLayout("desktop"), "desktop");
  assert.equal(parseWallLayout("tablet"), null);
  assert.equal(clampDimension(undefined, 2560), 2560);
  assert.equal(clampDimension("abc", 2560), 2560);
  assert.equal(clampDimension("100", 2560), 320);
  assert.equal(clampDimension("99999", 2560), 6016);
  assert.equal(clampDimension("1179.6", 2560), 1180);
});

test("formatRate shows a dash when there were no questions", () => {
  assert.equal(formatRate(null), "—");
  assert.equal(formatRate(97), "97%");
});
