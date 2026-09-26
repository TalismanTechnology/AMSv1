"use client";

import { FileText } from "lucide-react";
import { useSourcePanel } from "./source-panel-context";
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
            <FileText className="size-3.5 shrink-0" />
            <span className={`truncate ${group.isCited ? "text-ink-soft" : ""}`}>
              {group.title}
            </span>
          </button>
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
        </div>
      ))}
    </div>
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
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.7rem] leading-none tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        active
          ? "border-primary/50 bg-primary/15 text-ink"
          : "border-border bg-background hover:border-primary/40 hover:bg-primary/10 hover:text-ink"
      }`}
    >
      {showNumber && passage.source_number != null && (
        <span className="font-medium">{passage.source_number}</span>
      )}
      {showNumber && passage.source_number != null && label && (
        <span aria-hidden className="opacity-50">·</span>
      )}
      {label && <span>{label}</span>}
    </button>
  );
}
