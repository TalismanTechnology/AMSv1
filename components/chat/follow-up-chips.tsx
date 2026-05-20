"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

interface FollowUpChipsProps {
  followUps: string[];
  onSelect: (question: string) => void;
}

export function FollowUpChips({ followUps, onSelect }: FollowUpChipsProps) {
  if (followUps.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {followUps.map((question, i) => (
        <motion.button
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 + i * 0.1 }}
          onClick={() => onSelect(question)}
          className="frost-surface group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:-translate-y-0.5 hover:border-primary/30 hover:text-foreground"
        >
          <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
          {question}
        </motion.button>
      ))}
    </div>
  );
}
