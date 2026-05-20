"use client";

import { useRef, type ReactNode, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";

// Cursor-following radial highlight. Renders a child layer with a radial
// gradient whose center is driven by --mx / --my CSS variables, updated
// on pointer move directly on the DOM node (no React re-renders).
//
// Glass-safe: uses no `transform`, so backdrop-filter on children keeps working.
// Skipped on touch devices and under prefers-reduced-motion.
export function CursorSpotlight({
  children,
  className,
  intensity = 0.12,
  radius = 320,
  color = "oklch(1 0 0 / VAR_OPACITY)",
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
  radius?: number;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    if (e.pointerType === "touch") return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
    el.style.setProperty("--spot-opacity", String(intensity));
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--spot-opacity", "0");
  }

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  const spotColor = color.replace("VAR_OPACITY", "var(--spot-opacity, 0)");

  const style: CSSProperties & Record<string, string> = {
    "--mx": "50%",
    "--my": "50%",
    "--spot-opacity": "0",
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={style}
      className={`relative ${className ?? ""}`}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{
          background: `radial-gradient(${radius}px circle at var(--mx) var(--my), ${spotColor}, transparent 70%)`,
          mixBlendMode: "plus-lighter",
        }}
      />
    </div>
  );
}
