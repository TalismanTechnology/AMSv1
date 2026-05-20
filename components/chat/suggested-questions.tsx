"use client";

import { MessageSquare } from "lucide-react";
import { StaggerChildren, motion, fadeInUp } from "@/components/motion";
import { CursorSpotlight } from "@/components/motion/cursor-spotlight";

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
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md border border-glass-border bg-muted/40">
        <MessageSquare className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold text-foreground">
        Ask about your school
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {welcomeMessage || "Get instant answers from official school documents"}
      </p>
      <StaggerChildren className="mt-8 grid max-w-lg auto-rows-fr gap-1.5 sm:grid-cols-2">
        {displayQuestions.map((question) => (
          <motion.div key={question} variants={fadeInUp} className="h-full">
            <CursorSpotlight radius={260} intensity={0.12} className="h-full rounded-md">
              <button
                onClick={() => onSelect(question)}
                className="frost-surface glass-noise flex h-full w-full items-center rounded-md px-3.5 py-2.5 text-left text-sm text-foreground hover:border-primary/40"
              >
                {question}
              </button>
            </CursorSpotlight>
          </motion.div>
        ))}
      </StaggerChildren>
    </div>
  );
}
