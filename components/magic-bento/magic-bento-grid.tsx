import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MagicBentoGridProps {
  children: ReactNode;
  className?: string;
}

export function MagicBentoGrid({
  children,
  className,
}: MagicBentoGridProps) {
  return (
    <div className={cn("relative", className)}>
      {children}
    </div>
  );
}
