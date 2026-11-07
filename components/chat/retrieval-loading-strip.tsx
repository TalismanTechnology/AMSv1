"use client";

import { motion } from "framer-motion";
import { IndeterminateProgress } from "@/components/ui/indeterminate-progress";

export function RetrievalLoadingStrip() {
  return (
    // Mounted once per wait with fixed text, so screen readers hear it once.
    <div role="status" className="flex flex-col gap-2 text-muted-foreground">
      <div className="flex items-center gap-2.5">
        <span className="flex gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-1.5 rounded-full bg-muted-foreground/60"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut",
              }}
            />
          ))}
        </span>
        <span className="text-sm">Searching documents</span>
      </div>
      <IndeterminateProgress className="max-w-48" />
    </div>
  );
}
