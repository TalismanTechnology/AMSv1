"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TimeAgo } from "@/components/ui/time-ago";
import { CalendarChipSelect } from "@/components/admin/calendar-chip-select";
import { splitCalendars } from "@/lib/event-calendars";
import {
  addCalendarFeed,
  deleteCalendarFeed,
  setFeedCalendarMapping,
  syncCalendarsNow,
  updateCalendarFeed,
} from "@/actions/blackbaud-calendar";
import type { BlackbaudCalendarFeed, EventCalendar } from "@/lib/types";

// Feed management for the Blackbaud panel in admin settings.
//
// Blackbaud has no SKY API endpoint for school calendars, so events come from
// the iCal subscription links a school publishes from its own site. Each feed
// is mapped once onto the school's divisions and categories; that mapping is
// the strongest auto-tagging signal there is, because a feed named "Upper
// School Athletics" has already answered the question for every event on it.

export interface FeedWithMapping extends BlackbaudCalendarFeed {
  mappedCalendarIds: string[];
  pendingCount: number;
}

interface Props {
  schoolId: string;
  schoolSlug: string;
  feeds: FeedWithMapping[];
  calendars: EventCalendar[];
}

export function BlackbaudCalendarFeeds({
  schoolId,
  schoolSlug,
  feeds,
  calendars,
}: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);

  const { divisions, categories } = splitCalendars(calendars);
  const totalPending = feeds.reduce((sum, feed) => sum + feed.pendingCount, 0);

  async function handleAdd() {
    if (!label.trim() || !url.trim()) {
      toast.error("Give the feed a name and paste its URL.");
      return;
    }

    startTransition(async () => {
      const result = await addCalendarFeed(schoolId, {
        label: label.trim(),
        url: url.trim(),
        // The feed's own zone decides what "3:30pm" means. Default to the
        // browser's, which is the school's in practice.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Feed added — found ${result.previewCount ?? 0} upcoming events.`
      );
      setLabel("");
      setUrl("");
      setIsAdding(false);
    });
  }

  async function handleSync() {
    setSyncing(true);
    const result = await syncCalendarsNow(schoolId);
    setSyncing(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    const staged =
      result.summary?.results.reduce(
        (sum, feed) => sum + feed.created + feed.updated,
        0
      ) ?? 0;
    const failures = result.summary?.failures ?? [];

    if (failures.length > 0) {
      toast.warning(
        `Synced with ${failures.length} feed${failures.length === 1 ? "" : "s"} failing.`
      );
    } else {
      toast.success(
        staged > 0
          ? `${staged} event${staged === 1 ? "" : "s"} ready to review.`
          : "Already up to date."
      );
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-ink">Calendar feeds</h3>
          <p className="text-xs text-muted-foreground">
            Blackbaud publishes school calendars as iCal subscriptions rather
            than through the SKY API. Paste the link from each calendar you want
            parents to see.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {feeds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          )}
          <Button size="sm" onClick={() => setIsAdding((open) => !open)}>
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
            Add feed
          </Button>
        </div>
      </div>

      {totalPending > 0 && (
        <a
          href={`/s/${schoolSlug}/admin/events/blackbaud`}
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 transition-colors hover:bg-amber-500/10"
        >
          <span className="text-sm text-ink">
            {totalPending} synced event{totalPending === 1 ? "" : "s"} waiting
            for review
          </span>
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Review →
          </span>
        </a>
      )}

      {isAdding && (
        <div className="space-y-3 rounded-lg border border-border bg-background p-4">
          <div className="space-y-1.5">
            <Label htmlFor="feed-label">Name</Label>
            <Input
              id="feed-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Upper School Athletics"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feed-url">Subscription link</Label>
            <Input
              id="feed-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="webcal://yourschool.myschoolapp.com/podium/feed/ical.aspx?…"
            />
            <p className="text-xs text-muted-foreground">
              In Blackbaud, open the calendar and copy its iCal or subscribe
              link. We check the link before saving it.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAdding(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={isPending}>
              {isPending ? "Checking…" : "Add feed"}
            </Button>
          </div>
        </div>
      )}

      {feeds.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No calendar feeds yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {feeds.map((feed) => (
            <FeedRow
              key={feed.id}
              schoolId={schoolId}
              feed={feed}
              divisions={divisions}
              categories={categories}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedRow({
  schoolId,
  feed,
  divisions,
  categories,
}: {
  schoolId: string;
  feed: FeedWithMapping;
  divisions: EventCalendar[];
  categories: EventCalendar[];
}) {
  const [mapped, setMapped] = useState<string[]>(feed.mappedCalendarIds);
  const [isActive, setIsActive] = useState(feed.is_active);

  async function toggleCalendar(calendarId: string) {
    const next = mapped.includes(calendarId)
      ? mapped.filter((id) => id !== calendarId)
      : [...mapped, calendarId];

    setMapped(next);

    const result = await setFeedCalendarMapping(schoolId, feed.id, next);
    if (result.error) {
      setMapped(mapped); // roll back to what the server still has
      toast.error(result.error);
    }
  }

  async function toggleActive(next: boolean) {
    setIsActive(next);
    const result = await updateCalendarFeed(schoolId, feed.id, {
      isActive: next,
    });
    if (result.error) {
      setIsActive(!next);
      toast.error(result.error);
    }
  }

  async function handleDelete() {
    const result = await deleteCalendarFeed(schoolId, feed.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Feed removed. Events already published stay on the calendar.");
  }

  return (
    <li className="space-y-3 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium text-ink">{feed.label}</p>
          <p className="text-xs text-muted-foreground">
            {feed.last_synced_at ? (
              <>
                Last synced <TimeAgo date={feed.last_synced_at} />
              </>
            ) : (
              "Not synced yet"
            )}
            {" · "}
            {feed.timezone}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id={`feed-active-${feed.id}`}
              checked={isActive}
              onCheckedChange={toggleActive}
            />
            <Label
              htmlFor={`feed-active-${feed.id}`}
              className="text-xs text-muted-foreground"
            >
              Active
            </Label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
            onClick={handleDelete}
            aria-label={`Remove ${feed.label}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {feed.last_error && (
        <p className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {feed.last_error}
        </p>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          Tag everything from this feed as:
        </p>
        {divisions.length > 0 && (
          <CalendarChipSelect
            items={divisions}
            kind="division"
            selected={mapped}
            onToggle={toggleCalendar}
          />
        )}
        {categories.length > 0 && (
          <CalendarChipSelect
            items={categories}
            kind="category"
            selected={mapped}
            onToggle={toggleCalendar}
          />
        )}
      </div>
    </li>
  );
}
