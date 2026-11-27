"use client";

import { StaggerChildren, motion, fadeInUp } from "@/components/motion";
import { useT } from "@/components/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n/translate";

// Shown when the school hasn't set its own (those stay as the admin wrote them).
const SUGGESTED_QUESTION_KEYS: MessageKey[] = [
  "chat.defaultQuestion1",
  "chat.defaultQuestion2",
  "chat.defaultQuestion3",
  "chat.defaultQuestion4",
  "chat.defaultQuestion5",
  "chat.defaultQuestion6",
];

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
  questions?: string[];
  welcomeMessage?: string | null;
}

export function SuggestedQuestions({
  onSelect,
  questions,
  welcomeMessage,
}: SuggestedQuestionsProps) {
  const t = useT();
  const displayQuestions = (
    questions?.length ? questions : SUGGESTED_QUESTION_KEYS.map((key) => t(key))
  ).slice(0, 3);

  return (
    // Compact while the keyboard is open, so the welcome fits above it.
    <div className="flex flex-col items-center py-20 text-center [[data-keyboard=open]_&]:py-4">
      <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
        {t("chat.welcomeHeading")}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {welcomeMessage || t("chat.welcomeText")}
      </p>

      <StaggerChildren className="mt-8 flex w-full max-w-lg flex-wrap justify-center gap-2">
        {displayQuestions.map((question) => (
          <motion.button
            key={question}
            variants={fadeInUp}
            onClick={() => onSelect(question)}
            className="rounded-full border border-border px-4 py-2 text-left text-sm text-ink-soft transition-colors hover:bg-secondary"
          >
            {question}
          </motion.button>
        ))}
      </StaggerChildren>
    </div>
  );
}
