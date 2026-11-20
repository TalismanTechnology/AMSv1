"use client";

import { BadgeCheck, CalendarDays, CalendarPlus, FileText, Globe } from "lucide-react";
import { IconBadge } from "./icon-badge";
import { useSourcePanel } from "./source-panel-context";
import { AddToCalendarMenu } from "@/components/shared/add-to-calendar";
import { groupSources } from "@/lib/source-groups";
import type { ChatSource } from "@/lib/types";

export function SourceList({
  sources,
  citedNumbers,
}: {
  sources: ChatSource[];
  citedNumbers: Set<number>;
}) {
  const { openSource, activeSource } = useSourcePanel();
  const groups = groupSources(sources, citedNumbers);
  if (groups.length === 0) return null;

  const isActive = (s: ChatSource) =>
    activeSource?.document_id === s.document_id &&
    activeSource?.source_number === s.source_number;

  return (
    <div className="flex flex-col gap-0.5">
      <p className="mb-1 text-xs text-muted-foreground">Sources</p>
      {groups.map((group) => (
        <div
          key={group.key}
          className="group flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary"
        >
          <button
            type="button"
            onClick={() => openSource(group.passages[0])}
            className="flex min-w-0 flex-1 items-center gap-2 text-left focus:outline-none focus-visible:underline"
          >
            <IconBadge className="group-hover:bg-brand-badge-strong">
              {group.passages[0].source_type === "clarification" ? (
                <BadgeCheck className="size-3" />
              ) : group.isEvent ? (
                <CalendarDays className="size-3" aria-label="Calendar event" />
              ) : group.isWebsite ? (
                <Globe className="size-3" />
              ) : (
                <FileText className="size-3" />
              )}
            </IconBadge>
            <span className={`truncate ${group.isCited ? "text-ink-soft" : ""}`}>
              {group.title}
            </span>
          </button>
          {/* A web page opens as a card linking to the page, so passage
              chips would all lead to the same place. A calendar entry's chip
              carries its date (and time, unless it's all-day). */}
          {!group.isWebsite && (
            <span className="flex shrink-0 flex-wrap gap-1">
              {group.passages.map((passage) => (
                <PassageChip
                  key={passage.source_number ?? passage.chunk_index}
                  passage={passage}
                  showNumber={group.isCited}
                  active={isActive(passage)}
                  onClick={() => openSource(passage)}
                />
              ))}
            </span>
          )}
          {group.isEvent && <EventCalendarButton source={group.passages[0]} />}
        </div>
      ))}
    </div>
  );
}

/** Add a cited calendar entry (a whole range, if it spans days) to the parent's calendar. */
function EventCalendarButton({ source }: { source: ChatSource }) {
  const event = source.event;
  if (!event?.date) return null;
  return (
    <AddToCalendarMenu
      event={{
        id: source.document_id,
        title: source.title,
        date: event.date,
        date_end: event.date_end,
        start_time: event.start_time,
        end_time: event.end_time,
        location: event.location,
      }}
    >
      <button
        type="button"
        aria-label={`Add ${source.title} to calendar`}
        className="group/cal inline-flex size-6 shrink-0 items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 data-[state=open]:bg-primary/10"
      >
        <IconBadge className="group-hover/cal:bg-brand-badge-strong">
          <CalendarPlus className="size-3" />
        </IconBadge>
      </button>
    </AddToCalendarMenu>
  );
}

function PassageChip({
  passage,
  showNumber,
  active,
  onClick,
}: {
  passage: ChatSource;
  showNumber: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const label = passage.location?.label;
  if (!showNumber && !label) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${passage.title}${label ? ` at ${label}` : ""}`}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-md border border-transparent brand-badge px-1.5 py-0.5 text-[0.7rem] leading-none tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 ${
        active
          ? "bg-brand-badge-strong ring-2 ring-brand-badge ring-offset-1 ring-offset-background"
          : "hover:bg-brand-badge-strong"
      }`}
    >
      {showNumber && passage.source_number != null && (
        <span className="font-medium">{passage.source_number}</span>
      )}
      {showNumber && passage.source_number != null && label && (
        <span aria-hidden className="opacity-70">·</span>
      )}
      {label && <span>{label}</span>}
    </button>
  );
}
