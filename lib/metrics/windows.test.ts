import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_METRIC_RANGE,
  parseMetricRange,
  rangeDays,
  rangeLabel,
  rangeOptionLabel,
  windowStart,
} from "./windows";

test("parseMetricRange accepts 7d/30d/90d/all and the old ?range=7 form", () => {
  assert.equal(parseMetricRange("7d"), "7d");
  assert.equal(parseMetricRange("all"), "all");
  assert.equal(parseMetricRange("90"), "90d");
  assert.equal(parseMetricRange(7), "7d");
  assert.equal(parseMetricRange(["30d", "7d"]), "30d");
  assert.equal(parseMetricRange("365"), DEFAULT_METRIC_RANGE);
  assert.equal(parseMetricRange("abc"), DEFAULT_METRIC_RANGE);
  assert.equal(parseMetricRange(undefined), "30d");
});

test("each range carries its days and labels", () => {
  assert.equal(rangeDays("7d"), 7);
  assert.equal(rangeDays("all"), null);
  assert.equal(rangeLabel("30d"), "Last 30 days");
  assert.equal(rangeLabel("all"), "All time");
  assert.equal(rangeOptionLabel("90d"), "90 days");
});

test("a 'last N days' window starts at Eastern midnight N-1 days back", () => {
  const now = new Date("2026-10-28T15:00:00Z");
  assert.equal(windowStart(1, now)!.toISOString(), "2026-10-28T04:00:00.000Z");
  assert.equal(windowStart(7, now)!.toISOString(), "2026-10-22T04:00:00.000Z");
  assert.equal(windowStart(null, now), null);
});
