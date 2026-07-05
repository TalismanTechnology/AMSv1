"use client";

import { CalendarView } from "@/components/shared/calendar-view";
import type { SchoolEvent, EventCalendar } from "@/lib/types";

interface ParentEventsClientProps {
  events: SchoolEvent[];
  eventCalendars: EventCalendar[];
}

export function ParentEventsClient({
  events,
  eventCalendars,
}: ParentEventsClientProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-8 md:px-8 md:pt-10">
      <CalendarView events={events} eventCalendars={eventCalendars} />
    </div>
  );
}
