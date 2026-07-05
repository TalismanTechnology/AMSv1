"use client";

import { useState } from "react";
import { FileText, Sparkles, Trash2 } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarChipSelect } from "@/components/admin/calendar-chip-select";
import {
  extractEventsFromDocument,
  createEventsBulk,
  type BulkEventInput,
} from "@/actions/event-import";
import type { ExtractedEvent } from "@/lib/ai/event-extraction";
import { splitCalendars, KIND_LABELS } from "@/lib/event-calendars";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { EventCalendar, EventType } from "@/lib/types";

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "general", label: "General" },
  { value: "academic", label: "Academic" },
  { value: "sports", label: "Sports" },
  { value: "arts", label: "Arts" },
  { value: "meeting", label: "Meeting" },
  { value: "holiday", label: "Holiday" },
  { value: "other", label: "Other" },
];

export interface ImportableDocument {
  id: string;
  title: string;
  file_type: string;
}

interface ReviewRow {
  key: string;
  include: boolean;
  title: string;
  date: string;
  endDate: string | null;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  eventType: EventType;
  description: string;
  calendarIds: string[];
}

interface EventImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: ImportableDocument[];
  eventCalendars: EventCalendar[];
  schoolId: string;
}

export function EventImportDialog({
  open,
  onOpenChange,
  documents,
  eventCalendars,
  schoolId,
}: EventImportDialogProps) {
  const [selectedDocId, setSelectedDocId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  const { divisions, categories } = splitCalendars(eventCalendars);

  function reset() {
    setSelectedDocId("");
    setExtracting(false);
    setRows(null);
    setSaving(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleExtract() {
    if (!selectedDocId) return;
    setExtracting(true);
    const result = await extractEventsFromDocument(schoolId, selectedDocId);
    setExtracting(false);
    if (result.error || !result.events) {
      toast.error(result.error || "Extraction failed");
      return;
    }
    setRows(result.events.map((ev, i) => toRow(ev, i, eventCalendars)));
  }

  function updateRow(key: string, patch: Partial<ReviewRow>) {
    setRows((prev) =>
      prev
        ? prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
        : prev
    );
  }

  function removeRow(key: string) {
    setRows((prev) => (prev ? prev.filter((r) => r.key !== key) : prev));
  }

  const includedCount = rows?.filter((r) => r.include).length ?? 0;

  async function handleSave() {
    if (!rows) return;
    const payload: BulkEventInput[] = rows
      .filter((r) => r.include && r.title.trim() && r.date)
      .map((r) => ({
        title: r.title.trim(),
        date: r.date,
        endDate: r.endDate,
        allDay: r.allDay,
        startTime: r.allDay ? null : r.startTime || null,
        endTime: r.allDay ? null : r.endTime || null,
        location: r.location || null,
        eventType: r.eventType,
        description: r.description || null,
        calendarIds: r.calendarIds,
      }));

    if (payload.length === 0) {
      toast.error("Select at least one event with a title and date.");
      return;
    }

    setSaving(true);
    const result = await createEventsBulk(schoolId, payload);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Added ${result.count} event${result.count === 1 ? "" : "s"} to your calendar`
    );
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-card sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-[-0.01em] text-ink">
            Import events from a document
          </DialogTitle>
          <DialogDescription>
            {rows
              ? "Review the extracted events, edit anything that looks off, then add them to your calendar."
              : "Pick a processed document and we'll pull out the calendar events for you to review."}
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-ink-soft">Document</Label>
              {documents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No processed documents yet. Upload a calendar in the Documents
                  section first.
                </p>
              ) : (
                <Select value={selectedDocId} onValueChange={setSelectedDocId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a document…" />
                  </SelectTrigger>
                  <SelectContent>
                    {documents.map((doc) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        <span className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          {doc.title}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={extracting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleExtract}
                disabled={!selectedDocId || extracting}
                className="bg-primary text-primary-foreground"
              >
                {extracting ? (
                  <LogoSpinner className="mr-2" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {extracting ? "Reading document…" : "Extract events"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="text-ink font-medium">{includedCount}</span> of{" "}
              {rows.length} event{rows.length === 1 ? "" : "s"} selected.
            </p>

            <ScrollArea className="h-[52vh] pr-3">
              <div className="space-y-3">
                {rows.map((row) => (
                  <ReviewRowCard
                    key={row.key}
                    row={row}
                    divisions={divisions}
                    categories={categories}
                    onChange={(patch) => updateRow(row.key, patch)}
                    onRemove={() => removeRow(row.key)}
                  />
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={() => setRows(null)}
                disabled={saving}
              >
                Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || includedCount === 0}
                className="bg-primary text-primary-foreground"
              >
                {saving && <LogoSpinner className="mr-2" />}
                Add {includedCount} event{includedCount === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Single editable review row ───────────────────────

function ReviewRowCard({
  row,
  divisions,
  categories,
  onChange,
  onRemove,
}: {
  row: ReviewRow;
  divisions: EventCalendar[];
  categories: EventCalendar[];
  onChange: (patch: Partial<ReviewRow>) => void;
  onRemove: () => void;
}) {
  function toggleCalendar(id: string) {
    onChange({
      calendarIds: row.calendarIds.includes(id)
        ? row.calendarIds.filter((x) => x !== id)
        : [...row.calendarIds, id],
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        row.include ? "border-border bg-background" : "border-border/60 bg-muted/30"
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={row.include}
          onCheckedChange={(v) => onChange({ include: v === true })}
          className="mt-2.5"
          aria-label="Include this event"
        />
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              value={row.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Event title"
              className="font-medium"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Remove event"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-ink-soft">Start date</Label>
              <DatePicker
                value={row.date}
                onChange={(v) => onChange({ date: v })}
                allowClear={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-ink-soft">End date</Label>
              <DatePicker
                value={row.endDate ?? ""}
                onChange={(v) => onChange({ endDate: v || null })}
                placeholder="Same day"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-ink-soft">Type</Label>
              <Select
                value={row.eventType}
                onValueChange={(v) => onChange({ eventType: v as EventType })}
              >
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
            <div className="flex items-end gap-2 pb-2">
              <Switch
                checked={row.allDay}
                onCheckedChange={(v) => onChange({ allDay: v })}
                id={`allday-${row.key}`}
              />
              <Label
                htmlFor={`allday-${row.key}`}
                className="text-xs text-ink-soft"
              >
                All day
              </Label>
            </div>
          </div>

          {!row.allDay && (
            <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
              <div className="space-y-1.5">
                <Label className="text-xs text-ink-soft">Start time</Label>
                <Input
                  type="time"
                  value={row.startTime}
                  onChange={(e) => onChange({ startTime: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-ink-soft">End time</Label>
                <Input
                  type="time"
                  value={row.endTime}
                  onChange={(e) => onChange({ endTime: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {divisions.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-ink-soft">
                  {KIND_LABELS.division.plural}
                </Label>
                <CalendarChipSelect
                  items={divisions}
                  kind="division"
                  selected={row.calendarIds}
                  onToggle={toggleCalendar}
                />
              </div>
            )}
            {categories.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-ink-soft">
                  {KIND_LABELS.category.plural}
                </Label>
                <CalendarChipSelect
                  items={categories}
                  kind="category"
                  selected={row.calendarIds}
                  onToggle={toggleCalendar}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────

function toRow(
  ev: ExtractedEvent,
  index: number,
  calendars: EventCalendar[]
): ReviewRow {
  const matchName = (name: string | null, kind: EventCalendar["kind"]) =>
    name
      ? calendars.find(
          (c) =>
            c.kind === kind &&
            c.name.toLowerCase() === name.toLowerCase()
        )?.id
      : undefined;

  const calendarIds = [
    matchName(ev.suggestedDivision, "division"),
    matchName(ev.suggestedCategory, "category"),
  ].filter((id): id is string => Boolean(id));

  return {
    key: `${index}-${ev.title}`,
    include: true,
    title: ev.title,
    date: ev.date,
    endDate: ev.endDate,
    allDay: ev.allDay,
    startTime: ev.startTime ?? "",
    endTime: ev.endTime ?? "",
    location: ev.location ?? "",
    eventType: ev.eventType,
    description: ev.description ?? "",
    calendarIds,
  };
}
