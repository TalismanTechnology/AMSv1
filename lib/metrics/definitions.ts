// The ONE definition of each number shown on admin Analytics, the admin
// dashboard strip and /wall (see docs/metrics.md). Pure: rows in, numbers
// out, so it can be unit tested; lib/metrics/load.ts does the reads.
//
// Definitions:
//   - parent: a 'parent' school_memberships row. Approved (approved = true)
//     parents are "Total parents"; the rest are pending. Counted as distinct
//     users, so across all schools a parent at two schools counts once.
//   - new parents: approved parents whose FIRST approved parent membership
//     was created in the window (the growth chart uses the same date).
//   - active parent: asked a question (analytics_events 'question') in the
//     window and has a parent membership (approved or not — the same test
//     the purge cron stamps into a scrubbed event's asker_parent) in that
//     school. Keyed per school with the scrub-aware asker key
//     (lib/insights/scrub.ts), so a parent counts once either side of the
//     scrub. Across all schools it is the sum per school: scrubbed events
//     only carry a per-school hash, so one person at two schools can't be
//     matched up.
//   - questions: analytics_events rows with event_type 'question'.
//   - answer rate: answered / asked over the window's question events.
//   - days, "today" and hours are Eastern time (lib/metrics/time.ts).

import { askerKey } from "@/lib/insights/scrub";
import {
  ACTIVE_PARENTS_DAYS,
  ALL_TIME_LABEL,
  ANSWER_RATE_DAYS,
  AVG_PER_DAY_DAYS,
  NEW_PARENTS_DAYS,
  TODAY_LABEL,
  lastDaysLabel,
  rangeDays,
  rangeLabel,
  windowStart,
  type MetricRange,
} from "./windows";
import { METRICS_TIME_ZONE, etDayKey, etDaysInclusive, etHour, lastEtDayKeys } from "./time";

export interface ParentMembershipRow {
  user_id: string;
  school_id: string;
  created_at: string;
  approved: boolean | null;
}

export interface QuestionEventRow {
  id: string;
  school_id: string | null;
  user_id: string | null;
  created_at: string;
  /** metadata.unanswered */
  unanswered: unknown;
  /** metadata.session_id / metadata.question — gone once scrubbed. */
  session_id: string | null;
  question: string | null;
  /** Scrubbed events: keyed hash of the asker, and whether they were a parent. */
  asker: string | null;
  asker_parent: unknown;
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

/** Distinct users among rows created at or after `since`. */
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

const onOrAfter = (ts: string, since: Date | null) =>
  since === null || new Date(ts).getTime() >= since.getTime();

/** Questions per day over a stated number of days, one decimal place. */
export function averagePerDay(total: number, days: number): number {
  if (days <= 0) return 0;
  return Math.round((total / days) * 10) / 10;
}

// --------------------------------------------
// Parents
// --------------------------------------------

export const isApprovedMembership = (row: { approved: boolean | null }) => row.approved === true;

/** "school|user" for membership lookups. */
export const memberPair = (schoolId: string, userId: string) => `${schoolId}|${userId}`;

/** Earliest approved parent membership per user — when they "joined". */
export function firstJoinedByUser(rows: Iterable<ParentMembershipRow>): Map<string, string> {
  const first = new Map<string, string>();
  for (const row of rows) {
    if (!isApprovedMembership(row)) continue;
    const prev = first.get(row.user_id);
    if (!prev || row.created_at < prev) first.set(row.user_id, row.created_at);
  }
  return first;
}

export interface ParentCounts {
  total: number;
  pending: number;
  newToday: number;
  new7d: number;
}

export function parentCounts(rows: ParentMembershipRow[], now: Date): ParentCounts {
  const joined = firstJoinedByUser(rows);
  const joinedRows = [...joined].map(([user_id, created_at]) => ({ user_id, created_at }));
  return {
    total: joined.size,
    pending: countDistinct(rows.filter((r) => !isApprovedMembership(r)).map((r) => r.user_id)),
    newToday: countDistinctSince(joinedRows, windowStart(1, now)!),
    new7d: countDistinctSince(joinedRows, windowStart(NEW_PARENTS_DAYS, now)!),
  };
}

/** Cumulative approved parents at the end of each day in `dayKeys` (oldest first). */
export function parentGrowth(
  rows: ParentMembershipRow[],
  dayKeys: string[]
): { date: string; total: number }[] {
  if (dayKeys.length === 0) return [];
  const joinedPerDay = new Map<string, number>();
  let cumulative = 0;
  for (const createdAt of firstJoinedByUser(rows).values()) {
    const key = etDayKey(createdAt);
    if (key < dayKeys[0]) cumulative++;
    else joinedPerDay.set(key, (joinedPerDay.get(key) ?? 0) + 1);
  }
  return dayKeys.map((date) => {
    cumulative += joinedPerDay.get(date) ?? 0;
    return { date, total: cumulative };
  });
}

// --------------------------------------------
// Active parents
// --------------------------------------------

/**
 * Distinct active-parent keys per school among events at or after `since`.
 * `parentPairs` holds memberPair(school, user) for every parent membership.
 */
export function activeParentKeys(
  events: Iterable<QuestionEventRow>,
  since: Date | null,
  parentPairs: ReadonlySet<string>,
  secret: string | null
): Map<string, Set<string>> {
  const bySchool = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.school_id || !onOrAfter(e.created_at, since)) continue;
    let key: string | null = null;
    if (e.asker) {
      if (e.asker_parent === true) key = e.asker;
    } else if (e.user_id && parentPairs.has(memberPair(e.school_id, e.user_id))) {
      key = askerKey(e, e.school_id, secret);
    }
    if (!key) continue;
    let set = bySchool.get(e.school_id);
    if (!set) bySchool.set(e.school_id, (set = new Set()));
    set.add(key);
  }
  return bySchool;
}

export function countActiveParents(
  events: Iterable<QuestionEventRow>,
  since: Date | null,
  parentPairs: ReadonlySet<string>,
  secret: string | null
): number {
  let total = 0;
  for (const set of activeParentKeys(events, since, parentPairs, secret).values()) total += set.size;
  return total;
}

// --------------------------------------------
// Answer rate
// --------------------------------------------

/** Lookup key for matching an analytics event to an unanswered_questions row. */
export function sessionQuestionKey(sessionId: string, question: string): string {
  return `${sessionId}\u0000${question}`;
}

export interface QuestionEventFlags {
  /** metadata.unanswered — present on events logged after it was added. */
  unanswered?: unknown;
  sessionId?: string | null;
  question?: string | null;
}

/**
 * Was this question left unanswered (no school sources found)? Uses the
 * explicit flag when the event has one; older events fall back to "an
 * unanswered_questions row exists for the same session with the same text".
 */
export function isUnansweredEvent(
  event: QuestionEventFlags,
  unansweredKeys: ReadonlySet<string>
): boolean {
  if (typeof event.unanswered === "boolean") return event.unanswered;
  if (!event.sessionId || !event.question) return false;
  return unansweredKeys.has(sessionQuestionKey(event.sessionId, event.question));
}

/** Whole-number percentage of questions answered; null when none were asked. */
export function answerRate(total: number, unanswered: number): number | null {
  if (total <= 0) return null;
  const answered = Math.max(0, total - Math.min(unanswered, total));
  return Math.round((answered / total) * 100);
}

/** Answer rate over the given events. */
export function answerRateOf(
  events: QuestionEventRow[],
  unansweredKeys: ReadonlySet<string>
): number | null {
  const unanswered = events.filter((e) =>
    isUnansweredEvent({ unanswered: e.unanswered, sessionId: e.session_id, question: e.question }, unansweredKeys)
  ).length;
  return answerRate(events.length, unanswered);
}

// --------------------------------------------
// Series
// --------------------------------------------

/** Count timestamps per day in `dayKeys` (Eastern days); others ignored. */
export function dailyCounts(
  timestamps: Iterable<string>,
  dayKeys: string[]
): { date: string; count: number }[] {
  const counts = new Map(dayKeys.map((k) => [k, 0]));
  for (const ts of timestamps) {
    const key = etDayKey(ts);
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  return dayKeys.map((date) => ({ date, count: counts.get(date)! }));
}

/** Count timestamps per Eastern hour of day, 0–23. */
export function hourlyCounts(timestamps: Iterable<string>): { hour: number; count: number }[] {
  const counts = new Array<number>(24).fill(0);
  for (const ts of timestamps) counts[etHour(ts)]++;
  return counts.map((count, hour) => ({ hour, count }));
}

// --------------------------------------------
// Documents
// --------------------------------------------

export function normalizeFileType(raw: string | null | undefined): string {
  if (!raw) return "Other";
  const lower = raw.toLowerCase();
  if (lower.includes("pdf")) return "PDF";
  if (lower.includes("word") || lower.includes("docx")) return "DOCX";
  if (lower.includes("sheet") || lower.includes("xlsx")) return "XLSX";
  if (lower.includes("csv")) return "CSV";
  if (lower.includes("text")) return "TXT";
  if (lower.includes("pptx") || lower.includes("presentation")) return "PPTX";
  return raw.toUpperCase();
}

export function documentTypeCounts(
  rows: Iterable<{ file_type: string | null }>
): { type: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const type = normalizeFileType(row.file_type);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

// --------------------------------------------
// Headline metrics
// --------------------------------------------

export interface MetricInputs {
  now: Date;
  range: MetricRange;
  /** Every parent membership in scope (approved and pending). */
  memberships: ParentMembershipRow[];
  /**
   * Question events since at least the earliest window needed
   * (eventsWindowStart); all of them for the "all" range.
   */
  events: QuestionEventRow[];
  /** sessionQuestionKey(...) of unanswered_questions rows, for legacy events. */
  unansweredKeys: ReadonlySet<string>;
  /** Exact count of every question event in scope. */
  questionsAllTime: number;
  secret: string | null;
}

/** The earliest event the headline needs: the range, the 7- and 30-day windows. */
export function eventsWindowStart(range: MetricRange, now: Date): Date | null {
  const days = rangeDays(range);
  if (days === null) return null;
  return windowStart(Math.max(days, ANSWER_RATE_DAYS, ACTIVE_PARENTS_DAYS, AVG_PER_DAY_DAYS), now);
}

/** Days the range's charts cover. "all" starts at the first question or parent. */
export function seriesDays(range: MetricRange, inputs: Pick<MetricInputs, "now" | "events" | "memberships">): number {
  const days = rangeDays(range);
  if (days !== null) return days;
  let earliest: string | null = null;
  for (const e of inputs.events) if (!earliest || e.created_at < earliest) earliest = e.created_at;
  for (const created of firstJoinedByUser(inputs.memberships).values()) {
    if (!earliest || created < earliest) earliest = created;
  }
  return Math.max(ANSWER_RATE_DAYS, earliest ? etDaysInclusive(earliest, inputs.now) : 0);
}

export interface MetricLabels {
  today: string;
  allTime: string;
  range: string;
  activeParents: string;
  newParents: string;
  avgPerDay: string;
  answerRate: string;
}

export interface HeadlineMetrics {
  generatedAt: string;
  timeZone: string;
  range: MetricRange;
  /** Human labels for each window, to print next to the numbers. */
  labels: MetricLabels;
  parents: ParentCounts;
  activeParents: { last7d: number; inRange: number };
  questions: {
    allTime: number;
    today: number;
    last7d: number;
    inRange: number;
    /** questions.last7d / 7 */
    avgPerDay7d: number;
    /** questions.inRange / days in the range's chart */
    avgPerDayInRange: number;
  };
  answerRate: { last30d: number | null; inRange: number | null };
  /** One entry per Eastern day of the range, oldest first. */
  questionsByDay: { date: string; count: number }[];
  /** Questions in the range by Eastern hour of day. */
  questionsByHour: { hour: number; count: number }[];
  /** Cumulative approved parents at the end of each day of the range. */
  parentGrowth: { date: string; total: number }[];
}

export function computeHeadlineMetrics(inputs: MetricInputs): HeadlineMetrics {
  const { now, range, memberships, events, unansweredKeys, secret } = inputs;
  const days = seriesDays(range, inputs);
  const dayKeys = lastEtDayKeys(now, days);
  const rangeStart = windowStart(rangeDays(range), now);
  const todayStart = windowStart(1, now);
  const weekStart = windowStart(AVG_PER_DAY_DAYS, now);
  const activeStart = windowStart(ACTIVE_PARENTS_DAYS, now);
  const answerStart = windowStart(ANSWER_RATE_DAYS, now);

  const since = (start: Date | null) => events.filter((e) => onOrAfter(e.created_at, start));
  const inRange = since(rangeStart);
  const last7d = since(weekStart).length;

  const parentPairs = new Set(memberships.map((m) => memberPair(m.school_id, m.user_id)));

  return {
    generatedAt: now.toISOString(),
    timeZone: METRICS_TIME_ZONE,
    range,
    labels: {
      today: TODAY_LABEL,
      allTime: ALL_TIME_LABEL,
      range: rangeLabel(range),
      activeParents: lastDaysLabel(ACTIVE_PARENTS_DAYS),
      newParents: lastDaysLabel(NEW_PARENTS_DAYS),
      avgPerDay: lastDaysLabel(AVG_PER_DAY_DAYS),
      answerRate: lastDaysLabel(ANSWER_RATE_DAYS),
    },
    parents: parentCounts(memberships, now),
    activeParents: {
      last7d: countActiveParents(events, activeStart, parentPairs, secret),
      inRange: countActiveParents(events, rangeStart, parentPairs, secret),
    },
    questions: {
      allTime: Math.max(inputs.questionsAllTime, events.length),
      today: since(todayStart).length,
      last7d,
      inRange: inRange.length,
      avgPerDay7d: averagePerDay(last7d, AVG_PER_DAY_DAYS),
      avgPerDayInRange: averagePerDay(inRange.length, days),
    },
    answerRate: {
      last30d: answerRateOf(since(answerStart), unansweredKeys),
      inRange: answerRateOf(inRange, unansweredKeys),
    },
    questionsByDay: dailyCounts(
      inRange.map((e) => e.created_at),
      dayKeys
    ),
    questionsByHour: hourlyCounts(inRange.map((e) => e.created_at)),
    parentGrowth: parentGrowth(memberships, dayKeys),
  };
}
