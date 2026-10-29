import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketByEtDay,
  etDayKey,
  etDaysInclusive,
  etHour,
  etStartOfDay,
  formatDayKey,
  formatEtTime,
  lastEtDayKeys,
} from "./time";

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

test("etDaysInclusive counts Eastern calendar days, at least 1", () => {
  const now = new Date("2026-10-28T15:00:00Z");
  assert.equal(etDaysInclusive("2026-10-28T05:00:00Z", now), 1);
  // 03:00Z Oct 28 is still Oct 27 in ET.
  assert.equal(etDaysInclusive("2026-10-28T03:00:00Z", now), 2);
  assert.equal(etDaysInclusive("2026-10-01T16:00:00Z", now), 28);
  assert.equal(etDaysInclusive("2026-11-01T00:00:00Z", now), 1);
});

test("etHour is the Eastern hour of day", () => {
  assert.equal(etHour("2026-10-28T14:05:00Z"), 10);
  assert.equal(etHour("2026-10-28T03:59:00Z"), 23);
  assert.equal(etHour("2026-01-15T05:00:00Z"), 0);
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

test("formatDayKey reads the key as a calendar date, whatever the local zone", () => {
  assert.equal(formatDayKey("2026-10-28"), "Oct 28");
  assert.equal(formatDayKey("2026-01-01", { year: true }), "Jan 1, 2026");
});
