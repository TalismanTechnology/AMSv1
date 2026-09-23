"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

// The stage the product demo sits on. The demo plate starts tipped back in
// perspective and levels out as it scrolls into view, so it arrives like a
// screen being set down on the desk. Two cream slabs sit behind it, offset
// upward — the layering is what sells the depth. Everything degrades to a
// static, level plate under prefers-reduced-motion.

const TILT_DEG = 16;

export function DemoStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 95%", "start 35%"],
  });
  const rotateX = useTransform(scrollYProgress, [0, 1], [reduceMotion ? 0 : TILT_DEG, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [reduceMotion ? 1 : 0.94, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [reduceMotion ? 0 : 48, 0]);
  const slabOpacity = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div ref={ref} className="relative">
      {/* Stacked slabs behind the plate */}
      <motion.div
        aria-hidden
        style={{ opacity: slabOpacity }}
        className="lp-slab absolute inset-x-6 -top-3 bottom-3 rounded-[32px] sm:inset-x-10 sm:-top-5 sm:bottom-5"
      />
      <motion.div
        aria-hidden
        style={{ opacity: slabOpacity }}
        className="lp-slab absolute inset-x-12 -top-6 bottom-6 rounded-[32px] opacity-70 sm:inset-x-20 sm:-top-10 sm:bottom-10"
      />

      {/* The plate */}
      <motion.div
        style={{
          rotateX,
          scale,
          y,
          transformPerspective: 1800,
          transformOrigin: "50% 100%",
        }}
        className="relative rounded-[32px] border border-brand-dark/12 bg-white p-2 shadow-[var(--lp-shadow-float)] sm:p-3"
      >
        {children}
      </motion.div>

      {/* Floor shadow: a soft pool under the plate so it sits on the page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[12%] -bottom-10 h-16 rounded-[100%] bg-brand-dark/15 blur-2xl"
      />
    </div>
  );
}
