// Time windows and their labels, shared by every place that shows a metric
// (docs/metrics.md). Client-safe: no I/O, nothing server-only.
//
// "Last N days" always means today (Eastern) plus the N-1 Eastern calendar
// days before it, starting at Eastern midnight — so a "Last 7 days" number
// is exactly the sum of the last 7 bars of the per-day chart.

import { etStartOfDay } from "./time";

export type MetricRange = "7d" | "30d" | "90d" | "all";
export const METRIC_RANGES: readonly MetricRange[] = ["7d", "30d", "90d", "all"];
export const DEFAULT_METRIC_RANGE: MetricRange = "30d";

/** Fixed windows, independent of the range selector. */
export const ACTIVE_PARENTS_DAYS = 7;
export const NEW_PARENTS_DAYS = 7;
export const AVG_PER_DAY_DAYS = 7;
export const ANSWER_RATE_DAYS = 30;

export const TODAY_LABEL = "Today (ET)";
export const ALL_TIME_LABEL = "All time";

export function lastDaysLabel(days: number): string {
  return `Last ${days} days`;
}

export function isMetricRange(value: unknown): value is MetricRange {
  return typeof value === "string" && (METRIC_RANGES as readonly string[]).includes(value);
}

/**
 * A search param or action argument → MetricRange, else the default.
 * Accepts the old Insights form too (?range=7 / 30 / 90).
 */
export function parseMetricRange(value: unknown): MetricRange {
  const v = Array.isArray(value) ? value[0] : value;
  if (isMetricRange(v)) return v;
  const asDays = typeof v === "number" ? `${v}d` : typeof v === "string" ? `${v.trim()}d` : null;
  return asDays && asDays !== "alld" && isMetricRange(asDays) ? asDays : DEFAULT_METRIC_RANGE;
}

/** Days in a range; null for all time. */
export function rangeDays(range: MetricRange): number | null {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "all":
      return null;
  }
}

/** Short label for the range selector button. */
export function rangeOptionLabel(range: MetricRange): string {
  const days = rangeDays(range);
  return days === null ? ALL_TIME_LABEL : `${days} days`;
}

/** "Last 30 days" / "All time" — the label printed next to a ranged number. */
export function rangeLabel(range: MetricRange): string {
  const days = rangeDays(range);
  return days === null ? ALL_TIME_LABEL : lastDaysLabel(days);
}

/** Start of a "last `days` days" window (Eastern midnight); null = all time. */
export function windowStart(days: number | null, now: Date): Date | null {
  return days === null ? null : etStartOfDay(now, Math.max(1, days) - 1);
}

