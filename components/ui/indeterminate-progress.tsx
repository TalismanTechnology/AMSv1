import { cn } from "@/lib/utils";

/**
 * Thin indeterminate progress bar for work with no measurable progress (e.g.
 * waiting on an AI response). No percentage: a short segment sweeps across
 * the track, and stands still under prefers-reduced-motion (globals.css).
 *
 * Decorative by default; pass `label` to expose it as an indeterminate
 * progressbar when no nearby text already announces the wait.
 */
export function IndeterminateProgress({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      data-slot="indeterminate-progress"
      className={cn(
        "relative h-0.5 w-full overflow-hidden rounded-full bg-muted-foreground/15",
        className
      )}
      {...(label
        ? { role: "progressbar", "aria-label": label }
        : { "aria-hidden": true })}
    >
      <div className="indeterminate-progress-bar absolute inset-y-0 left-0 w-2/5 rounded-full bg-muted-foreground/50" />
    </div>
  );
}
