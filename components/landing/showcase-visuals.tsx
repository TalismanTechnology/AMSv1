"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Check, FileText, Megaphone, Send, type LucideIcon } from "lucide-react";
import { usePhaseCycle } from "@/hooks/use-phase-cycle";
import { useTypedCount } from "@/hooks/use-typed-count";
import { useStepPlayback } from "@/components/landing/step-playback";

// The "Ask anything" card's visual, on the forest accent tile. It plays the
// whole exchange, not just the typing, so the promise reads at a glance:
//   1. a question is asked — tapped from a suggestion or typed out,
//   2. it's sent and lifts into the conversation,
//   3. the school's sources are searched (the source chips light in turn),
//   4. a plain answer comes back naming where it came from, and the source
//      it drew on stays lit in the composer.
// Then the conversation clears and the next question comes in. Pauses
// off-screen; reduced motion shows one finished exchange.

type SourceKind = "Handbook" | "Calendar" | "Announcements";

type Ask = {
  question: string;
  /** Index of the suggestion chip it was tapped from, or null if typed. */
  viaChip: number | null;
  answer: string;
  source: SourceKind;
  cite: string;
};

const SUGGESTIONS = ["When is spring break?", "Nut-free lunch rules?", "Snow day policy?"];

const ASKS: Ask[] = [
  {
    question: "Is there a late bus on Wednesdays?",
    viaChip: null,
    answer: "Yes. The late bus leaves the gym lot at 4:45 PM, Monday through Thursday.",
    source: "Handbook",
    cite: "Bus Routes & Schedules · p. 3",
  },
  {
    question: SUGGESTIONS[0],
    viaChip: 0,
    answer: "Spring break runs March 23–27. Classes pick up again Monday, March 30.",
    source: "Calendar",
    cite: "School calendar 2026–27",
  },
  {
    question: "What's the dress code on spirit days?",
    viaChip: null,
    answer: "Spirit wear and jeans are fine on spirit days. Closed-toe shoes are still required.",
    source: "Handbook",
    cite: "Family Handbook · p. 18",
  },
  {
    question: SUGGESTIONS[2],
    viaChip: 2,
    answer: "Closures are posted on the website by 6:00 AM and texted to every family.",
    source: "Announcements",
    cite: "Weather closures · pinned",
  },
];

const SOURCE_KINDS: { kind: SourceKind; icon: LucideIcon }[] = [
  { kind: "Handbook", icon: FileText },
  { kind: "Calendar", icon: CalendarDays },
  { kind: "Announcements", icon: Megaphone },
];

const TYPE_MS = 36;
/** A tapped suggestion fills the box almost at once. */
const CHIP_FILL_MS = 10;

// Each ask: pick · type · send · think · answer · clear
const PICK = 0;
const TYPE = 1;
const SEND = 2;
const THINK = 3;
const ANSWER = 4;
const STAGES = 6;

const PHASES = ASKS.flatMap((a) => {
  const isChip = a.viaChip !== null;
  return [
    isChip ? 900 : 550,
    isChip ? 420 : a.question.length * TYPE_MS + 400,
    520,
    950,
    3600,
    450,
  ];
});
const REDUCED_PHASE = ANSWER;

const EASE = [0.16, 1, 0.3, 1] as const;

function SuggestionChips({ pressed }: { pressed: number | null }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUGGESTIONS.map((s, i) => {
        const isPressed = i === pressed;
        return (
          <motion.span
            key={s}
            className="relative overflow-hidden rounded-full border px-3 py-1.5 text-xs font-medium"
            initial={false}
            animate={
              isPressed
                ? {
                    scale: [1, 0.93, 1.02, 1],
                    backgroundColor: "rgba(255,255,255,0.26)",
                    borderColor: "rgba(255,255,255,0.5)",
                    color: "rgba(255,255,255,1)",
                  }
                : {
                    scale: 1,
                    backgroundColor: "rgba(255,255,255,0.1)",
                    borderColor: "rgba(255,255,255,0.15)",
                    color: "rgba(255,255,255,0.85)",
                  }
            }
            transition={{ duration: isPressed ? 0.45 : 0.3, delay: isPressed ? 0.25 : 0 }}
          >
            {/* Tap ripple */}
            {isPressed && (
              <motion.span
                aria-hidden
                className="absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                initial={{ scale: 0, opacity: 0.45 }}
                animate={{ scale: 4, opacity: 0 }}
                transition={{ duration: 0.6, delay: 0.25, ease: "easeOut" }}
              />
            )}
            <span className="relative">{s}</span>
          </motion.span>
        );
      })}
    </div>
  );
}

function ThinkingBubble() {
  return (
    <motion.div
      className="inline-flex items-center gap-2.5 rounded-2xl rounded-bl-md border border-white/15 bg-white/10 px-3 py-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-white/80"
            animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.14, ease: "easeInOut" }}
          />
        ))}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/60">
        Checking the school&apos;s sources
      </span>
    </motion.div>
  );
}

function AnswerBubble({ ask, reduceMotion }: { ask: Ask; reduceMotion: boolean }) {
  const words = ask.answer.split(" ");
  const Icon = SOURCE_KINDS.find((s) => s.kind === ask.source)?.icon ?? FileText;
  const wordDelay = (i: number) => (reduceMotion ? 0 : 0.15 + i * 0.045);
  return (
    <motion.div
      className="rounded-2xl rounded-bl-md bg-white px-3.5 py-3 shadow-[0_12px_30px_-14px_rgba(0,0,0,0.55)]"
      initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.25 } }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <p className="text-[13px] leading-snug text-brand-dark">
        {words.map((w, i) => (
          <motion.span
            key={i}
            className="inline-block"
            initial={reduceMotion ? false : { opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: wordDelay(i), duration: 0.25 }}
          >
            {w}
            {" "}
          </motion.span>
        ))}
      </p>
      <motion.span
        className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-brand-light px-2 py-1 text-[11px] text-brand-dark/75"
        initial={reduceMotion ? false : { opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: wordDelay(words.length) + 0.1, duration: 0.35, ease: EASE }}
      >
        <Icon className="size-3 shrink-0 text-brand-green" aria-hidden />
        <span className="font-medium text-brand-dark">{ask.source}</span>
        <span className="truncate">· {ask.cite}</span>
      </motion.span>
    </motion.div>
  );
}

function Conversation({ ask, stage, reduceMotion }: { ask: Ask; stage: number; reduceMotion: boolean }) {
  const hasQuestion = stage >= SEND && stage <= ANSWER;
  return (
    <div className="relative h-[168px]">
      {/* Resting hint, so the empty conversation still says what happens */}
      <motion.p
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-white/35"
        initial={false}
        animate={{ opacity: hasQuestion ? 0 : 1 }}
        transition={{ duration: 0.3 }}
      >
        Plain answers, with where they came from
      </motion.p>

      <AnimatePresence>
        {hasQuestion && (
          <motion.div
            key={ask.question}
            className="absolute top-0 right-0 max-w-[85%] rounded-2xl rounded-br-md border border-white/20 bg-white/15 px-3 py-1.5 text-[13px] text-white"
            // Lifts up out of the composer
            initial={reduceMotion ? false : { opacity: 0, y: 150, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.25 } }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            {ask.question}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-x-0 top-11 mr-6">
        <AnimatePresence mode="wait">
          {stage === THINK && <ThinkingBubble key="thinking" />}
          {stage === ANSWER && <AnswerBubble key={ask.question} ask={ask} reduceMotion={reduceMotion} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SourceChip({ kind, icon: Icon, stage, index, isMatch }: {
  kind: SourceKind;
  icon: LucideIcon;
  stage: number;
  index: number;
  isMatch: boolean;
}) {
  const isSearching = stage === THINK;
  const isLit = stage === ANSWER && isMatch;
  const isDimmed = stage === ANSWER && !isMatch;
  return (
    <motion.span
      className="relative inline-flex items-center gap-1 overflow-hidden rounded-md px-2 py-1 text-[11px] font-medium"
      initial={false}
      animate={{
        backgroundColor: isLit ? "#3d5a3e" : "#f5f3ef",
        color: isLit ? "#ffffff" : "rgba(45,58,46,0.6)",
        opacity: isDimmed ? 0.5 : 1,
      }}
      transition={{ duration: 0.35 }}
    >
      {/* Searching: a sheen passes over each source in turn */}
      {isSearching && (
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 w-full"
          style={{ background: "linear-gradient(90deg, transparent, rgba(61,90,62,0.28), transparent)" }}
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: 0.55, delay: index * 0.18, repeat: 1, repeatDelay: 0.1, ease: "easeInOut" }}
        />
      )}
      <span className="relative inline-flex items-center">
        {isLit ? (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 18 }}>
            <Check className="size-3" strokeWidth={3} aria-hidden />
          </motion.span>
        ) : (
          <Icon className="size-3" aria-hidden />
        )}
      </span>
      <span className="relative">{kind}</span>
    </motion.span>
  );
}

function Composer({ ask, stage, typed }: { ask: Ask; stage: number; typed: number }) {
  const text = stage === TYPE ? ask.question.slice(0, typed) : stage === SEND ? ask.question : "";
  const hasText = text.length > 0;
  const isSending = stage === SEND;
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_12px_36px_-14px_rgba(0,0,0,0.45)] sm:p-5">
      <div className="relative min-h-[3.2em] text-[15px] leading-relaxed sm:text-base">
        <motion.p
          className="text-brand-dark"
          initial={false}
          animate={isSending ? { opacity: 0, y: -14 } : { opacity: 1, y: 0 }}
          transition={isSending ? { duration: 0.35, delay: 0.15, ease: EASE } : { duration: 0 }}
        >
          {text}
          {!isSending && (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-[1.05em] w-[1.5px] translate-y-[0.18em] bg-brand-dark/70 motion-safe:animate-pulse"
            />
          )}
        </motion.p>
        {!hasText && (
          <span className="pointer-events-none absolute top-0 left-2 text-brand-dark/35">Ask a question…</span>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_KINDS.map((s, i) => (
            <SourceChip
              key={s.kind}
              kind={s.kind}
              icon={s.icon}
              stage={stage}
              index={i}
              isMatch={s.kind === ask.source}
            />
          ))}
        </div>
        <motion.span
          className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-white"
          initial={false}
          animate={{
            backgroundColor: hasText ? "#2d3a2e" : "rgba(45,58,46,0.25)",
            scale: isSending ? [1, 0.82, 1.06, 1] : 1,
          }}
          transition={{ duration: 0.4 }}
        >
          <motion.span
            className="inline-flex"
            initial={false}
            animate={isSending ? { x: [0, 14, -14, 0], y: [0, -14, 14, 0], opacity: [1, 0, 0, 1] } : { x: 0, y: 0, opacity: 1 }}
            transition={{ duration: 0.5, times: [0, 0.4, 0.41, 1] }}
          >
            <Send className="size-4" aria-hidden="true" />
          </motion.span>
        </motion.span>
      </div>
    </div>
  );
}

/** Oversized composer with suggestion chips — the "ask anything" card. */
export function AskVisual() {
  const { ref, isPlaying, reduceMotion } = useStepPlayback<HTMLDivElement>();
  const cyclePhase = usePhaseCycle(PHASES, isPlaying);
  const phase = reduceMotion ? REDUCED_PHASE : cyclePhase;
  const ask = ASKS[Math.floor(phase / STAGES)];
  const stage = phase % STAGES;

  const isChip = ask.viaChip !== null;
  const count = useTypedCount(ask.question.length, stage === TYPE && isPlaying, isChip ? CHIP_FILL_MS : TYPE_MS);
  const pressed = isChip && (stage === PICK || stage === TYPE) ? ask.viaChip : null;

  return (
    <div ref={ref} className="space-y-3">
      <Conversation ask={ask} stage={stage} reduceMotion={reduceMotion} />
      <SuggestionChips pressed={pressed} />
      <Composer ask={ask} stage={stage} typed={count} />
    </div>
  );
}
