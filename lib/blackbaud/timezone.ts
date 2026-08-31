// Converting between a UTC instant and a school's wall clock, without pulling
// in a timezone library. `Intl.DateTimeFormat` already ships the full IANA
// database in Node, so it is the source of truth for offsets and DST.

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  partsFormatterCache.set(timeZone, formatter);
  return formatter;
}

/** Validate an IANA zone name before it is stored on a feed. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** What clock time is it in `timeZone` at this instant? */
export function utcToWallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const lookup: Record<string, number> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      lookup[part.type] = Number(part.value);
    }
  }

  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    hour: lookup.hour === 24 ? 0 : lookup.hour, // h23 can emit 24 at midnight
    minute: lookup.minute,
    second: lookup.second,
  };
}

/**
 * The inverse: which instant shows this clock time in `timeZone`?
 *
 * Solved by guessing the instant as if the wall clock were UTC, measuring how
 * far off that guess reads in the target zone, and correcting. Two rounds
 * because the correction can itself cross a DST boundary — the first guess for
 * 2am on a spring-forward night lands in the wrong offset.
 */
export function wallClockToUtc(wall: WallClock, timeZone: string): Date {
  const target = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second
  );

  let guess = target;

  for (let round = 0; round < 2; round++) {
    const seen = utcToWallClock(new Date(guess), timeZone);
    const seenAsUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
      seen.second
    );

    const drift = target - seenAsUtc;
    if (drift === 0) break;
    guess += drift;
  }

  return new Date(guess);
}

/** `2026-09-04`, from a wall clock — never via toISOString, which is UTC. */
export function wallClockDate(wall: WallClock): string {
  const month = String(wall.month).padStart(2, "0");
  const day = String(wall.day).padStart(2, "0");
  return `${wall.year}-${month}-${day}`;
}

/** `14:30:00`, matching postgres `time`. */
export function wallClockTime(wall: WallClock): string {
  const hour = String(wall.hour).padStart(2, "0");
  const minute = String(wall.minute).padStart(2, "0");
  const second = String(wall.second).padStart(2, "0");
  return `${hour}:${minute}:${second}`;
}
