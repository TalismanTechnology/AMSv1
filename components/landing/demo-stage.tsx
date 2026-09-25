"use client";

import type { ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type TargetAndTransition,
} from "framer-motion";

// The stage the product demo sits on, at the foot of the hero. It rises in
// once the headline has landed and stops with only its top half above the
// fold, the rest of the product left as a teaser to scroll for. The plate's
// contents fade in a beat after the plate itself. Under
// prefers-reduced-motion it appears in place, with no travel.

// Starts after the headline's staggered lines (globals.css .stagger-4..7).
const ENTER_DELAY_S = 1.0;
const ENTER_DURATION_S = 1.2;
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const SETTLED: TargetAndTransition = { opacity: 1, y: 0, scale: 1 };

function enter(
  reduceMotion: boolean | null,
  delay: number,
  from: TargetAndTransition,
  to: TargetAndTransition = SETTLED
): HTMLMotionProps<"div"> {
  // Server and client must render the same `initial` (the server can't know
  // the motion preference), so reduced motion keeps the states and only
  // drops the travel time: the plate snaps into place on hydration.
  return {
    initial: from,
    animate: to,
    transition: reduceMotion
      ? { duration: 0 }
      : { delay, duration: ENTER_DURATION_S, ease: EASE_OUT_EXPO },
  };
}

export function DemoStage({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative">
      {/* The plate */}
      <motion.div
        {...enter(reduceMotion, ENTER_DELAY_S, { opacity: 0, y: 160, scale: 0.96 })}
        className="relative rounded-[32px] border border-brand-dark/12 bg-white p-2 shadow-[var(--lp-shadow-float)] sm:p-3"
      >
        <motion.div
          {...enter(reduceMotion, ENTER_DELAY_S + 0.45, { opacity: 0 })}
        >
          {children}
        </motion.div>
      </motion.div>

      {/* Floor shadow: a soft pool under the plate so it sits on the page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[12%] -bottom-10 h-16 rounded-[100%] bg-brand-dark/15 blur-2xl"
      />
    </div>
  );
}
