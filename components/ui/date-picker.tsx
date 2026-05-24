"use client";

import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  addMonths,
  subMonths,
  isToday,
  parseISO,
  isValid,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value: string; // YYYY-MM-DD; "" means unset
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  allowClear?: boolean;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function parseValue(value: string): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  id,
  disabled = false,
  allowClear = true,
}: DatePickerProps) {
  const selected = parseValue(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(selected ?? new Date());

  // Snap the displayed month back to the selected
  // (or today) each time the popover re-opens.
  function handleOpenChange(next: boolean) {
    if (next) setMonth(selected ?? new Date());
    setOpen(next);
  }

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });

  function selectDay(day: Date) {
    onChange(format(day, "yyyy-MM-dd"));
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !selected && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="h-4 w-4 opacity-60" />
          {selected ? format(selected, "MMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-3" align="start">
        {/* Month header */}
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setMonth((m) => subMonths(m, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {format(month, "MMMM yyyy")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Weekday row */}
        <div className="mb-1 grid grid-cols-7">
          {WEEKDAYS.map((d, i) => (
            <div
              key={i}
              className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((day) => {
            const inMonth = isSameMonth(day, month);
            const isSel = selected ? isSameDay(day, selected) : false;
            const today = isToday(day);
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => selectDay(day)}
                className={cn(
                  "h-8 rounded-md text-xs font-medium transition-colors",
                  !inMonth && "text-muted-foreground/30",
                  inMonth && !isSel && "hover:bg-accent",
                  isSel && "bg-primary text-primary-foreground",
                  today && !isSel && "text-primary ring-1 ring-inset ring-primary/40"
                )}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          {allowClear && value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => selectDay(new Date())}
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
