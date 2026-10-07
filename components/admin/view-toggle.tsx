"use client";

import { cn } from "@/lib/utils";

interface ViewToggleOption<T extends string> {
  value: T;
  label: string;
  icon: React.ReactNode;
}

/**
 * Switches between views of the same content, styled like a tab list. These
 * are pressed/unpressed buttons rather than tabs because there are no tab
 * panels: the views share one region.
 */
export function ViewToggle<T extends string>({
  label,
  value,
  options,
  onChange,
  idPrefix,
}: {
  /** Accessible name for the group, e.g. "Show documents as". */
  label: string;
  value: T;
  options: ViewToggleOption<T>[];
  onChange: (value: T) => void;
  /** Gives each button the id `${idPrefix}-${value}`, so it can be focused. */
  idPrefix?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex h-9 w-fit items-center rounded-lg bg-muted p-[3px] text-muted-foreground"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            id={idPrefix ? `${idPrefix}-${option.value}` : undefined}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium whitespace-nowrap outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground/60 hover:text-foreground"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
