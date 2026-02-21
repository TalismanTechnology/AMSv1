"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarView } from "@/components/shared/calendar-view";
import { EventFormDialog } from "@/components/admin/event-form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteEvent } from "@/actions/events";
import { toast } from "sonner";
import type { SchoolEvent } from "@/lib/types";

interface EventsClientProps {
  events: SchoolEvent[];
  schoolId: string;
  schoolSlug: string;
}

export function EventsClient({ events, schoolId, schoolSlug }: EventsClientProps) {
  const [createOpen, setCreateOpen] = useState(false);
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

  return (
    <div>
      <CalendarView
        events={events}
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
      />

      {editingEvent && (
        <EventFormDialog
          event={editingEvent}
          open={!!editingEvent}
          onOpenChange={(open) => {
            if (!open) setEditingEvent(null);
          }}
          schoolId={schoolId}
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
