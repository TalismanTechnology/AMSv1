"use client";

import { motion } from "framer-motion";

interface FollowUpChipsProps {
  followUps: string[];
  onSelect: (question: string) => void;
}

export function FollowUpChips({ followUps, onSelect }: FollowUpChipsProps) {
  if (followUps.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {followUps.map((question, i) => (
        <motion.button
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 + i * 0.1 }}
          onClick={() => onSelect(question)}
          className="inline-flex items-center rounded-full border border-border px-3.5 py-1.5 text-xs text-ink-soft transition-colors hover:bg-secondary hover:text-ink"
        >
          {question}
        </motion.button>
      ))}
    </div>
  );
}
