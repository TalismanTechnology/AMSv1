// Pure helpers behind the private /wall dashboard (lib/wall/stats.ts,
// app/wall, app/wall.png). No I/O here so it can be unit tested, and nothing
// server-only, so the client component can share the types.
//
// Every number on the wall comes from lib/metrics (the same definitions as
// admin Analytics and the dashboard); days are Eastern (lib/metrics/time.ts).

export { formatEtTime } from "@/lib/metrics/time";

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
