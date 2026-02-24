"use client";

import { MessageSquare } from "lucide-react";
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
    <div className="flex flex-col items-center justify-center py-12">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <MessageSquare className="h-8 w-8 neon-icon-blue" />
      </div>
      <h2 className="text-xl font-semibold text-foreground metallic-heading">
        Ask about your school
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {welcomeMessage || "Get instant answers from official school documents"}
      </p>
      <StaggerChildren className="mt-8 grid max-w-lg gap-2 sm:grid-cols-2">
        {displayQuestions.map((question) => (
          <motion.button
            key={question}
            variants={fadeInUp}
            onClick={() => onSelect(question)}
            className="metallic-card rounded-lg px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            {question}
          </motion.button>
        ))}
      </StaggerChildren>
    </div>
  );
}
