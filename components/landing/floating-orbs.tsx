"use client";

import { useReducedMotion } from "framer-motion";

// Three layered orbs that drift slowly via cheap, GPU-composited CSS
// transform animations. Sits above the topographic background, below page
// content. Skipped entirely under prefers-reduced-motion.
export function FloatingOrbs() {
  const reduce = useReducedMotion();

  if (reduce) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden"
    >
      {/* Deep layer — large, slowest, blue-steel */}
      <div
        style={{
          animation: "float-orb-1 22s ease-in-out infinite",
          willChange: "transform",
        }}
        className="absolute -left-32 top-[12%] h-[36rem] w-[36rem] rounded-full opacity-40 blur-[80px]"
      >
        <div
          className="h-full w-full rounded-full"
          style={{
            background:
              "radial-gradient(circle, var(--metal-blue-steel-light) 0%, transparent 65%)",
          }}
        />
      </div>

      {/* Mid layer — platinum/chrome glow */}
      <div
        style={{
          animation: "float-orb-2 18s ease-in-out infinite",
          willChange: "transform",
        }}
        className="absolute right-[-10%] top-[28%] h-[28rem] w-[28rem] rounded-full opacity-35 blur-[70px]"
      >
        <div
          className="h-full w-full rounded-full"
          style={{
            background:
              "radial-gradient(circle, var(--metal-platinum-light) 0%, transparent 65%)",
          }}
        />
      </div>

      {/* Foreground accent — smaller, faster, gunmetal-cool */}
      <div
        style={{
          animation: "float-orb-3 14s ease-in-out infinite",
          willChange: "transform",
        }}
        className="absolute left-[18%] top-[55%] h-[20rem] w-[20rem] rounded-full opacity-30 blur-[60px]"
      >
        <div
          className="h-full w-full rounded-full"
          style={{
            background:
              "radial-gradient(circle, var(--metal-gunmetal-light) 0%, transparent 65%)",
          }}
        />
      </div>
    </div>
  );
}
