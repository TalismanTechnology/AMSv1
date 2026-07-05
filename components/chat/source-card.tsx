"use client";

import { FileText, ArrowUpRight } from "lucide-react";
import { useSourcePanel } from "./source-panel-context";
import type { ChatSource } from "@/lib/types";

export function SourceCard({ source, index }: { source: ChatSource; index?: number }) {
  const { openSource } = useSourcePanel();

  return (
    <button
      onClick={() => openSource(source)}
      className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary"
    >
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        {index != null ? (
          <span className="mr-1">[{index}]</span>
        ) : null}
        {source.title}
        {source.location?.label && (
          <span className="ml-1.5 text-xs">· {source.location.label}</span>
        )}
      </span>
      {source.similarity != null && (
        <span className="shrink-0 text-[0.65rem] tabular-nums">
          {Math.round(source.similarity * 100)}%
        </span>
      )}
      <ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
