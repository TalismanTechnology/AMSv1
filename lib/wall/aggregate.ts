// Pure helpers behind the private /wall dashboard (lib/wall/stats.ts,
// app/wall, app/wall.png). No I/O here so it can be unit tested, and nothing
// server-only, so the client component can share the types.
//
// "Days" on the wall are America/New_York calendar days: the school day, not
// the server's (UTC) day.

export const WALL_TIME_ZONE = "America/New_York";
export const SPARKLINE_DAYS = 14;

/** Aggregates only — never names, emails, ids or question text. */
export interface WallStats {
  /** ISO time the numbers were read. */
  generatedAt: string;
  /** Distinct users with an approved parent membership in any school. */
  totalParents: number;
  newParentsToday: number;
  newParents7d: number;
  /** Parents who asked a question in the last 7 days (per school, summed). */
  activeParents7d: number;
  questionsTotal: number;
  questionsToday: number;
  /** Whole-number % of questions answered over ANSWER_RATE_DAYS; null if none. */
  answerRate: number | null;
  answerRateDays: number;
  sparkline: { date: string; count: number }[];
  schoolsCount: number;
  collegiate: {
    parents: number;
    active7d: number;
    questions: number;
    answerRate: number | null;
  } | null;
}

// --------------------------------------------
// Eastern-time days
// --------------------------------------------

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: WALL_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function etParts(date: Date) {
  const get = (type: string) =>
    Number(partsFormatter.formatToParts(date).find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Minutes Eastern time is ahead of UTC at `date` (-240 in EDT, -300 in EST). */
function etOffsetMinutes(date: Date): number {
  const p = etParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** "YYYY-MM-DD" of the Eastern calendar day containing `date`. */
export function etDayKey(date: Date | string): string {
  const p = etParts(typeof date === "string" ? new Date(date) : date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The instant of Eastern midnight starting the day `daysBack` days before `now`'s day. */
export function etStartOfDay(now: Date, daysBack = 0): Date {
  const p = etParts(now);
  const wallMidnight = Date.UTC(p.year, p.month - 1, p.day - daysBack);
  // Guess with the offset now, then correct with the offset at the guess
  // (they differ when a DST change falls in between).
  let instant = wallMidnight - etOffsetMinutes(now) * 60_000;
  instant = wallMidnight - etOffsetMinutes(new Date(instant)) * 60_000;
  return new Date(instant);
}

/** The last `days` Eastern day keys, oldest first, ending with today. */
export function lastEtDayKeys(now: Date, days: number): string[] {
  const keys: string[] = [];
  for (let back = days - 1; back >= 0; back--) {
    // Noon of the day avoids DST edges entirely.
    keys.push(etDayKey(new Date(etStartOfDay(now, back).getTime() + 12 * 3_600_000)));
  }
  return keys;
}

/** Count timestamps per Eastern day over the last `days` days; others ignored. */
export function bucketByEtDay(
  timestamps: Iterable<string>,
  now: Date,
  days = SPARKLINE_DAYS
): { date: string; count: number }[] {
  const keys = lastEtDayKeys(now, days);
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const ts of timestamps) {
    const key = etDayKey(ts);
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  return keys.map((date) => ({ date, count: counts.get(date)! }));
}

/**
 * "10:42 AM" in Eastern time. Newer ICU puts a narrow no-break space before
 * AM/PM; a plain space keeps server and browser output identical.
 */
export function formatEtTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: WALL_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  })
    .format(typeof date === "string" ? new Date(date) : date)
    .replace(/[\u202f\u00a0]/g, " ");
}

// --------------------------------------------
// Counting
// --------------------------------------------

/** Number of distinct non-empty keys. */
export function countDistinct(keys: Iterable<string | null | undefined>): number {
  const seen = new Set<string>();
  for (const key of keys) if (key) seen.add(key);
  return seen.size;
}

/** Distinct users among rows created at or after `since` (ISO). */
export function countDistinctSince(
  rows: Iterable<{ user_id: string | null; created_at: string }>,
  since: Date
): number {
  const sinceMs = since.getTime();
  const keys: string[] = [];
  for (const row of rows) {
    if (row.user_id && new Date(row.created_at).getTime() >= sinceMs) keys.push(row.user_id);
  }
  return countDistinct(keys);
}

// --------------------------------------------
// Sparkline
// --------------------------------------------

export interface SparklinePaths {
  /** Stroke path through every point. */
  line: string;
  /** Closed path for the area fill under the line. */
  area: string;
  points: { x: number; y: number }[];
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * SVG paths for a sparkline in a `width`×`height` box with `pad` inset.
 * Smoothed with midpoint quadratic curves; the max value touches the top,
 * zero sits on the bottom. Empty input gives empty paths.
 */
export function sparklinePaths(
  values: number[],
  width: number,
  height: number,
  pad = 2
): SparklinePaths {
  if (values.length === 0) return { line: "", area: "", points: [] };
  const max = Math.max(...values, 0);
  const innerW = Math.max(0, width - pad * 2);
  const innerH = Math.max(0, height - pad * 2);
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  const points = values.map((v, i) => ({
    x: round(pad + (values.length > 1 ? i * step : innerW / 2)),
    y: round(pad + innerH - (max > 0 ? (Math.max(0, v) / max) * innerH : 0)),
  }));

  let line = `M${points[0].x} ${points[0].y}`;
  if (points.length === 1) {
    line += ` L${points[0].x} ${points[0].y}`;
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i];
      const next = points[i + 1];
      line += ` Q${p.x} ${p.y} ${round((p.x + next.x) / 2)} ${round((p.y + next.y) / 2)}`;
    }
    const last = points[points.length - 1];
    line += ` L${last.x} ${last.y}`;
  }
  const bottom = round(pad + innerH);
  const area = `${line} L${points[points.length - 1].x} ${bottom} L${points[0].x} ${bottom} Z`;
  return { line, area, points };
}

// --------------------------------------------
// Layout
// --------------------------------------------

export type WallLayout = "desktop" | "phone";

export function parseWallLayout(value: unknown): WallLayout | null {
  return value === "desktop" || value === "phone" ? value : null;
}

/** Clamp a requested image dimension; anything unparseable → `fallback`. */
export function clampDimension(value: unknown, fallback: number, min = 320, max = 6016): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${rate}%`;
}
