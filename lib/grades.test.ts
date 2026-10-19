import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_ROLLOVER,
  GRADE_VALUES,
  classYearForGrade,
  formatClassYear,
  formatGrade,
  formatRollover,
  gradeForClassYear,
  gradeFromIndex,
  gradeIndex,
  isValidRollover,
  schoolYearStart,
} from "./grades";

// --- grade index ---

test("gradeIndex maps Pre-K, K and 1-12", () => {
  assert.equal(gradeIndex("Pre-K"), -1);
  assert.equal(gradeIndex("K"), 0);
  assert.equal(gradeIndex("1"), 1);
  assert.equal(gradeIndex("8"), 8);
  assert.equal(gradeIndex("12"), 12);
});

test("gradeIndex is null for anything it doesn't recognise", () => {
  for (const value of ["", "13", "0", "08", "8th", "Grade 8", "k", "Form V", null, undefined]) {
    assert.equal(gradeIndex(value), null, String(value));
  }
});

test("gradeFromIndex is null outside -1..12", () => {
  assert.equal(gradeFromIndex(-2), null);
  assert.equal(gradeFromIndex(13), null);
  assert.equal(gradeFromIndex(1.5), null);
});

test("every grade round-trips through its index and its class year", () => {
  for (const grade of GRADE_VALUES) {
    assert.equal(gradeFromIndex(gradeIndex(grade)!), grade);
    const classYear = classYearForGrade(grade, 2026)!;
    assert.deepEqual(gradeForClassYear(classYear, 2026), { grade, graduated: false });
  }
});

// --- school year ---

test("July 1 Eastern starts the school year; June 30 doesn't", () => {
  // Midday Eastern on each side of the boundary.
  assert.equal(schoolYearStart(new Date("2026-06-30T16:00:00Z"), DEFAULT_ROLLOVER), 2025);
  assert.equal(schoolYearStart(new Date("2026-07-01T16:00:00Z"), DEFAULT_ROLLOVER), 2026);
  // Midnight Eastern (EDT, UTC-4).
  assert.equal(schoolYearStart(new Date("2026-07-01T03:59:59Z"), DEFAULT_ROLLOVER), 2025);
  assert.equal(schoolYearStart(new Date("2026-07-01T04:00:00Z"), DEFAULT_ROLLOVER), 2026);
});

test("a UTC instant already on July 1 is still June 30 in Eastern time", () => {
  const at = new Date("2026-07-01T02:00:00Z"); // 10pm June 30 EDT
  assert.equal(schoolYearStart(at, DEFAULT_ROLLOVER), 2025);
  assert.equal(schoolYearStart(at, DEFAULT_ROLLOVER, "UTC"), 2026);
});

test("mid-year dates fall in the year that started last July", () => {
  assert.equal(schoolYearStart(new Date("2026-10-17T12:00:00Z"), DEFAULT_ROLLOVER), 2026);
  assert.equal(schoolYearStart(new Date("2027-01-15T12:00:00Z"), DEFAULT_ROLLOVER), 2026);
  assert.equal(schoolYearStart(new Date("2027-06-30T12:00:00Z"), DEFAULT_ROLLOVER), 2026);
});

test("a custom rollover (August 15) moves the boundary", () => {
  const aug15 = { month: 8, day: 15 };
  assert.equal(schoolYearStart(new Date("2026-07-20T12:00:00Z"), aug15), 2025);
  assert.equal(schoolYearStart(new Date("2026-08-14T12:00:00Z"), aug15), 2025);
  assert.equal(schoolYearStart(new Date("2026-08-15T12:00:00Z"), aug15), 2026);
  assert.equal(schoolYearStart(new Date("2026-09-01T12:00:00Z"), aug15), 2026);
});

test("a rollover day the month lacks is clamped to its last day", () => {
  const feb31 = { month: 2, day: 31 };
  assert.equal(schoolYearStart(new Date("2027-02-27T12:00:00Z"), feb31), 2026);
  assert.equal(schoolYearStart(new Date("2027-02-28T12:00:00Z"), feb31), 2027);
});

// --- rolling forward ---

test("8th grade in 2026-27 is the class of 2031 and 9th grade in 2027-28", () => {
  assert.equal(classYearForGrade("8", 2026), 2031);
  assert.deepEqual(gradeForClassYear(2031, 2026), { grade: "8", graduated: false });
  assert.deepEqual(gradeForClassYear(2031, 2027), { grade: "9", graduated: false });
});

test("K moves to 1st and Pre-K to K", () => {
  assert.deepEqual(gradeForClassYear(classYearForGrade("K", 2026)!, 2027), {
    grade: "1",
    graduated: false,
  });
  assert.deepEqual(gradeForClassYear(classYearForGrade("Pre-K", 2026)!, 2027), {
    grade: "K",
    graduated: false,
  });
});

test("12th grade graduates the next school year and stays 12", () => {
  const classYear = classYearForGrade("12", 2026)!;
  assert.equal(classYear, 2027);
  assert.deepEqual(gradeForClassYear(classYear, 2027), { grade: "12", graduated: true });
  assert.deepEqual(gradeForClassYear(classYear, 2030), { grade: "12", graduated: true });
});

test("a class younger than Pre-K has no grade", () => {
  assert.deepEqual(gradeForClassYear(2041, 2026), { grade: null, graduated: false });
});

test("an unrecognised grade has no class year", () => {
  assert.equal(classYearForGrade("Form V", 2026), null);
  assert.equal(classYearForGrade("", 2026), null);
});

// --- rollover setting ---

test("isValidRollover accepts real dates and rejects Feb 29 and nonsense", () => {
  assert.equal(isValidRollover(7, 1), true);
  assert.equal(isValidRollover(8, 15), true);
  assert.equal(isValidRollover(2, 28), true);
  assert.equal(isValidRollover(12, 31), true);
  assert.equal(isValidRollover(2, 29), false);
  assert.equal(isValidRollover(4, 31), false);
  assert.equal(isValidRollover(6, 31), false);
  assert.equal(isValidRollover(0, 1), false);
  assert.equal(isValidRollover(13, 1), false);
  assert.equal(isValidRollover(7, 0), false);
  assert.equal(isValidRollover(7, 32), false);
  assert.equal(isValidRollover(7.5, 1), false);
  assert.equal(isValidRollover(Number.NaN, 1), false);
});

test("formatting", () => {
  assert.equal(formatRollover(7, 1), "July 1");
  assert.equal(formatRollover(8, 15), "August 15");
  assert.equal(formatClassYear(2031), "Class of 2031");
  // Unchanged.
  assert.equal(formatGrade("8"), "8th Grade");
  assert.equal(formatGrade("Form V"), "Form V");
});

// --- agreement with the SQL ---

test("the TS formula matches the worked examples in migration 043", () => {
  const sql = readFileSync(
    path.join(__dirname, "../supabase/migrations/043_grade_rollover.sql"),
    "utf8"
  );
  const forward = [...sql.matchAll(/--\s+grade (\S+) in school year starting (\d{4}) -> class_year (\d{4})/g)];
  const backward = [
    ...sql.matchAll(/--\s+class_year (\d{4}) in school year starting (\d{4}) -> (graduated|grade (\S+))/g),
  ];
  assert.ok(forward.length >= 4, "forward examples found");
  assert.ok(backward.length >= 3, "backward examples found");

  for (const [, grade, start, classYear] of forward) {
    assert.equal(classYearForGrade(grade, Number(start)), Number(classYear), grade);
  }
  for (const [, classYear, start, outcome, grade] of backward) {
    const result = gradeForClassYear(Number(classYear), Number(start));
    if (outcome === "graduated") assert.equal(result.graduated, true, classYear);
    else assert.deepEqual(result, { grade, graduated: false }, classYear);
  }

  // The same numbers, hard-coded, so an edit to the comment can't hide a drift.
  assert.equal(classYearForGrade("8", 2026), 2031);
  assert.equal(classYearForGrade("K", 2026), 2039);
  assert.equal(classYearForGrade("Pre-K", 2026), 2040);
  assert.equal(classYearForGrade("12", 2026), 2027);
  assert.deepEqual(gradeForClassYear(2039, 2027), { grade: "1", graduated: false });
});
