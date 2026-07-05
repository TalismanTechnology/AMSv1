"use client";

import { useState } from "react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createEventCalendar,
  updateEventCalendar,
} from "@/actions/event-calendars";
import {
  CALENDAR_COLOR_PALETTE,
  calendarColorClasses,
  KIND_LABELS,
} from "@/lib/event-calendars";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { EventCalendar, EventCalendarKind } from "@/lib/types";

interface CalendarFormDialogProps {
  calendar?: EventCalendar | null;
  kind: EventCalendarKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  onCreated?: (calendar: EventCalendar) => void;
}

export function CalendarFormDialog({
  calendar,
  kind,
  open,
  onOpenChange,
  schoolId,
  onCreated,
}: CalendarFormDialogProps) {
  // Both call sites mount this dialog fresh each time
  // (conditionally rendered), so useState initializers
  // pick up the right calendar without a reset effect.
  const isEditing = !!calendar;
  const [name, setName] = useState(calendar?.name || "");
  const [color, setColor] = useState<string>(
    calendar?.color || CALENDAR_COLOR_PALETTE[0]
  );
  const [saving, setSaving] = useState(false);

  const label = KIND_LABELS[kind].singular.toLowerCase();

  async function handleSubmit() {
    if (!name.trim()) return;
    setSaving(true);

    const result = isEditing
      ? await updateEventCalendar(calendar.id, schoolId, { name, color })
      : await createEventCalendar(schoolId, { kind, name, color });

    if ("error" in result) toast.error(result.error);
    else {
      toast.success(
        isEditing
          ? `${KIND_LABELS[kind].singular} updated`
          : `${KIND_LABELS[kind].singular} created`
      );
      if (!isEditing && "calendar" in result) onCreated?.(result.calendar);
      onOpenChange(false);
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-card">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-[-0.01em] text-ink">
            {isEditing ? `Edit ${label}` : `New ${label}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="calendar-name" className="text-ink-soft">
              Name
            </Label>
            <Input
              id="calendar-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                kind === "division" ? "e.g. Upper School" : "e.g. Athletics"
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-ink-soft">Color</Label>
            <div className="flex flex-wrap gap-2">
              {CALENDAR_COLOR_PALETTE.map((c) => {
                const classes = calendarColorClasses(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={c}
                    aria-pressed={color === c}
                    className={cn(
                      "h-7 w-7 rounded-full transition-transform",
                      classes.dot,
                      color === c
                        ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110"
                        : "hover:scale-105"
                    )}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name.trim() || saving}
              className="bg-primary text-primary-foreground"
            >
              {saving && <LogoSpinner className="mr-2" />}
              {isEditing ? "Save changes" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
