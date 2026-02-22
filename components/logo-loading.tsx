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

const CYCLE_DURATION = 1.8;

interface LogoLoadingProps {
  size?: number;
  fullScreen?: boolean;
}

export function LogoLoading({ size = 80, fullScreen }: LogoLoadingProps) {
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
      <div
        className={cn(
          "flex items-center justify-center",
          fullScreen ? "min-h-screen" : "min-h-[200px]"
        )}
      >
        <svg
          width={width}
          height={height}
          viewBox={LOGO_VIEWBOX}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-muted-foreground"
        >
          <path
            d={HEAD_PATH.d}
            fill="currentColor"
            transform={`translate(${HEAD_PATH.translateX}, ${HEAD_PATH.translateY})`}
          />
          <path
            d={BODY_PATH.d}
            fill="currentColor"
            transform={`translate(${BODY_PATH.translateX}, ${BODY_PATH.translateY})`}
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        fullScreen ? "min-h-screen" : "min-h-[200px]"
      )}
    >
      <div className="flex flex-col items-center gap-3 text-foreground">
        <svg
          width={width}
          height={height}
          viewBox={LOGO_VIEWBOX}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Head — bounces with slight delay */}
          <motion.path
            d={HEAD_PATH.d}
            transform={`translate(${HEAD_PATH.translateX}, ${HEAD_PATH.translateY})`}
            fill="currentColor"
            style={{ transformOrigin: "742px 385px" }}
            animate={{
              opacity: [0.3, 1, 1, 0.3],
              scale: [0.85, 1, 1, 0.85],
              y: [-15, 0, 0, -15],
            }}
            transition={{
              duration: CYCLE_DURATION,
              repeat: Infinity,
              ease: "easeInOut",
              times: [0, 0.3, 0.7, 1],
            }}
          />
          {/* Body — bounces with offset timing */}
          <motion.path
            d={BODY_PATH.d}
            transform={`translate(${BODY_PATH.translateX}, ${BODY_PATH.translateY})`}
            fill="currentColor"
            style={{ transformOrigin: "750px 500px" }}
            animate={{
              opacity: [0.3, 1, 1, 0.3],
              scale: [0.85, 1, 1, 0.85],
              y: [15, 0, 0, 15],
            }}
            transition={{
              duration: CYCLE_DURATION,
              repeat: Infinity,
              ease: "easeInOut",
              times: [0, 0.3, 0.7, 1],
              delay: 0.1,
            }}
          />
        </svg>
        <motion.span
          className="text-xs text-muted-foreground"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          Loading...
        </motion.span>
      </div>
    </div>
  );
}
