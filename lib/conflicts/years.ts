// Telling two documents from different school years apart without a model.
// Pure, so the rules are unit-tested; scan.ts and judge.ts apply them.
//
// Schools reuse last year's letters almost word for word ("Wednesday,
// September 3: Middle School classes begin" vs "Wednesday, September 9: …"),
// so near-identical chunks with different dates are usually two editions, not
// a contradiction. Two clues settle many of them:
// - a weekday written with its date only fits certain years (Wednesday,
//   September 3 is 2025; Wednesday, September 9 is 2026);
// - explicit years in the titles ("2024 Soccer Preseason", "MSHandbook 25.26").

export interface YearRange {
  min: number;
  max: number;
}

/** The years a weekday date is checked against: four back, one ahead. */
export function yearRange(now = new Date()): YearRange {
  const year = now.getUTCFullYear();
  return { min: year - 4, max: year + 1 };
}

/** A date written with its weekday, e.g. "Wednesday, September 3". */
export interface WeekdayDate {
  text: string;
  month: number;
  day: number;
  /** 0 = Sunday. */
  weekday: number;
  /** Calendar years (in range, or the year written) where the weekday fits. */
  years: number[];
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, weds: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const alternation = (words: Record<string, number>) =>
  Object.keys(words)
    .sort((a, b) => b.length - a.length)
    .join("|");

const WD = `(${alternation(WEEKDAYS)})(?![a-z])\\.?`;
const MO = `(${alternation(MONTHS)})(?![a-z])\\.?`;
const DAY = `(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)`;
const YEAR = `(?:,?\\s*(\\d{4})(?!\\d))?`;

type Field = "weekday" | "month" | "day" | "year";

/** Each pattern with the capture group of each field. */
const PATTERNS: { re: RegExp; groups: Record<Field, number>; weekdayFirst: boolean }[] = [
  // Wednesday, September 3 · Wed., Sept. 3rd, 2025 · Monday the 8th of… is below
  {
    re: new RegExp(`\\b${WD},?\\s+(?:the\\s+)?${MO}\\s*${DAY}${YEAR}`, "gi"),
    groups: { weekday: 1, month: 2, day: 3, year: 4 },
    weekdayFirst: true,
  },
  // Wednesday 3 September · Wednesday, the 3rd of September 2025
  {
    re: new RegExp(`\\b${WD},?\\s+(?:the\\s+)?${DAY}\\s+(?:of\\s+)?${MO}${YEAR}`, "gi"),
    groups: { weekday: 1, day: 2, month: 3, year: 4 },
    weekdayFirst: true,
  },
  // Monday 9/8 · Mon., 9/8/25 · Monday (9/8)
  {
    re: new RegExp(`\\b${WD},?\\s+\\(?(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?(?![\\d/])`, "gi"),
    groups: { weekday: 1, month: 2, day: 3, year: 4 },
    weekdayFirst: true,
  },
  // September 3 (Wednesday) · Sept. 3, 2025 (Wed.)
  {
    re: new RegExp(`\\b${MO}\\s*${DAY}${YEAR}\\s*\\(\\s*${WD}\\s*\\)`, "gi"),
    groups: { month: 1, day: 2, year: 3, weekday: 4 },
    weekdayFirst: false,
  },
  // 9/8 (Monday)
  {
    re: new RegExp(`(?<![\\d/])(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?\\s*\\(\\s*${WD}\\s*\\)`, "gi"),
    groups: { month: 1, day: 2, year: 3, weekday: 4 },
    weekdayFirst: false,
  },
];

/** "Monday–Friday, September 8–12": the second weekday ends a range, not the date's day. */
const RANGE_BEFORE = /(?:[-–—]|\b(?:through|thru|to|until|till)\b)\s*$/i;

function fits(year: number, month: number, day: number, weekday: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day && d.getUTCDay() === weekday;
}

/**
 * Dates written with a weekday, and the years each could be. Mentions whose
 * weekday fits no year (a typo, or a year outside the range) are left out.
 */
export function findWeekdayDates(text: string, range: YearRange): WeekdayDate[] {
  const found = new Map<string, WeekdayDate>();
  for (const { re, groups, weekdayFirst } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (weekdayFirst && RANGE_BEFORE.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
      const weekday = WEEKDAYS[m[groups.weekday].toLowerCase()];
      const monthText = m[groups.month];
      const month = MONTHS[monthText.toLowerCase()] ?? Number(monthText);
      const day = Number(m[groups.day]);
      if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) continue;
      const written = m[groups.year];
      let years: number[];
      if (written) {
        const year = written.length === 2 ? 2000 + Number(written) : Number(written);
        years = fits(year, month, day, weekday) ? [year] : [];
      } else {
        years = [];
        for (let y = range.min; y <= range.max; y++) if (fits(y, month, day, weekday)) years.push(y);
      }
      if (years.length === 0) continue;
      const key = `${weekday}:${month}:${day}:${years.join(",")}`;
      if (!found.has(key)) {
        found.set(key, { text: m[0].replace(/\s+/g, " ").trim(), month, day, weekday, years });
      }
    }
  }
  return [...found.values()];
}

/** The school year (by its starting calendar year) of a date: July onwards starts a new one. */
export function schoolYearOf(year: number, month: number): number {
  return month >= 7 ? year : year - 1;
}

const schoolYearsOf = (d: WeekdayDate) => new Set(d.years.map((y) => schoolYearOf(y, d.month)));

function disjoint(a: Set<number>, b: Set<number>): boolean {
  for (const x of a) if (b.has(x)) return false;
  return true;
}

function intersectAll(sets: Set<number>[]): Set<number> {
  const [first, ...rest] = sets;
  return new Set([...first].filter((x) => rest.every((s) => s.has(x))));
}

/**
 * Do two sides' weekday dates put them in different school years? True when
 * no school year fits dates on both sides, or when each side's dates agree on
 * school years that the other side's don't share. Compared as school years so
 * a calendar running September to June is one year, not two.
 */
export function weekdayDatesDiffer(a: WeekdayDate[], b: WeekdayDate[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setsA = a.map(schoolYearsOf);
  const setsB = b.map(schoolYearsOf);
  const unionA = new Set(setsA.flatMap((s) => [...s]));
  const unionB = new Set(setsB.flatMap((s) => [...s]));
  if (disjoint(unionA, unionB)) return true;
  const allA = intersectAll(setsA);
  const allB = intersectAll(setsB);
  return allA.size > 0 && allB.size > 0 && disjoint(allA, allB);
}

/** Years written out: school years by their starting year, other years as is. */
export interface ExplicitYears {
  schoolYears: number[];
  years: number[];
}

const MIN_YEAR = 2019;
const MAX_YEAR = 2030;
const inYearRange = (y: number) => y >= MIN_YEAR && y <= MAX_YEAR;

// 2025-26 · 2025–2026 · 2025/26 · 25-26 · 25.26 (not $25.26 or 1.25.26). Sticky,
// tried at each position, so "Fall 2025 - 2024-2025" still finds 2024-25.
const SCHOOL_YEAR = /(?<![\d$.,/])((?:20)?\d{2})\s*[-–—/.]\s*((?:20)?\d{2})(?![\d/]|[.,]\d)/y;
const MONTH_OR_DAY_BEFORE = new RegExp(`\\b(?:${alternation(MONTHS)}|${alternation(WEEKDAYS)})\\.?,?\\s*$`, "i");
const BARE_YEAR = /(?<!\d)(20[1-3]\d)(?!\d)/g;

/** Explicit years (2019–2030) and school years ("2025-26", "25.26") in a text. */
export function findExplicitYears(text: string): ExplicitYears {
  const schoolYears = new Set<number>();
  const years = new Set<number>();
  let rest = "";
  for (let i = 0; i < text.length; ) {
    SCHOOL_YEAR.lastIndex = i;
    const m = SCHOOL_YEAR.exec(text);
    if (m) {
      const [match, first, second] = m;
      const start = first.length === 2 ? 2000 + Number(first) : Number(first);
      const end = second.length === 2 ? Math.floor(start / 100) * 100 + Number(second) : Number(second);
      // Only consecutive years ("25-26" is a school year, "10-12" is not), and
      // not after a month or weekday ("August 25-26" is two days).
      if (
        end === start + 1 &&
        inYearRange(start) &&
        !(first.length === 2 && MONTH_OR_DAY_BEFORE.test(text.slice(Math.max(0, i - 12), i)))
      ) {
        schoolYears.add(start);
        rest += " ";
        i += match.length;
        continue;
      }
    }
    rest += text[i];
    i++;
  }
  for (const m of rest.matchAll(BARE_YEAR)) {
    const year = Number(m[1]);
    if (inYearRange(year)) years.add(year);
  }
  const sorted = (s: Set<number>) => [...s].sort((x, y) => x - y);
  return { schoolYears: sorted(schoolYears), years: sorted(years) };
}

const hasYears = (e: ExplicitYears) => e.schoolYears.length > 0 || e.years.length > 0;

/**
 * Do two texts name different years? School years against school years when
 * both have one ("2025-26" vs "2026-27"); otherwise every year named, a school
 * year counting as both its calendar years ("2026-27" and "2026" agree).
 */
export function explicitYearsDiffer(a: ExplicitYears, b: ExplicitYears): boolean {
  if (!hasYears(a) || !hasYears(b)) return false;
  if (a.schoolYears.length > 0 && b.schoolYears.length > 0) {
    return disjoint(new Set(a.schoolYears), new Set(b.schoolYears));
  }
  const calendar = (e: ExplicitYears) => new Set([...e.years, ...e.schoolYears.flatMap((y) => [y, y + 1])]);
  return disjoint(calendar(a), calendar(b));
}

export function formatSchoolYear(start: number): string {
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function formatExplicit(e: ExplicitYears): string {
  return [...e.schoolYears.map(formatSchoolYear), ...e.years.map(String)].join(", ");
}

function formatYears(years: number[]): string {
  return years.join(" or ");
}

/** One side of a pair, for the year checks. */
export interface YearSide {
  title: string;
  /** The chunk's text. */
  text: string;
  /** Weekday dates elsewhere in the document, used when the chunk has none. */
  documentDates?: WeekdayDate[];
}

function datesFor(side: YearSide, range: YearRange): WeekdayDate[] {
  const own = findWeekdayDates(side.text, range);
  return own.length > 0 ? own : side.documentDates ?? [];
}

function describeDates(dates: WeekdayDate[]): string {
  return dates
    .slice(0, 3)
    .map((d) => `"${d.text}" (${formatYears(d.years)})`)
    .join(", ");
}

/**
 * Why two candidate chunks belong to different school years, or null. Checked
 * before judging: such a pair is auto-dismissed without a model call.
 */
export function differentYearEvidence(a: YearSide, b: YearSide, range: YearRange): string | null {
  const titleA = findExplicitYears(a.title);
  const titleB = findExplicitYears(b.title);
  if (explicitYearsDiffer(titleA, titleB)) {
    return `Titles name different years: "${a.title}" (${formatExplicit(titleA)}) vs "${b.title}" (${formatExplicit(titleB)}).`;
  }
  const datesA = datesFor(a, range);
  const datesB = datesFor(b, range);
  if (weekdayDatesDiffer(datesA, datesB)) {
    return `Weekday dates fit different school years: ${describeDates(datesA)} vs ${describeDates(datesB)}.`;
  }
  return null;
}

/** Do the model's two quoted statements date themselves to different years? */
export function statementsDifferInYear(statementA: string, statementB: string, range: YearRange): boolean {
  return (
    weekdayDatesDiffer(findWeekdayDates(statementA, range), findWeekdayDates(statementB, range)) ||
    explicitYearsDiffer(findExplicitYears(statementA), findExplicitYears(statementB))
  );
}

const MAX_CLUE_DATES = 6;

/**
 * Year clues for the judge prompt, e.g.
 * `Years in title: 2024 · Weekday dates: "Wednesday, September 3" matches 2025`.
 * Empty when there are none.
 */
export function describeYearClues(side: YearSide, range: YearRange): string {
  const clues: string[] = [];
  const title = findExplicitYears(side.title);
  if (hasYears(title)) clues.push(`Years in title: ${formatExplicit(title)}`);
  const text = findExplicitYears(side.text);
  if (hasYears(text)) clues.push(`Years in excerpt: ${formatExplicit(text)}`);
  const own = findWeekdayDates(side.text, range);
  if (own.length > 0) {
    const shown = own.slice(0, MAX_CLUE_DATES).map((d) => `"${d.text}" matches ${formatYears(d.years)}`);
    clues.push(`Weekday dates: ${shown.join("; ")}`);
  } else if (side.documentDates?.length) {
    const years = [...new Set(side.documentDates.flatMap((d) => d.years))].sort((x, y) => x - y);
    clues.push(`Weekday dates elsewhere in this document match ${formatYears(years)}`);
  }
  return clues.join(" · ");
}
