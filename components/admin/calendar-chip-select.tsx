"use client";

import { Plus } from "lucide-react";
import { calendarColorClasses, KIND_LABELS } from "@/lib/event-calendars";
import { cn } from "@/lib/utils";
import type { EventCalendar, EventCalendarKind } from "@/lib/types";

// Toggleable color-coded chips for picking divisions /
// categories on an event, plus an optional trailing "+ New"
// button. Shared by the event form and the import review table.
export function CalendarChipSelect({
  items,
  kind,
  selected,
  onToggle,
  onCreateNew,
}: {
  items: EventCalendar[];
  kind: EventCalendarKind;
  selected: string[];
  onToggle: (id: string) => void;
  onCreateNew?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((cal) => {
        const on = selected.includes(cal.id);
        const colors = calendarColorClasses(cal.color);
        return (
          <button
            key={cal.id}
            type="button"
            onClick={() => onToggle(cal.id)}
            aria-pressed={on}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              on
                ? cn(colors.chip, "border-transparent")
                : "border-border text-muted-foreground hover:bg-accent"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                on ? colors.dot : "bg-muted-foreground/40"
              )}
            />
            {cal.name}
          </button>
        );
      })}
      {onCreateNew && (
        <button
          type="button"
          onClick={onCreateNew}
          className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />
          New {KIND_LABELS[kind].singular.toLowerCase()}
        </button>
      )}
    </div>
  );
}
