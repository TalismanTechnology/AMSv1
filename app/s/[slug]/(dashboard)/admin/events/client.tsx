"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Sparkles } from "lucide-react";
import { CalendarView } from "@/components/shared/calendar-view";
import { EventFormDialog } from "@/components/admin/event-form-dialog";
import {
  EventImportDialog,
  type ImportableDocument,
} from "@/components/admin/event-import-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteEvent } from "@/actions/events";
import { toast } from "sonner";
import type { SchoolEvent, EventCalendar } from "@/lib/types";

interface EventsClientProps {
  events: SchoolEvent[];
  eventCalendars: EventCalendar[];
  documents: ImportableDocument[];
  schoolId: string;
  schoolSlug: string;
}

export function EventsClient({
  events,
  eventCalendars,
  documents,
  schoolId,
}: EventsClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();
  const [defaultTime, setDefaultTime] = useState<string | undefined>();
  const [editingEvent, setEditingEvent] = useState<SchoolEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SchoolEvent | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteEvent(deleteTarget.id, schoolId);
    if (result.error) toast.error(result.error);
    else toast.success("Event deleted");
    setDeleting(false);
    setDeleteTarget(null);
  }

  const eventCount = events.length;

  return (
    <div className="relative">
      <header className="relative mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-[-0.01em]">
            Events
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="text-ink">{eventCount}</span>{" "}
            event{eventCount !== 1 ? "s" : ""} scheduled across your calendars.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setImportOpen(true)}
          className="shrink-0"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Import from document
        </Button>
      </header>

      <CalendarView
        events={events}
        eventCalendars={eventCalendars}
        manageCalendars
        schoolId={schoolId}
        onCreateEvent={() => {
          setDefaultDate(format(new Date(), "yyyy-MM-dd"));
          setDefaultTime(undefined);
          setCreateOpen(true);
        }}
        onCreateEventOnDate={(date, startTime) => {
          setDefaultDate(date);
          setDefaultTime(startTime);
          setCreateOpen(true);
        }}
        onEditEvent={(event) => setEditingEvent(event)}
        onDeleteEvent={(event) => setDeleteTarget(event)}
      />

      <EventFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDate={defaultDate}
        defaultTime={defaultTime}
        schoolId={schoolId}
        eventCalendars={eventCalendars}
      />

      <EventImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        documents={documents}
        eventCalendars={eventCalendars}
        schoolId={schoolId}
      />

      {editingEvent && (
        <EventFormDialog
          event={editingEvent}
          open={!!editingEvent}
          onOpenChange={(open) => {
            if (!open) setEditingEvent(null);
          }}
          schoolId={schoolId}
          eventCalendars={eventCalendars}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete event"
        description="Are you sure you want to delete this event? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
