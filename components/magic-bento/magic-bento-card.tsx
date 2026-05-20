"use client";

import { type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface MagicBentoCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  enableParticles?: boolean;
  enableTilt?: boolean;
  enableMagnetism?: boolean;
  enableClickRipple?: boolean;
  particleCount?: number;
  glowColor?: string;
  disableAnimations?: boolean;
}

// Pass-through wrapper. Previously this rendered transforms, particles, and
// ripple effects that created a stacking context and broke backdrop-filter
// on the glass cards inside. The site now leans into glassmorphism instead
// of magic-bento animations.
export function MagicBentoCard({
  children,
  className,
  style,
}: MagicBentoCardProps) {
  return (
    <div data-slot="magic-bento-card" className={cn(className)} style={style}>
      {children}
    </div>
  );
}
