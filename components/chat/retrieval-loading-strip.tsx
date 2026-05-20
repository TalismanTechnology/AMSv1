"use client";

import { motion } from "framer-motion";

export function RetrievalLoadingStrip() {
  return (
    <div className="metallic-surface relative flex h-10 items-center gap-2 overflow-hidden rounded-md border border-glass-border px-3">
      {/* Deep slow sheen */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-1/2"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.7 0.04 240 / 0.10), transparent)",
        }}
        animate={{ x: ["-160%", "360%"] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "linear" }}
      />
      {/* Foreground fast sheen */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-1/3"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.18), transparent)",
        }}
        animate={{ x: ["-120%", "320%"] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="relative text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        Searching documents
      </span>
    </div>
  );
}
