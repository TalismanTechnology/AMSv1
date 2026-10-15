"use client";

import { cn } from "@/lib/utils";

export type SourceView = "original" | "text";

/**
 * "Original | Text" switch for sources that have both a rendered original
 * (a Word file, an HTML email) and the formatted text it was read from.
 */
export function ViewToggle({
  value,
  onChange,
  className,
}: {
  value: SourceView;
  onChange: (value: SourceView) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Document view"
      className={cn("inline-flex rounded-lg border border-border p-0.5 text-xs", className)}
    >
      {(["original", "text"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium transition-colors",
            value === v ? "bg-muted text-ink" : "text-muted-foreground hover:text-ink"
          )}
        >
          {v === "original" ? "Original" : "Text"}
        </button>
      ))}
    </div>
  );
}
