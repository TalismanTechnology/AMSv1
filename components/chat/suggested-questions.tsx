"use client";

import { StaggerChildren, motion, fadeInUp } from "@/components/motion";

const SUGGESTED_QUESTIONS = [
  "What are the school hours?",
  "What is the dress code policy?",
  "How do I contact my child's teacher?",
  "What are the lunch options?",
  "When is the next parent-teacher conference?",
  "What is the attendance policy?",
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
  const displayQuestions = questions?.length ? questions : SUGGESTED_QUESTIONS;

  return (
    <div className="flex flex-col items-center py-20 text-center">
      <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
        Ask about your school
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {welcomeMessage || "Get instant answers from official school documents."}
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
