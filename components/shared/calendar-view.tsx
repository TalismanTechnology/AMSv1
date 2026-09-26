"use client";

import { useState, useMemo } from "react";
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
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isToday,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ManageCalendarsPopover } from "@/components/admin/manage-calendars-popover";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { calendarColorClasses, KIND_LABELS } from "@/lib/event-calendars";
import type { SchoolEvent, EventType, EventCalendar } from "@/lib/types";

// ─── Color maps ───────────────────────────────────────────

const TYPE_BADGE_COLORS: Record<EventType, string> = {
  general: "bg-secondary text-secondary-foreground",
  academic: "bg-chart-1/15 text-chart-1",
  sports: "bg-success/15 text-success",
  arts: "bg-chart-2/15 text-chart-2",
  meeting: "bg-chart-3/15 text-chart-3",
  holiday: "bg-destructive/15 text-destructive",
  other: "bg-secondary text-secondary-foreground",
};

const TYPE_PILL_COLORS: Record<EventType, string> = {
  general: "bg-muted-foreground/20 text-muted-foreground border-l-muted-foreground",
  academic: "bg-chart-1/15 text-chart-1 border-l-chart-1",
  sports: "bg-success/15 text-success border-l-success",
  arts: "bg-chart-2/15 text-chart-2 border-l-chart-2",
  meeting: "bg-chart-3/15 text-chart-3 border-l-chart-3",
  holiday: "bg-destructive/15 text-destructive border-l-destructive",
  other: "bg-muted-foreground/20 text-muted-foreground border-l-muted-foreground",
};

const TYPE_BLOCK_COLORS: Record<EventType, string> = {
  general: "bg-muted-foreground/15 border-l-muted-foreground",
  academic: "bg-chart-1/10 border-l-chart-1",
  sports: "bg-success/10 border-l-success",
  arts: "bg-chart-2/10 border-l-chart-2",
  meeting: "bg-chart-3/10 border-l-chart-3",
  holiday: "bg-destructive/10 border-l-destructive",
  other: "bg-muted-foreground/15 border-l-muted-foreground",
};

// Phone month cells are too narrow for pills, so each event becomes a dot.
const TYPE_DOT_COLORS: Record<EventType, string> = {
  general: "bg-muted-foreground/60",
  academic: "bg-chart-1",
  sports: "bg-success",
  arts: "bg-chart-2",
  meeting: "bg-chart-3",
  holiday: "bg-destructive",
  other: "bg-muted-foreground/60",
};

// Division color matches the filter legend; fall back to the event type.
function dotColor(event: SchoolEvent) {
  const division = event.calendars?.find((c) => c.kind === "division");
  if (division) return calendarColorClasses(division.color).dot;
  return (
    TYPE_DOT_COLORS[event.event_type as EventType] || TYPE_DOT_COLORS.general
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_NARROW = ["S", "M", "T", "W", "T", "F", "S"];
const HOUR_START = 7;
const HOUR_END = 21;
const HOUR_HEIGHT = 60; // px per hour
// Hour-label column width, read by the time grid's gridTemplateColumns.
const GUTTER_VAR = "[--gutter:44px] sm:[--gutter:60px]";

type ViewMode = "month" | "week" | "day";

// ─── Helpers ──────────────────────────────────────────────

function formatTimeFull(time: string | null) {
  if (!time) return null;
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

function formatTimeShort(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "p" : "a";
  const displayHour = hour % 12 || 12;
  return m === "00" ? `${displayHour}${ampm}` : `${displayHour}:${m}${ampm}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function groupEventsByDate(events: SchoolEvent[]) {
  const map = new Map<string, SchoolEvent[]>();
  events.forEach((event) => {
    const key = event.date;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(event);
  });
  return map;
}

function hourLabel(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

// ─── Calendar tag chips ───────────────────────────────────

function CalendarChips({ event }: { event: SchoolEvent }) {
  if (!event.calendars || event.calendars.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {event.calendars.map((cal) => {
        const colors = calendarColorClasses(cal.color);
        return (
          <span
            key={cal.id}
            className={cn(
              "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              colors.chip
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
            {cal.name}
          </span>
        );
      })}
    </div>
  );
}

// ─── Event Popover ────────────────────────────────────────

function EventPopover({
  event,
  children,
  onEdit,
  onDelete,
}: {
  event: SchoolEvent;
  children: React.ReactNode;
  onEdit?: (event: SchoolEvent) => void;
  onDelete?: (event: SchoolEvent) => void;
}) {
  // Phones have no room beside a narrow column, so open below instead.
  const isWide = useMediaQuery("(min-width: 640px)");
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-[min(18rem,calc(100vw-2rem))] p-3 space-y-2"
        side={isWide ? "right" : "bottom"}
        align="start"
        sideOffset={8}
        collisionPadding={16}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm">{event.title}</p>
          <Badge
            className={cn(
              "shrink-0 text-[10px]",
              TYPE_BADGE_COLORS[event.event_type as EventType] ||
                TYPE_BADGE_COLORS.general
            )}
          >
            {event.event_type}
          </Badge>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          {event.start_time && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {formatTimeFull(event.start_time)}
              {event.end_time && ` – ${formatTimeFull(event.end_time)}`}
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              {event.location}
            </div>
          )}
          {event.description && (
            <p className="text-muted-foreground/80 line-clamp-3 pt-1">
              {event.description}
            </p>
          )}
        </div>
        <CalendarChips event={event} />
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1 pt-1 border-t">
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onEdit(event)}
              >
                <Pencil className="mr-1 h-3 w-3" />
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => onDelete(event)}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Delete
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Month View ───────────────────────────────────────────

const MAX_PILLS = 3;

function MonthView({
  currentMonth,
  selectedDate,
  eventsByDate,
  onSelectDate,
  onCreateEventOnDate,
  onEditEvent,
  onDeleteEvent,
}: {
  currentMonth: Date;
  selectedDate: Date;
  eventsByDate: Map<string, SchoolEvent[]>;
  onSelectDate: (date: Date) => void;
  onCreateEventOnDate?: (date: string) => void;
  onEditEvent?: (event: SchoolEvent) => void;
  onDeleteEvent?: (event: SchoolEvent) => void;
}) {
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    return eachDayOfInterval({
      start: startOfWeek(monthStart),
      end: endOfWeek(monthEnd),
    });
  }, [currentMonth]);

  return (
    <div className="rounded-lg border bg-card metallic-card overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {WEEKDAYS.map((day, i) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-medium text-muted-foreground sm:py-2.5"
          >
            <abbr title={day} className="no-underline sm:hidden">
              {WEEKDAYS_NARROW[i]}
            </abbr>
            <span className="hidden sm:inline">{day}</span>
          </div>
        ))}
      </div>

      {/* Day cells — dots on phones, event pills from sm up */}
      <div className="grid grid-cols-7">
        {calendarDays.map((day, i) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDate.get(dateStr) || [];
          const inMonth = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, selectedDate);
          const today = isToday(day);
          const visible = dayEvents.slice(0, MAX_PILLS);
          const overflow = dayEvents.length - MAX_PILLS;

          return (
            <div
              key={i}
              onClick={() => onSelectDate(day)}
              onDoubleClick={() => onCreateEventOnDate?.(dateStr)}
              className={cn(
                "relative flex flex-col items-center border-t min-h-[3.25rem] py-1.5 cursor-pointer transition-colors hover:bg-accent/30 sm:items-stretch sm:min-h-[5rem] sm:p-1.5",
                !inMonth && "bg-muted/10 text-muted-foreground/30",
                isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                today && !isSelected && "bg-accent/20"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium sm:mb-1 sm:h-6 sm:w-6 sm:self-end sm:text-xs",
                  isSelected && "bg-primary text-primary-foreground",
                  today && !isSelected && "bg-primary/20 text-primary font-bold"
                )}
              >
                {format(day, "d")}
              </span>
              {dayEvents.length > 0 && (
                <span className="sr-only">
                  , {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
                </span>
              )}

              {dayEvents.length > 0 && (
                <div
                  aria-hidden
                  className={cn(
                    "mt-1 flex items-center gap-[3px] sm:hidden",
                    !inMonth && "opacity-40"
                  )}
                >
                  {visible.map((event) => (
                    <span
                      key={event.id}
                      className={cn("h-1.5 w-1.5 rounded-full", dotColor(event))}
                    />
                  ))}
                  {overflow > 0 && (
                    <span className="text-[9px] font-semibold leading-none text-muted-foreground">
                      +
                    </span>
                  )}
                </div>
              )}

              <div className="hidden flex-1 space-y-0.5 overflow-hidden sm:block">
                {visible.map((event) => (
                  <EventPopover
                    key={event.id}
                    event={event}
                    onEdit={onEditEvent}
                    onDelete={onDeleteEvent}
                  >
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        "w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight border-l-2 transition-opacity hover:opacity-80",
                        TYPE_PILL_COLORS[event.event_type as EventType] ||
                          TYPE_PILL_COLORS.general
                      )}
                    >
                      {event.start_time && (
                        <span className="opacity-60 mr-0.5">
                          {formatTimeShort(event.start_time)}
                        </span>
                      )}
                      {event.title}
                    </button>
                  </EventPopover>
                ))}
                {overflow > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDate(day);
                    }}
                    className="w-full text-left text-[10px] font-medium text-primary hover:underline px-1.5"
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Time Grid (shared by week + day views) ───────────────

function TimeGrid({
  columns,
  eventsByDate,
  onTimeSlotClick,
  onEditEvent,
  onDeleteEvent,
}: {
  columns: Date[];
  eventsByDate: Map<string, SchoolEvent[]>;
  onTimeSlotClick?: (date: string, time: string) => void;
  onEditEvent?: (event: SchoolEvent) => void;
  onDeleteEvent?: (event: SchoolEvent) => void;
}) {
  const hours = Array.from(
    { length: HOUR_END - HOUR_START },
    (_, i) => HOUR_START + i
  );
  const totalHeight = hours.length * HOUR_HEIGHT;
  const colCount = columns.length;

  function getEventStyle(event: SchoolEvent) {
    if (!event.start_time) return null;
    const startMin = timeToMinutes(event.start_time);
    const endMin = event.end_time
      ? timeToMinutes(event.end_time)
      : startMin + 60;
    const topPx = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
    const heightPx = Math.max(
      ((endMin - startMin) / 60) * HOUR_HEIGHT,
      20
    );
    return { top: `${topPx}px`, height: `${heightPx}px` };
  }

  // Check for all-day events
  const hasAllDay = columns.some((day) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return (eventsByDate.get(dateStr) || []).some((e) => !e.start_time);
  });

  return (
    <div className={cn("rounded-lg border bg-card metallic-card overflow-hidden", GUTTER_VAR)}>
      {/* All-day row */}
      {hasAllDay && (
        <div
          className="grid border-b"
          style={{
            gridTemplateColumns: `var(--gutter) repeat(${colCount}, minmax(0, 1fr))`,
          }}
        >
          <div className="text-[10px] text-muted-foreground/60 px-1 py-1.5 text-right">
            all day
          </div>
          {columns.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const allDay = (eventsByDate.get(dateStr) || []).filter(
              (e) => !e.start_time
            );
            return (
              <div
                key={day.toISOString()}
                className="border-l px-0.5 py-1 space-y-0.5"
              >
                {allDay.map((event) => (
                  <EventPopover
                    key={event.id}
                    event={event}
                    onEdit={onEditEvent}
                    onDelete={onDeleteEvent}
                  >
                    <button
                      className={cn(
                        "w-full truncate rounded px-1 py-0.5 text-[10px] font-medium border-l-2",
                        TYPE_PILL_COLORS[event.event_type as EventType] ||
                          TYPE_PILL_COLORS.general
                      )}
                    >
                      {event.title}
                    </button>
                  </EventPopover>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <div
        className="overflow-y-auto relative"
        style={{ maxHeight: "max(22rem, calc(100dvh - 320px))" }}
      >
        {/* Grid lines + click targets */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `var(--gutter) repeat(${colCount}, minmax(0, 1fr))`,
          }}
        >
          {hours.map((hour) => (
            <div key={hour} className="contents">
              <div className="relative h-[60px] border-t text-right">
                <span
                  className={cn(
                    "absolute right-1.5 whitespace-nowrap text-[10px] text-muted-foreground/60 sm:right-2",
                    // The first label would be clipped by the scroll edge.
                    hour === HOUR_START ? "top-0.5" : "-top-2"
                  )}
                >
                  {hourLabel(hour)}
                </span>
              </div>
              {columns.map((day) => (
                <div
                  key={`${day.toISOString()}-${hour}`}
                  className="h-[60px] border-t border-l cursor-pointer hover:bg-accent/20 transition-colors"
                  onClick={() => {
                    const h = hour.toString().padStart(2, "0");
                    onTimeSlotClick?.(
                      format(day, "yyyy-MM-dd"),
                      `${h}:00`
                    );
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Event blocks (absolute overlay) */}
        <div
          className="grid pointer-events-none"
          style={{
            gridTemplateColumns: `var(--gutter) repeat(${colCount}, minmax(0, 1fr))`,
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: `${totalHeight}px`,
          }}
        >
          <div /> {/* gutter */}
          {columns.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const timed = (eventsByDate.get(dateStr) || []).filter(
              (e) => e.start_time
            );
            return (
              <div key={day.toISOString()} className="relative border-l">
                {timed.map((event) => {
                  const style = getEventStyle(event);
                  if (!style) return null;
                  return (
                    <div
                      key={event.id}
                      className="absolute left-0.5 right-0.5 pointer-events-auto"
                      style={style}
                    >
                      <EventPopover
                        event={event}
                        onEdit={onEditEvent}
                        onDelete={onDeleteEvent}
                      >
                        <button
                          className={cn(
                            "w-full h-full rounded px-1.5 py-0.5 text-left overflow-hidden border-l-[3px] text-[11px] leading-tight",
                            TYPE_BLOCK_COLORS[
                              event.event_type as EventType
                            ] || TYPE_BLOCK_COLORS.general
                          )}
                        >
                          <span className="font-medium block truncate">
                            {event.title}
                          </span>
                          <span className="opacity-60 text-[10px]">
                            {formatTimeShort(event.start_time!)}
                            {event.end_time &&
                              ` – ${formatTimeShort(event.end_time)}`}
                          </span>
                        </button>
                      </EventPopover>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main CalendarView ────────────────────────────────────

interface CalendarViewProps {
  events: SchoolEvent[];
  onCreateEvent?: () => void;
  onCreateEventOnDate?: (date: string, startTime?: string) => void;
  onEditEvent?: (event: SchoolEvent) => void;
  onDeleteEvent?: (event: SchoolEvent) => void;
  eventCalendars?: EventCalendar[];
  // Set by admin callers to enable inline CRUD of divisions /
  // categories from the filter strip. Requires schoolId.
  manageCalendars?: boolean;
  schoolId?: string;
}

export function CalendarView({
  events,
  onCreateEvent,
  onCreateEventOnDate,
  onEditEvent,
  onDeleteEvent,
  eventCalendars,
  manageCalendars,
  schoolId,
}: CalendarViewProps) {
  const [view, setView] = useState<ViewMode>("month");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<Set<string>>(
    new Set()
  );

  function toggleCalendar(id: string) {
    setHiddenCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // An event passes a dimension's filter if it has no tag
  // of that kind (universal / all-school) or at least one
  // of its tags of that kind is still visible.
  const filteredEvents = useMemo(() => {
    if (hiddenCalendarIds.size === 0) return events;
    return events.filter((event) => {
      const cals = event.calendars ?? [];
      const divs = cals.filter((c) => c.kind === "division");
      const cats = cals.filter((c) => c.kind === "category");
      const divOk =
        divs.length === 0 || divs.some((c) => !hiddenCalendarIds.has(c.id));
      const catOk =
        cats.length === 0 || cats.some((c) => !hiddenCalendarIds.has(c.id));
      return divOk && catOk;
    });
  }, [events, hiddenCalendarIds]);

  const eventsByDate = useMemo(
    () => groupEventsByDate(filteredEvents),
    [filteredEvents]
  );

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const selectedEvents = eventsByDate.get(selectedDateStr) || [];

  function goToToday() {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDate(today);
  }

  function navigatePrev() {
    if (view === "month") setCurrentMonth((m) => subMonths(m, 1));
    else if (view === "week") {
      setSelectedDate((d) => {
        const prev = subWeeks(d, 1);
        setCurrentMonth(prev);
        return prev;
      });
    } else {
      setSelectedDate((d) => subDays(d, 1));
    }
  }

  function navigateNext() {
    if (view === "month") setCurrentMonth((m) => addMonths(m, 1));
    else if (view === "week") {
      setSelectedDate((d) => {
        const next = addWeeks(d, 1);
        setCurrentMonth(next);
        return next;
      });
    } else {
      setSelectedDate((d) => addDays(d, 1));
    }
  }

  function getHeaderLabel() {
    if (view === "month") return format(currentMonth, "MMMM yyyy");
    if (view === "week") {
      const ws = startOfWeek(selectedDate);
      const we = endOfWeek(selectedDate);
      if (ws.getMonth() === we.getMonth()) {
        return `${format(ws, "MMM d")} – ${format(we, "d, yyyy")}`;
      }
      return `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
    }
    return format(selectedDate, "EEEE, MMMM d, yyyy");
  }

  // Week view columns
  const weekColumns = useMemo(() => {
    const ws = startOfWeek(selectedDate);
    return eachDayOfInterval({ start: ws, end: endOfWeek(selectedDate) });
  }, [selectedDate]);

  // Day view column
  const dayColumns = useMemo(() => [selectedDate], [selectedDate]);

  return (
    <div className="space-y-4 sm:space-y-5 sm:pt-2">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="pl-1 text-xl font-bold text-foreground sm:text-2xl">
          {getHeaderLabel()}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {onCreateEvent && (
            <Button
              size="sm"
              onClick={onCreateEvent}
              className="order-last w-full sm:order-none sm:w-auto"
            >
              <Plus className="mr-1 h-4 w-4" />
              Create event
            </Button>
          )}

          {/* View toggle */}
          <div
            role="group"
            aria-label="Calendar view"
            className="flex rounded-lg border bg-muted/30 p-0.5"
          >
            {(["month", "week", "day"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  "min-h-8 px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize",
                  view === v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-0.5 sm:ml-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={goToToday}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Previous"
              onClick={navigatePrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Next"
              onClick={navigateNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar filters — divisions + categories */}
      {((eventCalendars && eventCalendars.length > 0) ||
        (manageCalendars && schoolId)) && (
        <div className="space-y-2.5 rounded-lg border bg-card/60 p-3 metallic-card sm:space-y-2">
          {(["division", "category"] as const).map((kind) => {
            const items = (eventCalendars ?? [])
              .filter((c) => c.kind === kind)
              .sort(
                (a, b) =>
                  a.sort_order - b.sort_order || a.name.localeCompare(b.name)
              );
            const isFirst = kind === "division";
            const showManageHere =
              isFirst && manageCalendars && schoolId;
            if (items.length === 0 && !showManageHere) return null;
            return (
              // One swipeable row per kind on phones; wraps from sm up.
              <div
                key={kind}
                className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
              >
                <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:mr-0 sm:w-[68px]">
                  {KIND_LABELS[kind].plural}
                </span>
                {items.map((cal) => {
                  const on = !hiddenCalendarIds.has(cal.id);
                  const colors = calendarColorClasses(cal.color);
                  return (
                    <button
                      key={cal.id}
                      type="button"
                      onClick={() => toggleCalendar(cal.id)}
                      aria-pressed={on}
                      className={cn(
                        "flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-all sm:min-h-0 sm:px-2.5",
                        on
                          ? cn(colors.chip, "border-transparent")
                          : "border-border text-muted-foreground/50"
                      )}
                    >
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          on ? colors.dot : "bg-muted-foreground/30"
                        )}
                      />
                      {cal.name}
                    </button>
                  );
                })}
                {showManageHere && (
                  <div className="ml-auto shrink-0">
                    <ManageCalendarsPopover
                      calendars={eventCalendars ?? []}
                      schoolId={schoolId!}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Week view: day headers above time grid */}
      {view === "week" && (
        <div className={cn("rounded-lg border bg-card metallic-card overflow-hidden", GUTTER_VAR)}>
          <div
            className="grid bg-muted/30"
            style={{
              gridTemplateColumns: `var(--gutter) repeat(7, minmax(0, 1fr))`,
            }}
          >
            <div />
            {weekColumns.map((day) => {
              const today = isToday(day);
              const selected = isSameDay(day, selectedDate);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => {
                    setSelectedDate(day);
                    setView("day");
                  }}
                  className={cn(
                    "py-2 text-center transition-colors hover:bg-accent/30 border-l",
                    today && "bg-primary/5"
                  )}
                >
                  <div className="text-[10px] font-medium text-muted-foreground uppercase">
                    {format(day, "EEE")}
                  </div>
                  <div
                    className={cn(
                      "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                      selected && "bg-primary text-primary-foreground",
                      today &&
                        !selected &&
                        "bg-primary/20 text-primary font-bold"
                    )}
                  >
                    {format(day, "d")}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Views */}
      {view === "month" && (
        <MonthView
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          eventsByDate={eventsByDate}
          onSelectDate={setSelectedDate}
          onCreateEventOnDate={
            onCreateEventOnDate
              ? (date) => onCreateEventOnDate(date)
              : undefined
          }
          onEditEvent={onEditEvent}
          onDeleteEvent={onDeleteEvent}
        />
      )}

      {view === "week" && (
        <TimeGrid
          columns={weekColumns}
          eventsByDate={eventsByDate}
          onTimeSlotClick={onCreateEventOnDate}
          onEditEvent={onEditEvent}
          onDeleteEvent={onDeleteEvent}
        />
      )}

      {view === "day" && (
        <TimeGrid
          columns={dayColumns}
          eventsByDate={eventsByDate}
          onTimeSlotClick={onCreateEventOnDate}
          onEditEvent={onEditEvent}
          onDeleteEvent={onDeleteEvent}
        />
      )}

      {/* Selected day event list */}
      {(
        <div>
          <h3
            aria-live="polite"
            className="mb-3 text-sm font-medium text-muted-foreground"
          >
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
            {selectedEvents.length > 0 && (
              <span className="ml-2 text-foreground">
                — {selectedEvents.length} event
                {selectedEvents.length !== 1 ? "s" : ""}
              </span>
            )}
          </h3>
          {selectedEvents.length === 0 ? (
            <div className="text-sm text-muted-foreground/60 py-6 text-center border rounded-lg bg-card/50">
              No events on this day
              {onCreateEventOnDate && (
                <button
                  onClick={() => onCreateEventOnDate(selectedDateStr)}
                  className="block mx-auto mt-2 text-xs text-primary hover:underline"
                >
                  + Create event
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start justify-between rounded-lg border bg-card p-3.5 metallic-card sm:p-3"
                >
                  <div className="space-y-1.5 min-w-0 flex-1 sm:space-y-1">
                    <div className="flex items-start gap-2 sm:items-center">
                      <p className="font-medium text-sm sm:truncate">
                        {event.title}
                      </p>
                      <Badge
                        className={cn(
                          "shrink-0 text-[10px]",
                          TYPE_BADGE_COLORS[
                            event.event_type as EventType
                          ] || TYPE_BADGE_COLORS.general
                        )}
                      >
                        {event.event_type}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {event.start_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimeFull(event.start_time)}
                          {event.end_time &&
                            ` – ${formatTimeFull(event.end_time)}`}
                        </span>
                      )}
                      {event.location && (
                        <span className="flex min-w-0 items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {event.location}
                        </span>
                      )}
                    </div>
                    {event.description && (
                      <p className="text-xs text-muted-foreground/70 line-clamp-2 sm:line-clamp-1">
                        {event.description}
                      </p>
                    )}
                    <CalendarChips event={event} />
                  </div>
                  {(onEditEvent || onDeleteEvent) && (
                    <div className="-my-1 -mr-1 ml-2 flex shrink-0 items-center gap-0.5 sm:m-0 sm:ml-2 sm:gap-1">
                      {onEditEvent && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 sm:h-7 sm:w-7"
                          aria-label="Edit event"
                          onClick={() => onEditEvent(event)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      {onDeleteEvent && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:text-destructive sm:h-7 sm:w-7"
                          aria-label="Delete event"
                          onClick={() => onDeleteEvent(event)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
