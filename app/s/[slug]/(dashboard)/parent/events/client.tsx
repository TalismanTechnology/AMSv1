"use client";

import { CalendarView } from "@/components/shared/calendar-view";
import type { SchoolEvent } from "@/lib/types";

interface ParentEventsClientProps {
  events: SchoolEvent[];
}

export function ParentEventsClient({ events }: ParentEventsClientProps) {
  return <CalendarView events={events} />;
}
