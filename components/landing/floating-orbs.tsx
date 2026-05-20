"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

// Three layered orbs that drift slowly and parallax at different speeds.
// Sits above the topographic background, below page content.
// Skipped entirely under prefers-reduced-motion.
export function FloatingOrbs() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const y1 = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, -240]);
  const y3 = useTransform(scrollYProgress, [0, 1], [0, -380]);

  if (reduce) {
    return null;
  }

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden"
    >
      {/* Deep layer — large, slowest, blue-steel */}
      <motion.div
        style={{ y: y1, animation: "float-orb-1 22s ease-in-out infinite" }}
        className="absolute -left-32 top-[12%] h-[36rem] w-[36rem] rounded-full opacity-40 blur-[120px]"
      >
        <div
          className="h-full w-full rounded-full"
          style={{
            background:
              "radial-gradient(circle, var(--metal-blue-steel-light) 0%, transparent 65%)",
          }}
        />
      </motion.div>

      {/* Mid layer — platinum/chrome glow */}
      <motion.div
        style={{ y: y2, animation: "float-orb-2 18s ease-in-out infinite" }}
        className="absolute right-[-10%] top-[28%] h-[28rem] w-[28rem] rounded-full opacity-35 blur-[100px]"
      >
        <div
          className="h-full w-full rounded-full"
          style={{
            background:
              "radial-gradient(circle, var(--metal-platinum-light) 0%, transparent 65%)",
          }}
        />
      </motion.div>

      {/* Foreground accent — smaller, faster, gunmetal-cool */}
      <motion.div
        style={{ y: y3, animation: "float-orb-3 14s ease-in-out infinite" }}
        className="absolute left-[18%] top-[55%] h-[20rem] w-[20rem] rounded-full opacity-30 blur-[90px]"
      >
        <div
          className="h-full w-full rounded-full"
          style={{
            background:
              "radial-gradient(circle, var(--metal-gunmetal-light) 0%, transparent 65%)",
          }}
        />
      </motion.div>
    </div>
  );
}
