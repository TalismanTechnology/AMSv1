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
  return <CalendarView events={events} eventCalendars={eventCalendars} />;
}
