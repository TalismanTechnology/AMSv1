"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  HEAD_PATH,
  BODY_PATH,
  LOGO_VIEWBOX,
  LOGO_ASPECT_RATIO,
} from "@/lib/logo-paths";
import { cn } from "@/lib/utils";

interface LogoSpinnerProps {
  size?: number;
  className?: string;
}

export function LogoSpinner({ size = 16, className }: LogoSpinnerProps) {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    setPrefersReduced(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  const width = size * LOGO_ASPECT_RATIO;
  const height = size;

  if (prefersReduced) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={LOGO_VIEWBOX}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("opacity-70", className)}
      >
        <g fill="currentColor">
          <path
            d={HEAD_PATH.d}
            transform={`translate(${HEAD_PATH.translateX}, ${HEAD_PATH.translateY})`}
          />
          <path
            d={BODY_PATH.d}
            transform={`translate(${BODY_PATH.translateX}, ${BODY_PATH.translateY})`}
          />
        </g>
      </svg>
    );
  }

  return (
    <motion.svg
      width={width}
      height={height}
      viewBox={LOGO_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      animate={{ scale: [0.85, 1, 0.85], opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Head + body grouped so the pulsing opacity (animated on the svg)
          composites as one unit instead of doubling where they overlap. */}
      <g fill="currentColor">
        <path
          d={HEAD_PATH.d}
          transform={`translate(${HEAD_PATH.translateX}, ${HEAD_PATH.translateY})`}
        />
        <path
          d={BODY_PATH.d}
          transform={`translate(${BODY_PATH.translateX}, ${BODY_PATH.translateY})`}
        />
      </g>
    </motion.svg>
  );
}
