import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small brand-green rounded badge holding a white icon. Sized to sit inside a
 * text-sm row or an h-7 icon button without growing it; pass a size-3 glyph.
 * Darken it for hover / selected with `bg-brand-badge-strong`.
 */
export function IconBadge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-md brand-badge transition-colors",
        className
      )}
    >
      {children}
    </span>
  );
}
