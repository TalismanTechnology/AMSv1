"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, Pencil, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/ui/time-ago";
import { LabelFormDialog } from "@/components/admin/label-form-dialog";
import { syncLabelsNow } from "@/actions/calendar-labels";
import { calendarColorClasses } from "@/lib/event-calendars";
import { cn } from "@/lib/utils";
import type { CalendarLabel, SchoolEvent } from "@/lib/types";

/** What the panel shows about a label's iCal link. The URL itself stays server-side. */
export interface LabelLink {
  host: string;
  timezone: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface LabelWithLink extends CalendarLabel {
  link: LabelLink | null;
}

interface CalendarLabelsPanelProps {
  labels: LabelWithLink[];
  events: SchoolEvent[];
  schoolId: string;
}

type LinkState = "none" | "ok" | "paused" | "error" | "waiting";

function linkState(link: LabelLink | null): LinkState {
  if (!link) return "none";
  if (!link.isActive) return "paused";
  if (link.lastError) return "error";
  return link.lastSyncedAt ? "ok" : "waiting";
}

const STATE_DOT: Record<LinkState, string> = {
  none: "bg-muted-foreground/30",
  ok: "bg-emerald-500",
  paused: "bg-amber-500",
  error: "bg-red-500",
  waiting: "bg-muted-foreground/60",
};

/**
 * The school's labels, with each iCal link's sync health at a glance. Sits
 * above the calendar so linking a calendar is the obvious first thing to do.
 */
export function CalendarLabelsPanel({ labels, events, schoolId }: CalendarLabelsPanelProps) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LabelWithLink | null>(null);
  const [syncing, setSyncing] = useState(false);

  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      if (event.label_id) counts.set(event.label_id, (counts.get(event.label_id) ?? 0) + 1);
    }
    return counts;
  }, [events]);

  const linkedCount = labels.filter((l) => l.link?.isActive).length;
  const failing = labels.filter((l) => linkState(l.link) === "error").length;

  async function handleSync() {
    setSyncing(true);
    const result = await syncLabelsNow(schoolId);
    setSyncing(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    const failures = result.failures ?? [];
    if (failures.length > 0) {
      toast.warning(
        `${failures.length} link${failures.length === 1 ? "" : "s"} failed: ${failures
          .map((f) => f.label)
          .join(", ")}`
      );
      return;
    }
    toast.success(
      result.changed
        ? `${result.changed} event${result.changed === 1 ? "" : "s"} added, changed or removed.`
        : "Every calendar is up to date."
    );
  }

  return (
    <section
      aria-labelledby="labels-heading"
      className="mb-6 rounded-xl border border-border bg-card p-4 metallic-card sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="labels-heading" className="text-sm font-semibold text-ink">
            Labels
            {failing > 0 && (
              <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">
                {failing} link{failing === 1 ? "" : "s"} failing
              </span>
            )}
          </h2>
          <p className="max-w-xl text-xs text-muted-foreground">
            Each label colors its events on the calendar. Give a label an iCal
            link and that calendar&apos;s events sync in under it automatically.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {linkedCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          )}
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New label
          </Button>
        </div>
      </div>

      {labels.length === 0 ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-4 flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-secondary/50"
        >
          <Link2 className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-ink">Add your first label</span>
          <span className="text-xs text-muted-foreground">
            Paste a Blackbaud iCal link, like &ldquo;Upper School Athletics&rdquo;, and its events appear here.
          </span>
        </button>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {labels.map((label) => (
            <LabelCard
              key={label.id}
              label={label}
              eventCount={eventCounts.get(label.id) ?? 0}
              onEdit={() => setEditing(label)}
            />
          ))}
        </ul>
      )}

      <LabelFormDialog
        open={creating}
        onOpenChange={setCreating}
        schoolId={schoolId}
        usedColors={labels.map((l) => l.color)}
      />
      {editing && (
        <LabelFormDialog
          label={editing}
          open={!!editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          schoolId={schoolId}
          usedColors={labels.map((l) => l.color)}
        />
      )}
    </section>
  );
}

function LabelCard({
  label,
  eventCount,
  onEdit,
}: {
  label: LabelWithLink;
  eventCount: number;
  onEdit: () => void;
}) {
  const colors = calendarColorClasses(label.color);
  const state = linkState(label.link);

  return (
    <li className="group relative flex flex-col gap-1.5 overflow-hidden rounded-lg border border-border bg-background py-2.5 pl-4 pr-2">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", colors.dot)} />
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{label.name}</p>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {eventCount} event{eventCount === 1 ? "" : "s"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          onClick={onEdit}
          aria-label={`Edit ${label.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATE_DOT[state])} />
        <LinkStatus link={label.link} state={state} />
      </p>

      {state === "error" && label.link?.lastError && (
        <p className="flex items-start gap-1.5 rounded-md bg-red-500/5 px-2 py-1.5 text-xs text-red-700 dark:text-red-400">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2">{label.link.lastError}</span>
        </p>
      )}
    </li>
  );
}

function LinkStatus({ link, state }: { link: LabelLink | null; state: LinkState }) {
  if (!link) return <span>No iCal link · events added by hand</span>;

  return (
    <span className="flex min-w-0 items-center gap-1">
      {/* The host gives way first, so the sync status stays readable. */}
      <span className="min-w-0 truncate text-ink-soft">{link.host}</span>
      <span className="shrink-0">
        {"· "}
        {state === "paused" && "Sync paused"}
        {state === "waiting" && "Not synced yet"}
        {state === "error" && "Last sync failed"}
        {state === "ok" && link.lastSyncedAt && (
          <>
            Synced <TimeAgo date={link.lastSyncedAt} />
          </>
        )}
      </span>
    </span>
  );
}
