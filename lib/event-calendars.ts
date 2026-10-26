import type { EventCalendar, EventCalendarKind } from "@/lib/types";

// Fixed palette admins choose from when creating a
// division or category. The bare name is stored on
// event_calendars.color.
export const CALENDAR_COLOR_PALETTE = [
  "slate",
  "sky",
  "emerald",
  "amber",
  "violet",
  "rose",
  "teal",
  "orange",
] as const;

export type CalendarColor = (typeof CALENDAR_COLOR_PALETTE)[number];

interface ColorClasses {
  dot: string; // solid swatch
  chip: string; // tinted background + text for badges
  pill: string; // month-view event pill: tint, text and left rule
  block: string; // week/day time-grid block: lighter tint and left rule
}

const COLOR_CLASSES: Record<string, ColorClasses> = {
  slate: {
    dot: "bg-slate-500",
    chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    pill: "bg-slate-500/15 text-slate-700 border-l-slate-500 dark:text-slate-300",
    block: "bg-slate-500/10 border-l-slate-500",
  },
  sky: {
    dot: "bg-sky-500",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    pill: "bg-sky-500/15 text-sky-700 border-l-sky-500 dark:text-sky-300",
    block: "bg-sky-500/10 border-l-sky-500",
  },
  emerald: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    pill: "bg-emerald-500/15 text-emerald-700 border-l-emerald-500 dark:text-emerald-300",
    block: "bg-emerald-500/10 border-l-emerald-500",
  },
  amber: {
    dot: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    pill: "bg-amber-500/15 text-amber-700 border-l-amber-500 dark:text-amber-300",
    block: "bg-amber-500/10 border-l-amber-500",
  },
  violet: {
    dot: "bg-violet-500",
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    pill: "bg-violet-500/15 text-violet-700 border-l-violet-500 dark:text-violet-300",
    block: "bg-violet-500/10 border-l-violet-500",
  },
  rose: {
    dot: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    pill: "bg-rose-500/15 text-rose-700 border-l-rose-500 dark:text-rose-300",
    block: "bg-rose-500/10 border-l-rose-500",
  },
  teal: {
    dot: "bg-teal-500",
    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    pill: "bg-teal-500/15 text-teal-700 border-l-teal-500 dark:text-teal-300",
    block: "bg-teal-500/10 border-l-teal-500",
  },
  orange: {
    dot: "bg-orange-500",
    chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    pill: "bg-orange-500/15 text-orange-700 border-l-orange-500 dark:text-orange-300",
    block: "bg-orange-500/10 border-l-orange-500",
  },
};

// Events with no label read as neutral, distinct from every palette color.
export const UNLABELED_CLASSES: ColorClasses = {
  dot: "bg-muted-foreground/60",
  chip: "bg-muted-foreground/15 text-muted-foreground",
  pill: "bg-muted-foreground/15 text-muted-foreground border-l-muted-foreground",
  block: "bg-muted-foreground/10 border-l-muted-foreground",
};

export function calendarColorClasses(color: string): ColorClasses {
  return COLOR_CLASSES[color] ?? COLOR_CLASSES.slate;
}

/** The first palette color no existing label uses, so new labels stand apart. */
export function nextLabelColor(usedColors: string[]): CalendarColor {
  const used = new Set(usedColors);
  const palette = CALENDAR_COLOR_PALETTE.filter((c) => c !== "slate");
  return palette.find((c) => !used.has(c)) ?? palette[usedColors.length % palette.length];
}

export function isCalendarColor(color: string): color is CalendarColor {
  return (CALENDAR_COLOR_PALETTE as readonly string[]).includes(color);
}

// The same palette as hex, for drawing outside Tailwind (the sorting map).
const COLOR_HEX: Record<string, string> = {
  slate: "#64748b",
  sky: "#0ea5e9",
  emerald: "#10b981",
  amber: "#f59e0b",
  violet: "#8b5cf6",
  rose: "#f43f5e",
  teal: "#14b8a6",
  orange: "#f97316",
};

export function calendarHex(color: string): string {
  return COLOR_HEX[color] ?? COLOR_HEX.slate;
}

export const KIND_LABELS: Record<
  EventCalendarKind,
  { singular: string; plural: string }
> = {
  division: { singular: "Division", plural: "Divisions" },
  category: { singular: "Category", plural: "Categories" },
};

// Split a flat calendar list into the two dimensions,
// each sorted by sort_order then name.
export function splitCalendars(calendars: EventCalendar[]) {
  const sorted = [...calendars].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
  return {
    divisions: sorted.filter((c) => c.kind === "division"),
    categories: sorted.filter((c) => c.kind === "category"),
  };
}
