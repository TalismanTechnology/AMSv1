// Calendar days for every metric (admin Analytics, the dashboard strip,
// /wall): America/New_York days — the school day, not the server's (UTC)
// day. Schools have no timezone of their own yet, so this is the one zone.
// Pure, nothing server-only, so client components can use it too.

export const METRICS_TIME_ZONE = "America/New_York";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: METRICS_TIME_ZONE,
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

const toDate = (date: Date | string) => (typeof date === "string" ? new Date(date) : date);

/** Minutes Eastern time is ahead of UTC at `date` (-240 in EDT, -300 in EST). */
function etOffsetMinutes(date: Date): number {
  const p = etParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** "YYYY-MM-DD" of the Eastern calendar day containing `date`. */
export function etDayKey(date: Date | string): string {
  const p = etParts(toDate(date));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Hour of day (0–23) in Eastern time. */
export function etHour(date: Date | string): number {
  return etParts(toDate(date)).hour;
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

/** Eastern calendar days from `start`'s day through `now`'s day, inclusive (≥ 1). */
export function etDaysInclusive(start: Date | string, now: Date): number {
  const toUtcDay = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const diff = Math.round((toUtcDay(etDayKey(now)) - toUtcDay(etDayKey(start))) / 86_400_000);
  return Math.max(1, diff + 1);
}

/** Count timestamps per Eastern day over the last `days` days; others ignored. */
export function bucketByEtDay(
  timestamps: Iterable<string>,
  now: Date,
  days: number
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
    timeZone: METRICS_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  })
    .format(toDate(date))
    .replace(/[  ]/g, " ");
}

/**
 * "Oct 28" for a "YYYY-MM-DD" day key. Read as a calendar date, not an
 * instant — `new Date("2026-10-28")` is UTC midnight, which is Oct 27 in
 * any US browser.
 */
export function formatDayKey(key: string, opts: { year?: boolean } = {}): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(opts.year ? { year: "numeric" } : {}),
  });
}
