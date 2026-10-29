"use client";

import { CalendarView } from "@/components/shared/calendar-view";
import type { CalendarLabel, SchoolEvent } from "@/lib/types";

interface ParentEventsClientProps {
  events: SchoolEvent[];
  labels: CalendarLabel[];
  initialDate?: string;
}

export function ParentEventsClient({ events, labels, initialDate }: ParentEventsClientProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-5 md:px-8 md:pt-10">
      <CalendarView events={events} labels={labels} initialDate={initialDate} />
    </div>
  );
}
