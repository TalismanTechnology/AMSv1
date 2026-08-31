"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Sparkles, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarChipSelect } from "@/components/admin/calendar-chip-select";
import { calendarColorClasses, splitCalendars } from "@/lib/event-calendars";
import {
  approveStagedEvents,
  rejectStagedEventsAction,
  updateStagedEventTags,
} from "@/actions/blackbaud-calendar";
import type { EventCalendar, StagedBlackbaudEvent } from "@/lib/types";

// Anything the model tagged below this is surfaced for a closer look rather
// than blending in with the confident rows.
const LOW_CONFIDENCE = 0.5;

type Filter = "all" | "needs_attention" | "removed";

interface Props {
  events: StagedBlackbaudEvent[];
  eventCalendars: EventCalendar[];
  schoolId: string;
  schoolSlug: string;
  truncated: boolean;
}

export function BlackbaudReviewClient({
  events,
  eventCalendars,
  schoolId,
  schoolSlug,
  truncated,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  // Local tag edits, so a correction shows immediately without a round trip.
  const [tagOverrides, setTagOverrides] = useState<Record<string, string[]>>({});

  const { divisions, categories } = splitCalendars(eventCalendars);

  function tagsFor(event: StagedBlackbaudEvent): string[] {
    return (
      tagOverrides[event.id] ??
      (event.suggestedCalendars ?? []).map((calendar) => calendar.id)
    );
  }

  function needsAttention(event: StagedBlackbaudEvent): boolean {
    if (event.tag_source === "none") return true;
    if (tagsFor(event).length === 0) return true;
    return (
      event.tag_source === "ai" &&
      event.tag_confidence !== null &&
      event.tag_confidence < LOW_CONFIDENCE
    );
  }

  const visible = useMemo(() => {
    if (filter === "removed") {
      return events.filter((event) => event.status === "superseded");
    }
    const pending = events.filter((event) => event.status === "pending");
    if (filter === "needs_attention") return pending.filter(needsAttention);
    return pending;
    // tagOverrides feeds needsAttention, so the list re-filters as tags change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, filter, tagOverrides]);

  const byDate = useMemo(() => {
    const groups = new Map<string, StagedBlackbaudEvent[]>();
    for (const event of visible) {
      groups.set(event.local_date, [
        ...(groups.get(event.local_date) ?? []),
        event,
      ]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  const attentionCount = events.filter(
    (event) => event.status === "pending" && needsAttention(event)
  ).length;
  const removedCount = events.filter(
    (event) => event.status === "superseded"
  ).length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === visible.length
        ? new Set()
        : new Set(visible.map((event) => event.id))
    );
  }

  async function handleTagChange(event: StagedBlackbaudEvent, calendarId: string) {
    const current = tagsFor(event);
    const next = current.includes(calendarId)
      ? current.filter((id) => id !== calendarId)
      : [...current, calendarId];

    setTagOverrides((overrides) => ({ ...overrides, [event.id]: next }));

    const result = await updateStagedEventTags(schoolId, event.id, next);
    if (result.error) {
      setTagOverrides((overrides) => ({ ...overrides, [event.id]: current }));
      toast.error(result.error);
    }
  }

  async function handleApprove() {
    if (selected.size === 0) return;
    setBusy(true);

    const result = await approveStagedEvents(schoolId, [...selected]);
    setBusy(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(
      `Published ${result.eventsCreated ?? 0} event${
        result.eventsCreated === 1 ? "" : "s"
      } to the calendar.`
    );
    setSelected(new Set());
    router.refresh();
  }

  async function handleReject() {
    if (selected.size === 0) return;
    setBusy(true);

    const result = await rejectStagedEventsAction(schoolId, [...selected]);
    setBusy(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`Dismissed ${result.count ?? 0} event${result.count === 1 ? "" : "s"}.`);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href={`/s/${schoolSlug}/admin/events`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to events
        </Link>

        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">
            Blackbaud sync review
          </h1>
          <p className="text-sm text-muted-foreground">
            Events pulled from your Blackbaud calendar feeds and tagged
            automatically. Approve them to publish to the parent calendar.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <FilterTab
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All pending"
          count={events.filter((e) => e.status === "pending").length}
        />
        <FilterTab
          active={filter === "needs_attention"}
          onClick={() => setFilter("needs_attention")}
          label="Needs a look"
          count={attentionCount}
        />
        {removedCount > 0 && (
          <FilterTab
            active={filter === "removed"}
            onClick={() => setFilter("removed")}
            label="Removed upstream"
            count={removedCount}
          />
        )}
      </div>

      {filter === "removed" && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-ink-soft">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          These occurrences disappeared from the Blackbaud feed — usually a
          cancellation. Any that you already published are still on the parent
          calendar; dismissing one here removes it.
        </p>
      )}

      {truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the first 300 events. Approve or dismiss some to see the rest.
        </p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Nothing waiting here.
        </p>
      ) : (
        <>
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 px-4 py-3 backdrop-blur">
            <label className="flex items-center gap-2 text-sm text-ink">
              <Checkbox
                checked={selected.size > 0 && selected.size === visible.length}
                onCheckedChange={toggleAll}
                aria-label="Select all"
              />
              {selected.size > 0
                ? `${selected.size} selected`
                : `Select all ${visible.length}`}
            </label>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReject}
                disabled={selected.size === 0 || busy}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Dismiss
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={selected.size === 0 || busy}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {busy ? "Publishing…" : "Publish to calendar"}
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            {byDate.map(([date, group]) => (
              <section key={date} className="space-y-2">
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {formatDateHeading(date)}
                </h2>
                <ul className="space-y-2">
                  {group.map((event) => (
                    <StagedEventRow
                      key={event.id}
                      event={event}
                      tags={tagsFor(event)}
                      flagged={needsAttention(event)}
                      isSelected={selected.has(event.id)}
                      onToggleSelect={() => toggle(event.id)}
                      onToggleTag={(calendarId) =>
                        handleTagChange(event, calendarId)
                      }
                      divisions={divisions}
                      categories={categories}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-transparent bg-ink text-background"
          : "border-border text-muted-foreground hover:bg-accent"
      }`}
    >
      {label}
      <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function StagedEventRow({
  event,
  tags,
  flagged,
  isSelected,
  onToggleSelect,
  onToggleTag,
  divisions,
  categories,
}: {
  event: StagedBlackbaudEvent;
  tags: string[];
  flagged: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onToggleTag: (calendarId: string) => void;
  divisions: EventCalendar[];
  categories: EventCalendar[];
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedCalendars = [...divisions, ...categories].filter((calendar) =>
    tags.includes(calendar.id)
  );

  return (
    <li
      className={`rounded-lg border bg-card p-4 transition-colors ${
        isSelected ? "border-ink/40" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onToggleSelect}
          aria-label={`Select ${event.title}`}
          className="mt-0.5"
        />

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-ink">{event.title}</p>
            {flagged && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Check tags
              </span>
            )}
            {event.tag_source === "ai" && !flagged && (
              <span
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                title="Tagged by AI"
              >
                <Sparkles className="h-3 w-3" />
                AI
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {event.all_day
              ? "All day"
              : formatTimeRange(event.local_start_time, event.local_end_time)}
            {event.local_end_date && ` · through ${event.local_end_date}`}
            {event.location && ` · ${event.location}`}
            {" · "}
            {event.feedLabel}
          </p>

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {selectedCalendars.map((calendar) => {
              const colors = calendarColorClasses(calendar.color);
              return (
                <span
                  key={calendar.id}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${colors.chip}`}
                >
                  {calendar.name}
                </span>
              );
            })}
            {selectedCalendars.length === 0 && (
              <span className="text-[11px] text-muted-foreground">
                No tags — will show to everyone
              </span>
            )}
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-ink"
            >
              {expanded ? "Done" : "Edit tags"}
            </button>
          </div>

          {expanded && (
            <div className="space-y-2 border-t border-border pt-3">
              {divisions.length > 0 && (
                <CalendarChipSelect
                  items={divisions}
                  kind="division"
                  selected={tags}
                  onToggle={onToggleTag}
                />
              )}
              {categories.length > 0 && (
                <CalendarChipSelect
                  items={categories}
                  kind="category"
                  selected={tags}
                  onToggle={onToggleTag}
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                Corrections are remembered — the next sync tags matching events
                the same way.
              </p>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function formatDateHeading(date: string): string {
  // Parsed at UTC noon so the label can't slip a day in a western timezone.
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return "Time not set";
  const format = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    const period = hour >= 12 ? "pm" : "am";
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return minute === 0
      ? `${display}${period}`
      : `${display}:${String(minute).padStart(2, "0")}${period}`;
  };
  return end ? `${format(start)} – ${format(end)}` : format(start);
}
