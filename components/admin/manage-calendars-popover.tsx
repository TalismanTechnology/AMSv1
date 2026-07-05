"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CalendarFormDialog } from "@/components/admin/calendar-form-dialog";
import { deleteEventCalendar } from "@/actions/event-calendars";
import {
  calendarColorClasses,
  splitCalendars,
  KIND_LABELS,
} from "@/lib/event-calendars";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { EventCalendar, EventCalendarKind } from "@/lib/types";

interface ManageCalendarsPopoverProps {
  calendars: EventCalendar[];
  schoolId: string;
}

export function ManageCalendarsPopover({
  calendars,
  schoolId,
}: ManageCalendarsPopoverProps) {
  const { divisions, categories } = splitCalendars(calendars);
  const [createKind, setCreateKind] = useState<EventCalendarKind | null>(null);
  const [editing, setEditing] = useState<EventCalendar | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventCalendar | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteEventCalendar(deleteTarget.id, schoolId);
    if (result.error) toast.error(result.error);
    else toast.success(`${KIND_LABELS[deleteTarget.kind].singular} deleted`);
    setDeleting(false);
    setDeleteTarget(null);
  }

  function renderSection(kind: EventCalendarKind, items: EventCalendar[]) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            {KIND_LABELS[kind].plural}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-xs"
            onClick={() => setCreateKind(kind)}
          >
            <Plus className="mr-0.5 h-3 w-3" />
            Add
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground/70">
            No {KIND_LABELS[kind].plural.toLowerCase()} yet
          </p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((cal) => {
              const colors = calendarColorClasses(cal.color);
              return (
                <li
                  key={cal.id}
                  className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50"
                >
                  <span
                    className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colors.dot)}
                  />
                  <span className="flex-1 truncate text-sm">{cal.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={() => setEditing(cal)}
                    aria-label={`Edit ${cal.name}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 hover:text-destructive"
                    onClick={() => setDeleteTarget(cal)}
                    aria-label={`Delete ${cal.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
            <Settings2 className="mr-1 h-3.5 w-3.5" />
            Manage tags
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 space-y-4 bg-popover"
        >
          <div className="space-y-1 border-b border-border pb-3">
            <h3 className="text-base font-semibold tracking-[-0.01em] text-ink">
              Manage calendars
            </h3>
            <p className="text-xs text-muted-foreground">
              Divisions and categories parents can filter by.
            </p>
          </div>
          {renderSection("division", divisions)}
          {renderSection("category", categories)}
        </PopoverContent>
      </Popover>

      {createKind && (
        <CalendarFormDialog
          kind={createKind}
          open={!!createKind}
          onOpenChange={(o) => {
            if (!o) setCreateKind(null);
          }}
          schoolId={schoolId}
        />
      )}

      {editing && (
        <CalendarFormDialog
          calendar={editing}
          kind={editing.kind}
          open={!!editing}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          schoolId={schoolId}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title={`Delete ${
          deleteTarget ? KIND_LABELS[deleteTarget.kind].singular.toLowerCase() : ""
        }`}
        description="Events keep their other tags — this only removes this calendar and untags it from any events. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
