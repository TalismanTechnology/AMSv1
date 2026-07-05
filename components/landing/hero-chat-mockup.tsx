"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  AnimatePresence,
  useInView,
  useReducedMotion,
} from "framer-motion";
import {
  FileText,
  Plus,
  Send,
  MessageSquare,
  Bookmark,
  Files,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Logo } from "@/components/logo";

const QUESTION = "What is the dress code on Fridays?";

/**
 * The assistant answer, authored as segments so numbered citations render
 * inline — exactly how the real product embeds `[1]` / `[2]` badges into prose.
 */
const ANSWER: Array<{ t: string } | { cite: number }> = [
  {
    t: "On Fridays, students may wear spirit wear or jeans with a Collegiate-branded top",
  },
  { cite: 1 },
  {
    t: ". All clothing must be clean, in good condition, and appropriate for the school day",
  },
  { cite: 2 },
  { t: "." },
];

/**
 * Flatten the answer into render tokens so it can reveal word by word.
 * Whitespace is preserved as its own token to keep inline spacing exact, and
 * citations stay in place as badge tokens (they pop in their own phase).
 */
type AnswerToken =
  | { kind: "word"; text: string }
  | { kind: "space"; text: string }
  | { kind: "cite"; n: number };

const ANSWER_TOKENS: AnswerToken[] = ANSWER.flatMap((seg): AnswerToken[] =>
  "t" in seg
    ? seg.t
        .split(/(\s+)/)
        .filter(Boolean)
        .map((chunk) =>
          /^\s+$/.test(chunk)
            ? { kind: "space" as const, text: chunk }
            : { kind: "word" as const, text: chunk }
        )
    : [{ kind: "cite" as const, n: seg.cite }]
);

const wordVariants = {
  hidden: { opacity: 0, y: 6, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.45, ease: "easeOut" },
  },
} as const;

/* The source that citation [1] opens. Mirrors the source panel: title, page,
   similarity, and the cited passage highlighted inside the surrounding text. */
const SOURCE_DOC = {
  title: "Middle & Upper School Handbook",
  file: "MS-US-Handbook.pdf",
  page: "p. 24",
  pageNum: 24,
  totalPages: 60,
  match: 94,
  runningHead: "Student & Family Handbook",
  heading: "3.2 · Dress Code",
  before:
    "Students are expected to dress in a manner that reflects respect for the school community. ",
  highlight:
    "On Fridays, students may wear spirit wear or jeans paired with a Collegiate-branded top.",
  after:
    " All clothing must be clean, in good condition, and appropriate for the school day.",
};

/* ── Loop timeline (cumulative ms) ── */
const T = {
  questionIn: 1600,
  thinking: 2300,
  answerIn: 800,
  answerReveal: 6000,
  citations: 1300,
  documentIn: 1900,
  hold: 7500,
  reset: 1100,
};

type Phase =
  | "idle"
  | "question"
  | "thinking"
  | "answer"
  | "citations"
  | "document"
  | "hold";

/**
 * The floating product preview that anchors the hero. A self-contained looping
 * demo: the question slides in, the assistant "thinks", the answer reveals with
 * a typewriter clip and inline citation badges that pop in place, then the cited
 * source document opens in a side panel with the referenced passage highlighted
 * — the same grounding loop the real product runs. Pure UI, no API calls.
 */
export function HeroChatMockup() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { margin: "-10% 0px" });
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("idle");
  const [loopKey, setLoopKey] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      setPhase("document");
      return;
    }
    if (!isInView) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, fn: () => void) => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(id);
    };

    setPhase("idle");
    after(T.questionIn, () => {
      setPhase("question");
      after(T.thinking, () => {
        setPhase("thinking");
        after(T.answerIn, () => {
          setPhase("answer");
          after(T.answerReveal, () => {
            setPhase("citations");
            after(T.citations, () => {
              setPhase("document");
              after(T.documentIn + T.hold, () => {
                setPhase("hold");
                after(T.reset, () => setLoopKey((k) => k + 1));
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
  }, [isInView, loopKey, reduceMotion]);

  const showQuestion = phase !== "idle";
  const showThinking = phase === "thinking";
  const showAnswer =
    phase === "answer" ||
    phase === "citations" ||
    phase === "document" ||
    phase === "hold";
  const showDocument = phase === "document" || phase === "hold";

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-[var(--radius)] border border-border bg-card"
    >
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b border-border/70 bg-secondary/60 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#e5533b]" />
          <span className="size-3 rounded-full bg-[#e8a53d]" />
          <span className="size-3 rounded-full bg-[#5aaf6f]" />
        </div>
        <div className="flex items-center gap-1.5">
          <Logo size={16} className="text-primary" />
          <span className="font-serif-display text-sm font-semibold text-ink">
            AskMySchool
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Plus className="size-3.5" /> New chat
          </span>
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/12 text-[0.65rem] font-semibold text-primary">
            MP
          </span>
        </div>
      </div>

      <div className="flex">
        {/* Mini sidebar */}
        <div className="hidden w-32 shrink-0 flex-col gap-1 border-r border-border/70 bg-secondary/30 p-3 sm:flex">
          {[
            { icon: MessageSquare, label: "Chat", active: true },
            { icon: Files, label: "Sources" },
            { icon: Bookmark, label: "Saved" },
          ].map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                active
                  ? "bg-primary/12 font-medium text-ink"
                  : "text-muted-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </div>
          ))}
        </div>

        {/* Thread */}
        <div className="flex min-h-[420px] min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
          <div className="flex-1 space-y-4">
            {/* User bubble */}
            <AnimatePresence mode="popLayout">
              {showQuestion && (
                <motion.div
                  key={`q-${loopKey}`}
                  layout
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="flex justify-end"
                >
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-secondary px-3.5 py-2 text-sm text-ink shadow-[var(--elev-1)]">
                    {QUESTION}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Assistant */}
            <AnimatePresence mode="popLayout">
              {(showThinking || showAnswer) && (
                <motion.div
                  key={`a-${loopKey}`}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="flex gap-2.5"
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12">
                    <Logo size={16} className="text-primary" />
                  </span>

                  {showThinking ? (
                    <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 shadow-[var(--elev-2)]">
                      <ThinkingDots />
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-border bg-card p-3.5 shadow-[var(--elev-2)]">
                      <motion.p
                        initial={reduceMotion ? "visible" : "hidden"}
                        animate="visible"
                        transition={{
                          staggerChildren: reduceMotion ? 0 : 0.16,
                        }}
                        className="text-sm leading-relaxed text-ink-soft"
                      >
                        {ANSWER_TOKENS.map((token, i) => {
                          if (token.kind === "cite") {
                            return (
                              <CitationBadge
                                key={i}
                                n={token.n}
                                active={token.n === 1 && showDocument}
                                reduceMotion={!!reduceMotion}
                              />
                            );
                          }
                          if (token.kind === "space") {
                            return <span key={i}>{token.text}</span>;
                          }
                          return (
                            <motion.span
                              key={i}
                              variants={wordVariants}
                              className="inline-block"
                            >
                              {token.text}
                            </motion.span>
                          );
                        })}
                      </motion.p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Composer */}
          <div className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 shadow-[var(--elev-1)]">
            <span className="flex-1 truncate text-sm text-muted-foreground">
              Ask another question…
            </span>
            <motion.span
              animate={
                phase === "question"
                  ? { scale: [1, 0.9, 1.06, 1] }
                  : { scale: 1 }
              }
              transition={{ duration: 0.45 }}
              className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <Send className="size-3.5" />
            </motion.span>
          </div>
        </div>

        {/* Source document panel — opens when a citation is followed, showing
            the cited passage highlighted in its source. */}
        <AnimatePresence>
          {showDocument && (
            <motion.div
              key={`doc-${loopKey}`}
              initial={
                reduceMotion
                  ? { width: "auto", opacity: 1 }
                  : { width: 0, opacity: 0 }
              }
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="hidden shrink-0 overflow-hidden border-l border-border bg-background sm:block"
            >
              <SourceDocPanel reduceMotion={!!reduceMotion} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Inline numbered citation, embedded in the answer prose. Reveals inline as
 *  part of the answer's word-by-word stagger — as if it were another token of
 *  text — then takes an "active" ring once its source document is opened. */
function CitationBadge({
  n,
  active,
  reduceMotion,
}: {
  n: number;
  active: boolean;
  reduceMotion: boolean;
}) {
  return (
    <motion.span
      variants={{
        hidden: { opacity: 0, scale: 0 },
        visible: {
          opacity: 1,
          scale: reduceMotion ? 1 : [0, 1.3, 1],
          transition: { duration: 0.45, times: [0, 0.6, 1], ease: "easeOut" },
        },
      }}
      className={`mx-0.5 inline-flex h-[1.15em] min-w-[1.15em] items-center justify-center rounded-[0.3em] border px-[0.28em] align-[0.1em] text-[0.7em] font-semibold leading-none transition-colors ${
        active
          ? "border-primary/50 bg-primary/15 text-primary ring-2 ring-primary/30"
          : "border-primary/25 bg-primary/8 text-primary"
      }`}
    >
      {n}
    </motion.span>
  );
}

/** The opened source document, mirroring the product's source panel: header,
 *  similarity chip, and the body with the cited passage highlighted. */
/** A greeked line of body text — a thin bar standing in for a line of prose,
 *  so the cited passage reads as one paragraph on a full page of a document. */
function GreekLine({ width }: { width: string }) {
  return (
    <span
      className="block h-[0.32rem] rounded-full bg-ink/[0.07]"
      style={{ width }}
    />
  );
}

function SourceDocPanel({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="flex h-full w-[256px] flex-col bg-[oklch(0.32_0.02_260)]">
      {/* Viewer toolbar — dark PDF-app chrome */}
      <div className="flex items-center justify-between gap-2 border-b border-black/20 bg-[oklch(0.28_0.02_260)] px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex size-4 items-center justify-center rounded-[3px] bg-[#d0402f]">
            <FileText className="size-2.5 text-white" />
          </span>
          <span className="truncate text-[0.68rem] font-medium text-white/90">
            {SOURCE_DOC.file}
          </span>
        </div>
        <X className="size-3.5 shrink-0 text-white/50" />
      </div>

      {/* Page-nav strip */}
      <div className="flex items-center justify-between gap-2 border-b border-black/20 bg-[oklch(0.25_0.02_260)] px-2.5 py-1">
        <div className="flex items-center gap-1 text-white/60">
          <ChevronUp className="size-3" />
          <span className="rounded-[3px] bg-black/25 px-1.5 py-0.5 text-[0.6rem] font-medium tabular-nums text-white/85">
            {SOURCE_DOC.pageNum}
          </span>
          <span className="text-[0.6rem] tabular-nums">/ {SOURCE_DOC.totalPages}</span>
          <ChevronDown className="size-3" />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#5aaf6f]/15 px-1.5 py-0.5 text-[0.58rem] font-medium text-[#7ac48c]">
          <span className="size-1.5 rounded-full bg-[#5aaf6f]" />
          {SOURCE_DOC.match}% match
        </span>
      </div>

      {/* Viewer canvas — the paper sheet floats on the dark backdrop */}
      <div className="flex-1 overflow-hidden px-3 py-3">
        <div className="relative mx-auto h-full">
          {/* stacked page behind, for depth */}
          <div className="absolute inset-x-2 -bottom-1 top-1.5 rounded-[2px] bg-black/25" />

          {/* the page */}
          <div className="relative flex h-full flex-col rounded-[2px] bg-[oklch(0.99_0.004_90)] shadow-[0_6px_20px_-4px_oklch(0_0_0/0.45)] ring-1 ring-black/10">
            {/* running head */}
            <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 pt-3 pb-1.5">
              <span className="truncate text-[0.5rem] font-medium uppercase tracking-[0.14em] text-ink/35">
                {SOURCE_DOC.runningHead}
              </span>
              <span className="text-[0.5rem] tabular-nums text-ink/35">
                {SOURCE_DOC.pageNum}
              </span>
            </div>

            {/* page content with generous document margins */}
            <div className="flex-1 overflow-hidden px-4 pt-3 pb-2">
              {/* a couple lines of prior text, greeked */}
              <div className="mb-3 space-y-1.5">
                <GreekLine width="100%" />
                <GreekLine width="92%" />
                <GreekLine width="70%" />
              </div>

              <p className="mb-1.5 font-serif-display text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-ink/70">
                {SOURCE_DOC.heading}
              </p>
              <p className="text-justify text-[0.72rem] leading-[1.6] text-ink/80 [hyphens:auto]">
                {SOURCE_DOC.before}
                <motion.mark
                  initial={
                    reduceMotion
                      ? false
                      : { backgroundColor: "oklch(0.635 0.148 47 / 0)" }
                  }
                  animate={{ backgroundColor: "oklch(0.635 0.148 47 / 0.24)" }}
                  transition={{ duration: 0.6, delay: 0.5 }}
                  className="rounded-[1px] text-ink"
                >
                  {SOURCE_DOC.highlight}
                </motion.mark>
                {SOURCE_DOC.after}
              </p>

              {/* trailing text, greeked */}
              <div className="mt-3 space-y-1.5">
                <GreekLine width="96%" />
                <GreekLine width="88%" />
              </div>
            </div>

            {/* page footer — folio line */}
            <div className="mt-auto px-4 pb-3 pt-1 text-center">
              <span className="font-serif-display text-[0.55rem] tabular-nums text-ink/40">
                — {SOURCE_DOC.pageNum} —
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground/70"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}
