"use client";

import { Fragment } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, SearchX, Sparkles } from "lucide-react";
import { usePhaseCycle } from "@/hooks/use-phase-cycle";
import { useStepPlayback } from "@/components/landing/step-playback";

// The "Every answer is cited" card's visual, on a white tile. Two beats,
// one for each half of the card's promise:
//
//   Cited. A parent asks when lunch is served. The answer streams in and
//   each claim gets a numbered citation as it lands. Then each citation is
//   opened in turn: the claim, its citation, and its source row light up
//   together, and the passage it came from opens below with the matching
//   words marked — so "links to the exact page" is shown, not told.
//
//   Not found. A question the documents don't cover gets a plain "I
//   couldn't find that" and a zero-match search result, instead of a guess.
//
// Pauses off-screen; reduced motion shows the first citation opened.

type Claim = { text: string; cite: number };

const CITED = {
  question: "What time is lunch served?",
  claims: [
    { text: "Lunch is served from 11:30 AM to 12:30 PM", cite: 1 },
    { text: "Food from home is welcome as long as it's nut-free", cite: 2 },
  ] satisfies Claim[],
};

type Source = {
  n: number;
  title: string;
  where: string;
  quote: [before: string, match: string, after: string];
};

const SOURCES: Source[] = [
  {
    n: 1,
    title: "Cafeteria Policy",
    where: "§3 Meal times",
    quote: ["Lunch periods run ", "11:30 AM – 12:30 PM", " for all grades, with staggered seating by division."],
  },
  {
    n: 2,
    title: "Family Handbook",
    where: "p. 22",
    quote: ["Meals sent from home are welcome but must be ", "nut-free", ". The cafeteria is a nut-aware space."],
  },
];

const UNCOVERED = {
  question: "Is there a pizza day this Friday?",
  answer: "I couldn't find that in Lincoln Elementary's documents, so I won't guess. The front office can confirm.",
  searched: 38,
};

// Cited: ask · stream · open 1 · open 2 · settle · clear
// Not found: ask · search · answer · clear
const PHASES = [700, 2300, 2100, 2100, 900, 450, 700, 1300, 3200, 450] as const;
const STREAM = 1;
const OPEN_1 = 2;
const OPEN_2 = 3;
const SETTLE = 4;
const ASK_B = 6;
const SEARCH_B = 7;
const ANSWER_B = 8;

const WORD_S = 0.075;
const EASE = [0.16, 1, 0.3, 1] as const;
const HIGHLIGHT = "linear-gradient(rgba(61,90,62,0.16), rgba(61,90,62,0.16))";

// When each claim's citation lands while streaming, in seconds.
const CITE_AT = (() => {
  let words = 0;
  return CITED.claims.map((c) => {
    words += c.text.split(" ").length;
    return 0.15 + words * WORD_S + 0.1;
  });
})();

function QuestionBubble({ text, reduceMotion }: { text: string; reduceMotion: boolean }) {
  return (
    <motion.div
      key={text}
      className="absolute inset-0 flex items-start justify-end gap-2"
      initial={reduceMotion ? false : { opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.25 } }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <span className="rounded-2xl rounded-tr-md border border-brand-dark/15 bg-brand-dark/[0.06] px-3 py-1.5 text-[13px] text-brand-dark">
        {text}
      </span>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-brand-dark/15 bg-white text-[11px] text-brand-dark/70">
        P
      </span>
    </motion.div>
  );
}

function CiteBadge({ n, isOpen, appearAt }: { n: number; isOpen: boolean; appearAt: number | null }) {
  return (
    <motion.span
      className="mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-[5px] border px-1 align-middle font-mono text-[10px] leading-none"
      initial={appearAt === null ? false : { scale: 0, opacity: 0 }}
      animate={{
        scale: isOpen ? 1.12 : 1,
        opacity: 1,
        backgroundColor: isOpen ? "#3d5a3e" : "rgba(61,90,62,0.08)",
        borderColor: isOpen ? "#3d5a3e" : "rgba(61,90,62,0.35)",
        color: isOpen ? "#ffffff" : "#3d5a3e",
      }}
      transition={
        appearAt === null
          ? { duration: 0.3 }
          : {
              scale: { delay: appearAt, type: "spring", stiffness: 600, damping: 15 },
              opacity: { delay: appearAt, duration: 0.1 },
              default: { duration: 0.3 },
            }
      }
    >
      {n}
    </motion.span>
  );
}

function CitedAnswer({ open, isStreaming, reduceMotion }: { open: number | null; isStreaming: boolean; reduceMotion: boolean }) {
  let wordIndex = 0;
  return (
    <p className="text-[13.5px] leading-[1.7] text-brand-dark">
      {CITED.claims.map((claim, ci) => {
        const words = claim.text.split(" ");
        const isOpen = open === claim.cite;
        return (
          <Fragment key={claim.cite}>
            <motion.span
              className="-mx-0.5 rounded-[4px] px-0.5 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
              style={{ backgroundImage: HIGHLIGHT, backgroundRepeat: "no-repeat" }}
              initial={false}
              animate={{ backgroundSize: isOpen ? "100% 100%" : "0% 100%" }}
              transition={{ duration: isOpen ? 0.6 : 0.3, ease: EASE }}
            >
              {words.map((w, wi) => {
                const delay = 0.15 + wordIndex++ * WORD_S;
                return (
                  <Fragment key={wi}>
                    {wi > 0 && " "}
                    <motion.span
                      className="inline-block"
                      initial={reduceMotion || !isStreaming ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay, duration: 0.25 }}
                    >
                      {w}
                    </motion.span>
                  </Fragment>
                );
              })}
            </motion.span>
            <CiteBadge n={claim.cite} isOpen={isOpen} appearAt={reduceMotion || !isStreaming ? null : CITE_AT[ci]} />
            {/* The period lands with its citation, not ahead of the words */}
            <motion.span
              initial={reduceMotion || !isStreaming ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduceMotion || !isStreaming ? 0 : CITE_AT[ci], duration: 0.1 }}
            >
              .
            </motion.span>{" "}
          </Fragment>
        );
      })}
    </p>
  );
}

function SourceRow({ source, open, appearAt }: { source: Source; open: number | null; appearAt: number | null }) {
  const isOpen = open === source.n;
  const isDimmed = open !== null && !isOpen;
  return (
    <motion.div
      className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
      initial={appearAt === null ? false : { opacity: 0, x: -10 }}
      animate={{
        opacity: isDimmed ? 0.45 : 1,
        x: 0,
        backgroundColor: isOpen ? "#ffffff" : "rgba(255,255,255,0.6)",
        borderColor: isOpen ? "rgba(61,90,62,0.55)" : "rgba(45,58,46,0.1)",
        boxShadow: isOpen ? "0 6px 16px -8px rgba(45,58,46,0.35)" : "0 0 0 0 rgba(45,58,46,0)",
      }}
      transition={
        appearAt === null
          ? { duration: 0.35 }
          : { opacity: { delay: appearAt, duration: 0.35 }, x: { delay: appearAt, duration: 0.45, ease: EASE }, default: { duration: 0.35 } }
      }
    >
      <span
        className={`inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] font-mono text-[9.5px] transition-colors duration-300 ${
          isOpen ? "bg-brand-green text-white" : "border border-brand-dark/15 text-brand-dark/60"
        }`}
      >
        {source.n}
      </span>
      <FileText className="size-3.5 shrink-0 text-brand-dark/50" aria-hidden />
      <span className="truncate font-mono text-[11.5px] text-brand-dark">{source.title}</span>
      <span className="shrink-0 font-mono text-[10.5px] text-brand-dark/45">· {source.where}</span>
    </motion.div>
  );
}

/** The cited passage, opened at the exact spot the claim came from. */
function PassagePreview({ open }: { open: number | null }) {
  const source = SOURCES.find((s) => s.n === open);
  return (
    <div className="relative h-[96px] sm:h-[66px]">
      <AnimatePresence mode="wait" initial={false}>
        {source ? (
          <motion.div
            key={source.n}
            className="absolute inset-0 overflow-hidden rounded-lg border-l-2 border-brand-green bg-white px-3 py-2"
            initial={{ opacity: 0, y: 8, clipPath: "inset(0 0 100% 0)" }}
            animate={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.2 } }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            <p className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-brand-green">
              [{source.n}] {source.title} · {source.where}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-brand-dark/75">
              “{source.quote[0]}
              <motion.mark
                className="rounded-[3px] bg-transparent px-0.5 text-brand-dark"
                style={{ backgroundImage: HIGHLIGHT, backgroundRepeat: "no-repeat" }}
                initial={{ backgroundSize: "0% 100%" }}
                animate={{ backgroundSize: "100% 100%" }}
                transition={{ delay: 0.35, duration: 0.5, ease: EASE }}
              >
                {source.quote[1]}
              </motion.mark>
              {source.quote[2]}”
            </p>
          </motion.div>
        ) : (
          <motion.p
            key="hint"
            className="absolute inset-0 flex items-center justify-center rounded-lg border border-dashed border-brand-dark/12 px-3 text-center font-mono text-[9.5px] uppercase tracking-[0.14em] text-brand-dark/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.3 }}
          >
            each number opens the page it came from
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotFound({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand-dark/15 text-center"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ delay: 0.2, duration: 0.45, ease: EASE }}
    >
      <SearchX className="size-4 text-brand-dark/45" aria-hidden />
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand-dark/60">
        Searched {UNCOVERED.searched} documents · 0 matches
      </p>
      <motion.span
        className="rounded-full bg-brand-dark px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white"
        initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.55, type: "spring", stiffness: 500, damping: 18 }}
      >
        says so instead of guessing
      </motion.span>
    </motion.div>
  );
}

function Searching() {
  return (
    <motion.div
      className="flex items-center gap-2 py-1"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
    >
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-brand-green"
            animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.14 }}
          />
        ))}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand-dark/50">
        Searching {UNCOVERED.searched} documents
      </span>
    </motion.div>
  );
}

export function CitedAnswerVisual() {
  const { ref, isPlaying, reduceMotion } = useStepPlayback<HTMLDivElement>();
  const cyclePhase = usePhaseCycle(PHASES, isPlaying);
  const phase = reduceMotion ? OPEN_1 : cyclePhase;

  const isCitedBeat = phase < ASK_B;
  const question = isCitedBeat ? CITED.question : UNCOVERED.question;
  const showQuestion = isCitedBeat ? phase <= SETTLE : phase <= ANSWER_B;
  const showCited = phase >= STREAM && phase <= SETTLE;
  const isStreaming = phase === STREAM;
  const open = phase === OPEN_1 ? 1 : phase === OPEN_2 ? 2 : null;
  const showSearch = phase === SEARCH_B;
  const showUncovered = phase === ANSWER_B;
  const hasCard = showCited || showSearch || showUncovered;

  return (
    <div ref={ref} className="flex flex-col gap-2.5">
      <div className="relative h-8">
        <AnimatePresence>
          {showQuestion && <QuestionBubble key={question} text={question} reduceMotion={reduceMotion} />}
        </AnimatePresence>
      </div>

      {/* The answer */}
      <motion.div
        className="min-h-[106px] rounded-xl border bg-white p-3.5"
        initial={false}
        animate={{
          opacity: hasCard ? 1 : 0.4,
          y: hasCard ? 0 : 6,
          borderColor: showUncovered ? "rgba(45,58,46,0.25)" : "rgba(45,58,46,0.1)",
        }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="flex size-4 items-center justify-center rounded border border-brand-dark/15">
            <Sparkles className="size-2.5 text-brand-green" aria-hidden />
          </span>
          <p className="font-mono text-[10px] uppercase tracking-wider text-brand-dark/55">AskMySchool</p>
        </div>
        <AnimatePresence mode="wait">
          {showCited && (
            <motion.div key="cited" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
              <CitedAnswer open={open} isStreaming={isStreaming} reduceMotion={reduceMotion} />
            </motion.div>
          )}
          {showSearch && <Searching key="search" />}
          {showUncovered && (
            <motion.p
              key="uncovered"
              className="text-[13.5px] leading-[1.7] text-brand-dark"
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              {UNCOVERED.answer}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* The evidence: citations and their passages, or the empty search */}
      <div className="relative h-[178px] sm:h-[146px]">
        <AnimatePresence mode="wait">
          {showCited && (
            <motion.div
              key="sources"
              className="flex h-full flex-col gap-1.5"
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
            >
              {SOURCES.map((s, i) => (
                <SourceRow
                  key={s.n}
                  source={s}
                  open={open}
                  appearAt={reduceMotion || !isStreaming ? null : CITE_AT[i] + 0.1}
                />
              ))}
              <PassagePreview open={open} />
            </motion.div>
          )}
          {showUncovered && (
            <motion.div key="none" className="h-full" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
              <NotFound reduceMotion={reduceMotion} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
