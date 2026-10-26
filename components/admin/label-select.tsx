"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calendarColorClasses, UNLABELED_CLASSES } from "@/lib/event-calendars";
import { cn } from "@/lib/utils";
import type { CalendarLabel } from "@/lib/types";

// Radix Select reserves "" for "nothing chosen", so "no label" needs a value.
const NONE = "none";

interface LabelSelectProps {
  labels: CalendarLabel[];
  value: string | null;
  onChange: (labelId: string | null) => void;
  id?: string;
}

/** Pick the one label an event is filed under, shown with its color. */
export function LabelSelect({ labels, value, onChange, id }: LabelSelectProps) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(next) => onChange(next === NONE ? null : next)}
    >
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <Swatch dotClass={UNLABELED_CLASSES.dot} />
          No label
        </SelectItem>
        {labels.map((label) => (
          <SelectItem key={label.id} value={label.id}>
            <Swatch dotClass={calendarColorClasses(label.color).dot} />
            {label.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Swatch({ dotClass }: { dotClass: string }) {
  return <span className={cn("mr-2 inline-block h-2.5 w-2.5 rounded-full", dotClass)} />;
}
