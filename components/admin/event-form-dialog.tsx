"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createEvent, updateEvent } from "@/actions/events";
import { CalendarFormDialog } from "@/components/admin/calendar-form-dialog";
import {
  splitCalendars,
  calendarColorClasses,
  KIND_LABELS,
} from "@/lib/event-calendars";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  SchoolEvent,
  EventType,
  EventCalendar,
  EventCalendarKind,
} from "@/lib/types";

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "academic", label: "Academic" },
  { value: "sports", label: "Sports" },
  { value: "arts", label: "Arts" },
  { value: "meeting", label: "Meeting" },
  { value: "holiday", label: "Holiday" },
  { value: "other", label: "Other" },
];

interface EventFormDialogProps {
  event?: SchoolEvent | null;
  defaultDate?: string;
  defaultTime?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  eventCalendars: EventCalendar[];
}

export function EventFormDialog({
  event,
  defaultDate,
  defaultTime,
  open,
  onOpenChange,
  schoolId,
  eventCalendars,
}: EventFormDialogProps) {
  const isEditing = !!event;
  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [date, setDate] = useState(event?.date || defaultDate || "");
  const [startTime, setStartTime] = useState(event?.start_time || defaultTime || "");
  const [endTime, setEndTime] = useState(event?.end_time || "");
  const [location, setLocation] = useState(event?.location || "");
  const [eventType, setEventType] = useState<string>(
    event?.event_type || "general"
  );
  const [recurrence, setRecurrence] = useState(
    (event as SchoolEvent & { recurrence?: string })?.recurrence || "none"
  );
  const [recurrenceEnd, setRecurrenceEnd] = useState(
    (event as SchoolEvent & { recurrence_end?: string })?.recurrence_end || ""
  );
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(
    event?.calendars?.map((c) => c.id) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [createCalendarKind, setCreateCalendarKind] =
    useState<EventCalendarKind | null>(null);

  const { divisions, categories } = splitCalendars(eventCalendars);

  function toggleCalendar(id: string) {
    setSelectedCalendarIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // Reset form when dialog opens so it picks up new defaultDate/defaultTime
  useEffect(() => {
    if (open && !isEditing) {
      const today = new Date().toISOString().split("T")[0];
      setTitle("");
      setDescription("");
      setDate(defaultDate || today);
      setStartTime(defaultTime || "");
      setEndTime("");
      setLocation("");
      setEventType("general");
      setRecurrence("none");
      setRecurrenceEnd("");
      setSelectedCalendarIds([]);
    }
    if (open && isEditing && event) {
      setTitle(event.title || "");
      setDescription(event.description || "");
      setDate(event.date || "");
      setStartTime(event.start_time || "");
      setEndTime(event.end_time || "");
      setLocation(event.location || "");
      setEventType(event.event_type || "general");
      setSelectedCalendarIds(event.calendars?.map((c) => c.id) ?? []);
    }
  }, [open]);

  async function handleSubmit() {
    if (!title.trim() || !date) return;
    setSaving(true);

    if (isEditing) {
      const result = await updateEvent(event.id, schoolId, {
        title: title.trim(),
        description: description || null,
        date,
        start_time: startTime || null,
        end_time: endTime || null,
        location: location || null,
        event_type: eventType,
        calendar_ids: selectedCalendarIds,
      });
      if (result.error) toast.error(result.error);
      else {
        toast.success("Event updated");
        onOpenChange(false);
      }
    } else {
      const formData = new FormData();
      formData.set("title", title.trim());
      formData.set("description", description);
      formData.set("date", date);
      formData.set("start_time", startTime);
      formData.set("end_time", endTime);
      formData.set("location", location);
      formData.set("event_type", eventType);
      formData.set("recurrence", recurrence);
      formData.set("recurrence_end", recurrenceEnd);
      formData.set("calendar_ids", JSON.stringify(selectedCalendarIds));
      const result = await createEvent(schoolId, formData);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Event created");
        setTitle("");
        setDescription("");
        setDate("");
        setStartTime("");
        setEndTime("");
        setLocation("");
        setEventType("general");
        setSelectedCalendarIds([]);
        onOpenChange(false);
      }
    }
    setSaving(false);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit event" : "Create event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Parent-Teacher Conference"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-description">Description (optional)</Label>
            <Textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event-date">Date</Label>
              <DatePicker
                id="event-date"
                value={date}
                onChange={setDate}
                allowClear={false}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event-start">Start time (optional)</Label>
              <Input
                id="event-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-end">End time (optional)</Label>
              <Input
                id="event-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-location">Location (optional)</Label>
            <Input
              id="event-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Main Auditorium"
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{KIND_LABELS.division.plural}</Label>
              <CalendarChipSelect
                items={divisions}
                kind="division"
                selected={selectedCalendarIds}
                onToggle={toggleCalendar}
                onCreateNew={() => setCreateCalendarKind("division")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{KIND_LABELS.category.plural}</Label>
              <CalendarChipSelect
                items={categories}
                kind="category"
                selected={selectedCalendarIds}
                onToggle={toggleCalendar}
                onCreateNew={() => setCreateCalendarKind("category")}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Recurrence</Label>
              <Select value={recurrence} onValueChange={setRecurrence}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {recurrence !== "none" && (
              <div className="space-y-2">
                <Label htmlFor="event-recurrence-end">Repeat until</Label>
                <DatePicker
                  id="event-recurrence-end"
                  value={recurrenceEnd}
                  onChange={setRecurrenceEnd}
                  placeholder="No end date"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!title.trim() || !date || saving}
            >
              {saving && <LogoSpinner className="mr-2" />}
              {isEditing ? "Save changes" : "Create event"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {createCalendarKind && (
      <CalendarFormDialog
        kind={createCalendarKind}
        open={!!createCalendarKind}
        onOpenChange={(o) => {
          if (!o) setCreateCalendarKind(null);
        }}
        schoolId={schoolId}
        onCreated={(cal) =>
          setSelectedCalendarIds((prev) =>
            prev.includes(cal.id) ? prev : [...prev, cal.id]
          )
        }
      />
    )}
    </>
  );
}

// Toggleable color-coded chips for picking divisions /
// categories on an event, plus a trailing "+ New" button
// that lets admins create a tag without leaving the form.
function CalendarChipSelect({
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
