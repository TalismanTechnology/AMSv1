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
}

const COLOR_CLASSES: Record<string, ColorClasses> = {
  slate: { dot: "bg-slate-500", chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  sky: { dot: "bg-sky-500", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  emerald: { dot: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  amber: { dot: "bg-amber-500", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  violet: { dot: "bg-violet-500", chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  rose: { dot: "bg-rose-500", chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  teal: { dot: "bg-teal-500", chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
  orange: { dot: "bg-orange-500", chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
};

export function calendarColorClasses(color: string): ColorClasses {
  return COLOR_CLASSES[color] ?? COLOR_CLASSES.slate;
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
