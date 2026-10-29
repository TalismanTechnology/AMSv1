import { test } from "node:test";
import assert from "node:assert/strict";
import { clampDimension, formatRate, parseWallLayout, sparklinePaths } from "./aggregate";

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
