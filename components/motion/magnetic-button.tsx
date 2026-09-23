"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";

// Wrapper that pulls its child toward the cursor when the pointer
// enters a magnetic zone around the button. Translates via Framer
// Motion springs — no layout thrash, no stacking context issues for
// children (the child can still have backdrop-filter).
//
// Falls back to a static wrapper under prefers-reduced-motion and on touch.
export function MagneticButton({
  children,
  className,
  strength = 0.35,
  radius = 80,
}: {
  children: ReactNode;
  className?: string;
  /** How strongly the child follows the cursor (0–1, sane range 0.2–0.5) */
  strength?: number;
  /** Magnetic zone in px outside the button bounds */
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  // The markup below is the same whether or not motion is reduced.
  // `prefers-reduced-motion` is only knowable on the client, so branching the
  // render on it (the old `if (reduce) return <div>`) made a reduced-motion
  // client's first paint disagree with the server HTML — a hydration error on
  // every page using this. Reduced motion instead turns the handlers into
  // no-ops, so the springs simply stay at 0.
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce) return;
    if (e.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const maxDist = Math.max(rect.width, rect.height) / 2 + radius;
    if (dist > maxDist) {
      x.set(0);
      y.set(0);
      return;
    }
    x.set(dx * strength);
    y.set(dy * strength);
  }

  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`inline-block ${className ?? ""}`}
    >
      <motion.div style={{ x: sx, y: sy }}>{children}</motion.div>
    </div>
  );
}
