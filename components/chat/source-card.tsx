"use client";

import { FileText, ExternalLink } from "lucide-react";
import { useSourcePanel } from "./source-panel-context";
import type { ChatSource } from "@/lib/types";

export function SourceCard({ source, index }: { source: ChatSource; index?: number }) {
  const { openSource } = useSourcePanel();

  const excerpt = source.chunk_content?.replace(/\.\.\.$/,  "").trim();

  return (
    <button
      onClick={() => openSource(source)}
      className="metallic-card flex w-full flex-col gap-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/80"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium text-foreground">
            {index != null ? `[${index}] ` : ""}{source.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {source.similarity != null && (
            <span className="text-[10px] text-muted-foreground/60">
              {Math.round(source.similarity * 100)}%
            </span>
          )}
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/70" />
        </div>
      </div>
      {excerpt && (
        <p className="line-clamp-2 text-xs text-muted-foreground/80 leading-relaxed">
          {excerpt}
        </p>
      )}
    </button>
  );
}
