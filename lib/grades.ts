/** Grade levels a child can be enrolled in. Values are stored in children.grade. */
export const GRADES = [
  { value: "Pre-K", label: "Pre-K" },
  { value: "K", label: "Kindergarten" },
  { value: "1", label: "1st Grade" },
  { value: "2", label: "2nd Grade" },
  { value: "3", label: "3rd Grade" },
  { value: "4", label: "4th Grade" },
  { value: "5", label: "5th Grade" },
  { value: "6", label: "6th Grade" },
  { value: "7", label: "7th Grade" },
  { value: "8", label: "8th Grade" },
  { value: "9", label: "9th Grade" },
  { value: "10", label: "10th Grade" },
  { value: "11", label: "11th Grade" },
  { value: "12", label: "12th Grade" },
] as const;

export const GRADE_VALUES = GRADES.map((grade) => grade.value) as readonly string[];

const GRADE_LABELS = new Map<string, string>(
  GRADES.map((grade) => [grade.value, grade.label])
);

/**
 * Render a stored grade value for display.
 *
 * Values are stored bare ("8", "K"), which is ambiguous everywhere it surfaces
 * — "Lucas (8)" reads as an eight-year-old. Always format before showing a
 * grade to a person or putting one in a prompt. Unrecognised values (legacy
 * free-text from older signups) are passed through unchanged.
 */
export function formatGrade(value: string | null | undefined): string {
  if (!value) return "";
  return GRADE_LABELS.get(value) ?? value;
}

// ── Yearly rollover ──────────────────────────────────────────────
// Mirrors supabase/migrations/043_grade_rollover.sql, which is what actually
// moves grades up (daily cron). Each child is anchored to a graduating class
// (children.class_year: the year they finish 12th grade); children.grade is
// the grade that class is in this school year. Pure — no I/O.

export interface Rollover {
  /** 1-12 */
  month: number;
  /** 1-31, and must exist in `month` (see isValidRollover). */
  day: number;
}

/** Used when a school has no settings row (or before migration 043). */
export const DEFAULT_ROLLOVER: Rollover = { month: 7, day: 1 };

/** Every school's local date is judged in this zone, as in the SQL. */
export const SCHOOL_TIME_ZONE = "America/New_York";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const ROLLOVER_MONTHS = MONTH_NAMES.map((label, i) => ({ value: i + 1, label }));

/** Pre-K = -1, K = 0, "1".."12" = 1..12; anything else null. */
export function gradeIndex(grade: string | null | undefined): number | null {
  if (!grade) return null;
  const position = GRADE_VALUES.indexOf(grade);
  return position === -1 ? null : position - 1;
}

/** Inverse of gradeIndex; null outside -1..12. */
export function gradeFromIndex(index: number): string | null {
  if (!Number.isInteger(index)) return null;
  return GRADE_VALUES[index + 1] ?? null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function localDate(at: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/**
 * The calendar year the current school year started in: the rollover date's
 * year if the local date has reached it, else the year before. A rollover day
 * the month doesn't have is clamped to its last day, as in the SQL.
 */
export function schoolYearStart(
  at: Date,
  rollover: Rollover,
  timeZone: string = SCHOOL_TIME_ZONE
): number {
  const { year, month, day } = localDate(at, timeZone);
  const rolloverDay = Math.min(rollover.day, daysInMonth(year, rollover.month));
  const reached =
    month > rollover.month || (month === rollover.month && day >= rolloverDay);
  return reached ? year : year - 1;
}

/** The graduating class for a grade this school year; null if unrecognised. */
export function classYearForGrade(
  grade: string | null | undefined,
  schoolYearStart: number
): number | null {
  const index = gradeIndex(grade);
  return index === null ? null : schoolYearStart + 1 + (12 - index);
}

/**
 * The grade a class is in this school year. Past 12th grade the child has
 * graduated (their grade stays "12"); younger than Pre-K there is no grade.
 */
export function gradeForClassYear(
  classYear: number,
  schoolYearStart: number
): { grade: string | null; graduated: boolean } {
  const index = 12 - (classYear - (schoolYearStart + 1));
  if (index > 12) return { grade: "12", graduated: true };
  return { grade: gradeFromIndex(index), graduated: false };
}

/** Days a rollover may fall on in `month` — February has 28, never 29. */
export function rolloverDaysInMonth(month: number): number {
  return daysInMonth(2025, month);
}

/** A month/day that exists every year (so not February 29). */
export function isValidRollover(month: number, day: number): boolean {
  return (
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= rolloverDaysInMonth(month)
  );
}

/** "July 1" */
export function formatRollover(month: number, day: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${day}`;
}

/** "Class of 2031" */
export function formatClassYear(classYear: number): string {
  return `Class of ${classYear}`;
}
