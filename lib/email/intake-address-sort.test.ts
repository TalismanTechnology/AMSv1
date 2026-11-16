import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sortIntakeAddresses,
  splitIntakeAddresses,
  summarizeAddresses,
  type IntakeAddress,
} from "./addresses";
import type { EventCalendar } from "@/lib/types";

// The admin order of intake addresses (sortIntakeAddresses), by who each is
// for rather than by its name, and the switched-off section.

const DIVISIONS = [{ id: "div-lower" }, { id: "div-middle" }, { id: "div-upper" }];

let clock = 0;
const at = () => `2026-01-01T00:00:${String(clock++).padStart(2, "0")}Z`;

function addr(over: Partial<IntakeAddress> & { id: string }): IntakeAddress {
  return {
    token: `ams-${over.id}`,
    kind: "list",
    divisionId: null,
    label: null,
    enabled: true,
    visibleGrades: null,
    allowedSenders: null,
    defaultFolderId: null,
    createdAt: at(),
    ...over,
  };
}

const ids = (list: IntakeAddress[]) => list.map((a) => a.id);

/** A Collegiate-like school after moving to grade lists. */
function collegiate(): IntakeAddress[] {
  const singles = ["7", "K", "12", "3", "10", "1", "5", "9", "2", "11", "4", "8", "6"].map((g) =>
    addr({ id: `grade-${g}`, label: g === "K" ? "Kindergarten" : `Grade ${g}`, visibleGrades: [g] })
  );
  return [
    addr({ id: "pta", label: "PTA" }),
    ...singles.slice(0, 5),
    addr({ id: "upper-list", label: "Upper School", visibleGrades: ["9", "10", "11", "12"] }),
    addr({ id: "div-upper", kind: "division", divisionId: "div-upper", enabled: false }),
    addr({ id: "school", kind: "school" }),
    addr({ id: "lower-list", label: "Lower School", visibleGrades: ["K", "1", "2", "3", "4"] }),
    addr({ id: "div-lower", kind: "division", divisionId: "div-lower", enabled: false }),
    ...singles.slice(5),
    addr({ id: "middle-list", label: "Middle School", visibleGrades: ["5", "6", "7", "8"] }),
    addr({ id: "div-middle", kind: "division", divisionId: "div-middle", enabled: false }),
    addr({ id: "admissions", label: "admissions" }),
  ];
}

const SINGLE_ORDER = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map((g) => `grade-${g}`);

test("Collegiate: whole school, grade-range lists, single grades, then other lists; off ones apart", () => {
  const { enabled, switchedOff } = splitIntakeAddresses(collegiate(), DIVISIONS);
  assert.deepEqual(ids(enabled), [
    "school",
    "lower-list",
    "middle-list",
    "upper-list",
    ...SINGLE_ORDER,
    "admissions",
    "pta",
  ]);
  assert.deepEqual(ids(switchedOff), ["div-lower", "div-middle", "div-upper"]);
});

test("the order doesn't depend on insertion order", () => {
  const forward = collegiate();
  const reversed = [...forward].reverse();
  assert.deepEqual(ids(sortIntakeAddresses(reversed, DIVISIONS)), ids(sortIntakeAddresses(forward, DIVISIONS)));
});

test("switching a division address on puts it first among the divisions, in division order", () => {
  const all = collegiate().map((a) => (a.id === "div-middle" || a.id === "div-lower" ? { ...a, enabled: true } : a));
  const { enabled, switchedOff } = splitIntakeAddresses(all, DIVISIONS);
  assert.deepEqual(ids(enabled).slice(0, 6), [
    "school",
    "div-lower",
    "div-middle",
    "lower-list",
    "middle-list",
    "upper-list",
  ]);
  assert.deepEqual(ids(switchedOff), ["div-upper"]);
});

test("switching a list off moves it to the off section, keeping the same order there", () => {
  const all = collegiate().map((a) => (a.id === "grade-3" || a.id === "pta" ? { ...a, enabled: false } : a));
  const { enabled, switchedOff } = splitIntakeAddresses(all, DIVISIONS);
  assert.ok(!ids(enabled).includes("grade-3"));
  assert.deepEqual(ids(switchedOff), ["div-lower", "div-middle", "div-upper", "grade-3", "pta"]);
});

test("grade ranges: lowest grade, then highest, then name, then age; Pre-K before K", () => {
  const sorted = sortIntakeAddresses([
    addr({ id: "9-12", label: "A", visibleGrades: ["9", "12", "10", "11"] }),
    addr({ id: "9-10", label: "Z", visibleGrades: ["9", "10"] }),
    addr({ id: "9-10-b", label: "B", visibleGrades: ["10", "9"] }),
    addr({ id: "9-10-b-newer", label: "b", visibleGrades: ["9", "10"] }),
    addr({ id: "prek-k", label: "Early", visibleGrades: ["K", "Pre-K"] }),
    addr({ id: "prek", label: "Little ones", visibleGrades: ["Pre-K"] }),
    addr({ id: "k", label: "Kindergarten", visibleGrades: ["K"] }),
  ]);
  assert.deepEqual(ids(sorted), ["prek-k", "9-10-b", "9-10-b-newer", "9-10", "9-12", "prek", "k"]);
});

test("unrestricted lists sort by name, numbers naturally, ignoring case", () => {
  const sorted = sortIntakeAddresses([
    addr({ id: "c", label: "Clubs 10" }),
    addr({ id: "a", label: "athletics" }),
    addr({ id: "b", label: "Clubs 9" }),
    addr({ id: "t", token: "ams-0token" }),
  ]);
  assert.deepEqual(ids(sorted), ["t", "a", "b", "c"]);
});

test("summarizeAddresses leaves deleted addresses out", () => {
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    token: `ams-${id}`,
    division_id: null,
    kind: "list",
    label: id,
    created_at: at(),
    ...over,
  });
  const summary = summarizeAddresses(
    [
      row("school", { kind: "school" }),
      row("gone", { deleted_at: "2026-11-01T00:00:00Z", enabled: false }),
      row("div-gone", { kind: "division", division_id: "div-lower", deleted_at: "2026-11-01T00:00:00Z", enabled: false }),
      row("kept"),
    ],
    DIVISIONS as EventCalendar[]
  );
  assert.deepEqual(ids(summary.addresses), ["school", "kept"]);
  assert.deepEqual(summary.divisionAddresses, []);
  assert.equal(summary.wholeSchoolToken, "ams-school");
});
