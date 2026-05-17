"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  Bot,
  Download,
  FileText,
  Send,
  User,
  X,
} from "lucide-react";

/**
 * Self-contained looping demo of the parent flow:
 *   1. Question types into the input and is "sent"
 *   2. Assistant answer streams character-by-character
 *   3. A clickable citation [1] appears in the answer
 *   4. Side panel slides in from the right showing the source PDF page
 *   5. Everything resets and the loop continues
 *
 * Pure UI — no API calls. The content below is mock.
 */

const QUESTION = "What is the school dress code for grade 3?";

const ANSWER_PREFIX =
  "Grade 3 students wear the standard lower-school uniform: navy or khaki bottoms with a white or light-blue collared shirt. Sneakers are allowed on PE days. Full details are in the handbook ";
const ANSWER_SUFFIX = ".";

const SOURCE = {
  title: "Lower School Handbook 2025–26",
  page: "Page 14 — Uniform & Dress Code",
  similarity: 0.94,
  excerpt:
    "Students in grades K–4 wear the standard lower-school uniform. Acceptable bottoms include navy or khaki trousers, shorts, or skirts. Tops must be a solid white or light-blue collared shirt. On designated PE days, students may wear athletic sneakers and the official school PE shirt.",
};

const SCHOOL_NAME = "Maplewood Country Day School";
const SCHOOL_TAGLINE = "Lower School Family Handbook · Academic Year 2025–26";
const PDF_PAGE_NUM = 14;
const PDF_PAGE_TOTAL = 32;

/* ─────────────────────────  Timeline  ────────────────────────────
 *  We use a single elapsed-time counter and derive phase progress
 *  from it. This makes the whole loop trivially restartable.
 *
 *  Times are cumulative (ms).
 * ─────────────────────────────────────────────────────────────── */
const T = {
  questionStart: 600,
  questionTypeMs: 28, // per-char
  questionHold: 500,
  answerHold: 350,
  answerTypeMs: 14,
  citationHold: 1100, // pause on the [1] pill before "clicking" it
  panelHold: 4200,
  resetHold: 900,
};

type Phase =
  | "idle"
  | "typing-question"
  | "sending"
  | "thinking"
  | "answering"
  | "answered"
  | "panel-open"
  | "reset";

export function HowItWorksDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { margin: "-20% 0px" });

  const [phase, setPhase] = useState<Phase>("idle");
  const [questionTyped, setQuestionTyped] = useState("");
  const [answerTyped, setAnswerTyped] = useState("");
  const [loopKey, setLoopKey] = useState(0);

  const answerFull = useMemo(() => ANSWER_PREFIX + "[1]" + ANSWER_SUFFIX, []);

  /* Drives the whole loop. Pauses when off-screen. */
  useEffect(() => {
    if (!isInView) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const after = (ms: number, fn: () => void) => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(id);
    };

    const typeOut = (
      text: string,
      perCharMs: number,
      onChar: (s: string) => void,
      done: () => void,
    ) => {
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i += 1;
        onChar(text.slice(0, i));
        if (i < text.length) {
          after(perCharMs, tick);
        } else {
          done();
        }
      };
      tick();
    };

    // reset state
    setQuestionTyped("");
    setAnswerTyped("");
    setPhase("idle");

    after(T.questionStart, () => {
      setPhase("typing-question");
      typeOut(QUESTION, T.questionTypeMs, setQuestionTyped, () => {
        after(T.questionHold, () => {
          setPhase("sending");
          after(450, () => {
            setPhase("thinking");
            after(T.answerHold, () => {
              setPhase("answering");
              typeOut(answerFull, T.answerTypeMs, setAnswerTyped, () => {
                setPhase("answered");
                after(T.citationHold, () => {
                  setPhase("panel-open");
                  after(T.panelHold, () => {
                    setPhase("reset");
                    after(T.resetHold, () => {
                      setLoopKey((k) => k + 1);
                    });
                  });
                });
              });
            });
          });
        });
      });
    });

    return () => {
      cancelled = true;
      for (const id of timers) clearTimeout(id);
    };
  }, [isInView, loopKey, answerFull]);

  const showPanel = phase === "panel-open";
  const showAnswer =
    phase === "answering" ||
    phase === "answered" ||
    phase === "panel-open";
  const showThinking = phase === "thinking";
  const showUserBubble =
    phase === "sending" ||
    phase === "thinking" ||
    phase === "answering" ||
    phase === "answered" ||
    phase === "panel-open";
  const citationHighlighted =
    phase === "answered" || phase === "panel-open";

  return (
    <div ref={containerRef} className="w-full">
      {/* Frame */}
      <div className="metallic-card relative mx-auto overflow-hidden rounded-2xl border border-glass-border neon-border shadow-[0_10px_60px_-15px_var(--glow-primary)]">
        {/* Browser-style chrome */}
        <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/30 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <div className="ml-3 hidden flex-1 sm:block">
            <div className="mx-auto max-w-xs truncate rounded-md bg-background/60 px-3 py-0.5 text-center text-[11px] text-muted-foreground">
              askmyschool.app / chat
            </div>
          </div>
        </div>

        {/* Chat + side panel layout */}
        <div className="relative flex h-[520px] sm:h-[580px]">
          {/* Chat column */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Messages */}
            <div className="relative flex-1 space-y-4 overflow-hidden px-4 py-5 sm:px-6">
              <AnimatePresence>
                {showUserBubble && (
                  <motion.div
                    key={`u-${loopKey}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex flex-row-reverse gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/15%)]">
                      {QUESTION}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showThinking && (
                  <motion.div
                    key={`t-${loopKey}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="metallic-card rounded-2xl border border-border bg-card px-4 py-3">
                      <ThinkingDots />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showAnswer && (
                  <motion.div
                    key={`a-${loopKey}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="max-w-[85%] space-y-2">
                      <div className="metallic-card inline-block rounded-2xl border border-border bg-card px-4 py-2.5 text-sm text-foreground">
                        <AnswerWithCitation
                          text={answerTyped}
                          highlightCitation={citationHighlighted}
                        />
                      </div>

                      <AnimatePresence>
                        {citationHighlighted ? (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <SourceCardMock />
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Input bar */}
            <div className="border-t border-border/60 bg-muted/20 p-3 sm:p-4">
              <div className="metallic-surface relative flex items-center gap-2 rounded-full border border-border bg-background/60 py-2 pl-4 pr-2">
                <span className="flex-1 truncate text-sm text-foreground">
                  {questionTyped || (
                    <span className="text-muted-foreground">
                      Ask anything about your school…
                    </span>
                  )}
                  {phase === "typing-question" && <Caret />}
                </span>
                <motion.div
                  animate={
                    phase === "sending"
                      ? { scale: [1, 0.92, 1.05, 1] }
                      : { scale: 1 }
                  }
                  transition={{ duration: 0.45 }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_18px_var(--glow-primary)]"
                >
                  <Send className="h-3.5 w-3.5" />
                </motion.div>
              </div>
            </div>
          </div>

          {/* Source panel — slides in showing the PDF page itself */}
          <AnimatePresence>
            {showPanel && (
              <motion.div
                key={`panel-${loopKey}`}
                initial={{ width: 0, opacity: 0 }}
                animate={{
                  width: "min(380px, 58%)",
                  opacity: 1,
                }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-card neon-border"
              >
                <PdfSourcePanel />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Captions */}
      <div className="mt-6 grid grid-cols-1 gap-3 text-center text-sm sm:grid-cols-3">
        <Caption
          active={
            phase === "typing-question" ||
            phase === "sending" ||
            phase === "thinking"
          }
          label="1. Ask in plain English"
        />
        <Caption
          active={phase === "answering" || phase === "answered"}
          label="2. Get an answer with citations"
        />
        <Caption
          active={phase === "panel-open"}
          label="3. View the source document"
        />
      </div>
    </div>
  );
}

/* ─────────────────────────  Sub-bits  ─────────────────────────── */

function Caret() {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.9, repeat: Infinity }}
      className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-foreground/70"
    />
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
}

function AnswerWithCitation({
  text,
  highlightCitation,
}: {
  text: string;
  highlightCitation: boolean;
}) {
  // Split out the "[1]" token so we can render it as a pill
  const idx = text.indexOf("[1]");
  if (idx === -1) {
    return (
      <span className="whitespace-pre-wrap">
        {text}
        <Caret />
      </span>
    );
  }
  const before = text.slice(0, idx);
  const after = text.slice(idx + 3);
  return (
    <span className="whitespace-pre-wrap">
      {before}
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{
          scale: highlightCitation ? [1, 1.15, 1] : 1,
          opacity: 1,
        }}
        transition={{ duration: highlightCitation ? 0.6 : 0.2 }}
        className="mx-0.5 inline-flex items-center justify-center rounded-md border border-primary/40 bg-primary/15 px-1.5 py-0 align-baseline text-[10px] font-semibold text-primary shadow-[0_0_8px_var(--glow-primary)]"
      >
        1
      </motion.span>
      {after}
      {after.length === 0 && <Caret />}
    </span>
  );
}

function SourceCardMock() {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      className="metallic-card flex w-full flex-col gap-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-left"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium text-foreground">
            [1] {SOURCE.title}
          </span>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground/70">
          {Math.round(SOURCE.similarity * 100)}%
        </span>
      </div>
      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">
        {SOURCE.excerpt}
      </p>
    </motion.div>
  );
}

function PdfSourcePanel() {
  return (
    <>
      {/* Panel chrome */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-semibold text-foreground">
            {SOURCE.title}
          </span>
          <span className="ml-1 shrink-0 rounded bg-red-500/15 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-red-400 ring-1 ring-red-500/30">
            PDF
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button className="rounded-md p-1 text-muted-foreground/70">
            <Download className="h-3.5 w-3.5" />
          </button>
          <button className="rounded-md p-1 text-muted-foreground/70">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Match-percentage strip */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {Math.round(SOURCE.similarity * 100)}% match
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {SOURCE.page}
        </span>
      </div>

      {/* PDF "reader" gutter with paper sheet */}
      <div className="relative flex-1 overflow-hidden bg-neutral-800/60">
        <div className="absolute inset-0 flex items-start justify-center overflow-hidden px-3 py-3 sm:px-4 sm:py-4">
          <PdfPage />
        </div>
        {/* Page-number pill */}
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium text-white/80 backdrop-blur">
            {PDF_PAGE_NUM} / {PDF_PAGE_TOTAL}
          </span>
        </div>
      </div>
    </>
  );
}

function PdfPage() {
  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
      className="relative aspect-[8.5/11] w-full max-w-[460px] overflow-hidden rounded-sm bg-[#fdfcf7] text-[#1a1a1a] shadow-[0_24px_60px_-15px_rgba(0,0,0,0.6),0_4px_12px_rgba(0,0,0,0.25)] ring-1 ring-black/10"
    >
      {/* Letterhead */}
      <div className="border-b-2 border-[#1a1a1a]/80 px-6 pb-2 pt-5 sm:px-8 sm:pt-6">
        <p
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          className="text-center text-[13px] font-bold uppercase tracking-[0.18em] text-[#1a1a1a] sm:text-[14px]"
        >
          {SCHOOL_NAME}
        </p>
        <p
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          className="mt-0.5 text-center text-[8px] italic text-[#1a1a1a]/70 sm:text-[9px]"
        >
          {SCHOOL_TAGLINE}
        </p>
      </div>

      {/* Body */}
      <div
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        className="px-6 pb-6 pt-4 text-[8.5px] leading-[1.55] text-[#1a1a1a] sm:px-8 sm:text-[10px] sm:leading-[1.65]"
      >
        <h2 className="mb-1 text-[12px] font-bold sm:text-[14px]">
          Section 4 — Uniform &amp; Dress Code
        </h2>
        <p className="mb-3 text-[7.5px] uppercase tracking-wider text-[#1a1a1a]/55 sm:text-[8.5px]">
          Lower School · Grades K–4
        </p>

        <h3 className="mt-3 mb-1 font-bold">4.1 General Standards</h3>
        <p className="mb-2">
          The lower-school uniform policy promotes a focused learning
          environment and equitable presentation across all grades. The
          guidelines below apply Monday through Friday throughout the
          academic year, except where noted.
        </p>

        <h3 className="mt-3 mb-1 font-bold">4.2 Acceptable Uniform Items</h3>
        {/* Highlighted passage — corresponds to the citation in the chat */}
        <motion.div
          initial={{ backgroundColor: "rgba(253, 224, 71, 0)" }}
          animate={{
            backgroundColor: [
              "rgba(253, 224, 71, 0)",
              "rgba(253, 224, 71, 0.55)",
              "rgba(253, 224, 71, 0.35)",
            ],
          }}
          transition={{ duration: 1.1, delay: 0.55, ease: "easeOut" }}
          className="-mx-1 my-1 rounded-sm px-1 py-0.5"
        >
          <p>
            Students in grades K–4 wear the standard lower-school uniform.
            Acceptable bottoms include navy or khaki trousers, shorts, or
            skirts. Tops must be a solid white or light-blue collared shirt.
            On designated PE days, students may wear athletic sneakers and
            the official school PE shirt.
          </p>
        </motion.div>

        <h3 className="mt-3 mb-1 font-bold">4.3 Footwear &amp; Outerwear</h3>
        <p className="mb-2">
          Closed-toe shoes with non-marking soles are required at all times.
          School-issued cardigans or fleeces are the only approved outerwear
          inside classroom buildings; hooded sweatshirts are not permitted
          during instructional hours.
        </p>

        <h3 className="mt-3 mb-1 font-bold">4.4 Special Dress Days</h3>
        <p className="mb-2">
          The school designates several special dress days throughout the
          year — including Spirit Fridays, picture day, and field-trip
          attire. Families are notified at least one week in advance via the
          parent portal and weekly bulletin.
        </p>
      </div>

      {/* Page footer */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-[#1a1a1a]/10 px-6 py-1.5 text-[7px] text-[#1a1a1a]/50 sm:px-8 sm:text-[8px]">
        <span>{SCHOOL_NAME}</span>
        <span>— {PDF_PAGE_NUM} —</span>
      </div>
    </motion.div>
  );
}

function Caption({ active, label }: { active: boolean; label: string }) {
  return (
    <div
      className={`rounded-md border px-3 py-2 transition-all duration-300 ${
        active
          ? "border-primary/50 bg-primary/10 text-foreground shadow-[0_0_18px_-4px_var(--glow-primary)]"
          : "border-border/40 bg-transparent text-muted-foreground"
      }`}
    >
      {label}
    </div>
  );
}
