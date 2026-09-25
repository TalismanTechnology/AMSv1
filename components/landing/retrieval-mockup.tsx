"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, CornerDownLeft, Lock, Search } from "lucide-react";
import { usePhaseCycle } from "@/hooks/use-phase-cycle";
import { useTypedCount } from "@/hooks/use-typed-count";
import { useStepPlayback } from "@/components/landing/step-playback";

// Step 02 visual. A parent types a question and sends it. The row-level
// policy then checks the school's library one document at a time: a light
// sweeps each row and it's stamped with the reason (published, staff only,
// draft). The rows then physically sort — approved documents rise, blocked
// ones sink below a "hidden from parents" rule — and the answer arrives
// citing only an approved source. The loop unwinds in place: the answer
// drops away, the rows slide back, the marks clear, and it starts again.

type Doc = { name: string; approved: boolean; reason: string };

const DOCS: Doc[] = [
  { name: "Family Handbook 2026", approved: true, reason: "published" },
  { name: "Bus Routes & Schedules", approved: true, reason: "published" },
  { name: "Internal Staff Memo", approved: false, reason: "staff only" },
  { name: "Lunch Menu — Spring", approved: true, reason: "published" },
  { name: "Board Minutes (draft)", approved: false, reason: "draft" },
];
const SOURCE_DOC = 0;

const QUERY = "When is the spring concert?";
const ANSWER = "The spring concert is Thursday, May 14 at 6:00 PM in the gym.";
const TYPE_MS = 42;

// reset · type · send · check ×5 · sort · answer · unwind
const PHASES = [500, 1500, 550, 520, 520, 520, 520, 520, 950, 3600, 800] as const;
const TYPE = 1;
const SEND = 2;
const CHECK_START = 3;
const SORT = CHECK_START + DOCS.length;
const ANSWER_PHASE = SORT + 1;
const UNWIND = ANSWER_PHASE + 1;

const ROW_H = 34;
const DIVIDER_H = 26;
const EASE = [0.16, 1, 0.3, 1] as const;

type RowState = "pending" | "checking" | "allowed" | "blocked";

// Resting slot of each document once sorted: approved first, in library
// order, then the blocked ones below the divider.
const SORTED_SLOT = (() => {
  const order = [...DOCS.keys()].sort((a, b) => Number(DOCS[b].approved) - Number(DOCS[a].approved) || a - b);
  return DOCS.map((_, i) => order.indexOf(i));
})();
const ALLOWED_COUNT = DOCS.filter((d) => d.approved).length;

function StatusIcon({ state }: { state: RowState }) {
  return (
    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
      <motion.span
        className="absolute inset-0 rounded-full border border-brand-dark/20"
        initial={false}
        animate={{
          opacity: state === "pending" || state === "checking" ? 1 : 0,
          scale: state === "checking" ? 1.15 : state === "pending" ? 1 : 0.4,
          borderColor: state === "checking" ? "rgba(61,90,62,0.7)" : "rgba(45,58,46,0.2)",
        }}
        transition={{ duration: 0.25 }}
      />
      {/* Checking: a small arc spins inside the ring */}
      {state === "checking" && (
        <motion.span
          className="absolute inset-0 rounded-full border-[1.5px] border-transparent border-t-brand-green"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
        />
      )}
      <motion.span
        className="absolute inset-0 flex items-center justify-center rounded-full bg-success text-white"
        initial={false}
        animate={{ opacity: state === "allowed" ? 1 : 0, scale: state === "allowed" ? 1 : 0.2 }}
        transition={{ type: "spring", stiffness: 520, damping: 20 }}
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
      </motion.span>
      {/* Approval ripple */}
      <motion.span
        className="absolute inset-0 rounded-full border border-success"
        initial={false}
        animate={state === "allowed" ? { scale: [1, 2.4], opacity: [0.7, 0] } : { scale: 1, opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      <motion.span
        className="absolute inset-0 flex items-center justify-center text-destructive"
        initial={false}
        animate={
          state === "blocked"
            ? { opacity: 1, scale: 1, x: [0, -2.5, 2.5, -1.5, 0] }
            : { opacity: 0, scale: 0.5, x: 0 }
        }
        transition={{ duration: 0.4 }}
      >
        <Lock className="h-3.5 w-3.5" strokeWidth={2.25} />
      </motion.span>
    </span>
  );
}

function DocRow({
  doc,
  state,
  slot,
  isSource,
}: {
  doc: Doc;
  state: RowState;
  slot: number;
  isSource: boolean;
}) {
  const isBlocked = state === "blocked";
  const isDecided = state === "allowed" || isBlocked;
  return (
    <motion.div
      className="absolute inset-x-0 top-0 flex items-center gap-2.5 rounded-lg bg-white px-2.5"
      // Approved rows ride over blocked ones when they cross during the sort
      style={{ height: ROW_H, zIndex: doc.approved ? 2 : 1 }}
      initial={false}
      animate={{ y: slot, opacity: isBlocked ? 0.62 : 1 }}
      transition={{ y: { type: "spring", stiffness: 170, damping: 24 }, opacity: { duration: 0.4 } }}
    >
      {/* The policy check: a band of light crosses the row */}
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
        <motion.span
          className="absolute inset-y-0 left-0 w-1/2"
          style={{ background: "linear-gradient(90deg, transparent, rgba(61,90,62,0.14), transparent)" }}
          initial={false}
          animate={state === "checking" ? { x: ["-100%", "220%"] } : { x: "-100%" }}
          transition={state === "checking" ? { duration: 0.5, ease: "easeInOut" } : { duration: 0 }}
        />
      </span>
      {/* The cited source glows once the answer lands */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-lg border border-success/50 bg-success/[0.06]"
        initial={false}
        animate={{ opacity: isSource ? 1 : 0 }}
        transition={{ duration: 0.4 }}
      />

      <StatusIcon state={state} />

      <span className="relative min-w-0 flex-1 truncate text-[13px]">
        <motion.span
          className="text-ink"
          initial={false}
          animate={{ opacity: state === "pending" ? 0.5 : isBlocked ? 0.55 : 1 }}
          transition={{ duration: 0.3 }}
        >
          {doc.name}
        </motion.span>
        {/* Strike line draws across instead of snapping on */}
        <motion.span
          aria-hidden
          className="absolute left-0 top-1/2 h-px w-full origin-left bg-ink/50"
          initial={false}
          animate={{ scaleX: isBlocked ? 1 : 0 }}
          transition={{ duration: 0.35, ease: EASE }}
        />
      </span>

      {/* The policy's reason, stamped on */}
      <motion.span
        className={`relative hidden shrink-0 rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider sm:inline-block ${
          isBlocked ? "bg-destructive/8 text-destructive" : "bg-success/10 text-success"
        }`}
        initial={false}
        animate={isDecided ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 0, scale: 1.4, rotate: -6 }}
        transition={isDecided ? { type: "spring", stiffness: 520, damping: 22 } : { duration: 0.2 }}
      >
        {doc.reason}
      </motion.span>
    </motion.div>
  );
}

function QueryLine({ typed, phase }: { typed: number; phase: number }) {
  const isTyping = phase === TYPE;
  const isSent = phase >= SEND && phase < UNWIND;
  const isWorking = phase >= SEND && phase < SORT;
  return (
    <motion.div
      className="relative flex items-center gap-2 overflow-hidden rounded-xl border bg-brand-light/60 px-3 py-2"
      initial={false}
      animate={{
        borderColor: isSent ? "rgba(61,90,62,0.45)" : "rgba(45,58,46,0.1)",
        boxShadow: phase === SEND ? "0 0 0 4px rgba(61,90,62,0.12)" : "0 0 0 0px rgba(61,90,62,0)",
      }}
      transition={{ duration: 0.35 }}
    >
      <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <motion.span
          className="absolute inset-0 flex items-center justify-center"
          initial={false}
          animate={{ opacity: isWorking ? 0 : 1, scale: isWorking ? 0.5 : 1 }}
        >
          <Search className="h-3.5 w-3.5 text-ink-soft" />
        </motion.span>
        {isWorking && (
          <motion.span
            className="absolute inset-0 rounded-full border-[1.5px] border-brand-green/20 border-t-brand-green"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, rotate: 360 }}
            transition={{ rotate: { duration: 0.7, repeat: Infinity, ease: "linear" }, opacity: { duration: 0.2 } }}
          />
        )}
      </span>
      <p className="relative min-w-0 flex-1 truncate text-[13px] text-ink" aria-label={QUERY}>
        <span aria-hidden>{QUERY.slice(0, typed)}</span>
        <motion.span
          aria-hidden
          className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-ink"
          animate={{ opacity: isTyping || phase === 0 ? [1, 1, 0, 0] : 0 }}
          transition={
            isTyping || phase === 0
              ? { duration: 0.8, repeat: Infinity, times: [0, 0.5, 0.5, 1] }
              : { duration: 0.2 }
          }
        />
      </p>
      {/* Enter key, pressed on send */}
      <motion.span
        className="hidden shrink-0 items-center justify-center rounded-md border border-brand-dark/15 bg-white p-1 text-ink-soft sm:flex"
        initial={false}
        animate={
          phase === SEND
            ? { scale: [1, 0.8, 1], y: [0, 1.5, 0], backgroundColor: ["#fff", "#e8efe8", "#fff"] }
            : { scale: 1, y: 0, opacity: typed > 0 && phase <= SEND ? 1 : 0.35 }
        }
        transition={{ duration: 0.35 }}
      >
        <CornerDownLeft className="h-3 w-3" />
      </motion.span>
      <span className="hidden shrink-0 rounded-full border border-brand-dark/12 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-ink-soft sm:inline-block">
        parent
      </span>
    </motion.div>
  );
}

function HiddenDivider({ isShown }: { isShown: boolean }) {
  const blocked = DOCS.length - ALLOWED_COUNT;
  return (
    <motion.div
      aria-hidden={!isShown}
      className="absolute inset-x-2.5 flex items-center gap-2"
      style={{ top: ALLOWED_COUNT * ROW_H, height: DIVIDER_H }}
      initial={false}
      animate={{ opacity: isShown ? 1 : 0 }}
      transition={{ duration: 0.35, delay: isShown ? 0.35 : 0 }}
    >
      <motion.span
        className="h-px flex-1 origin-left bg-destructive/25"
        initial={false}
        animate={{ scaleX: isShown ? 1 : 0 }}
        transition={{ duration: 0.6, delay: isShown ? 0.35 : 0, ease: EASE }}
      />
      <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-destructive/80">
        <Lock className="h-2.5 w-2.5" /> hidden from parents · {blocked}
      </span>
      <motion.span
        className="h-px flex-1 origin-right bg-destructive/25"
        initial={false}
        animate={{ scaleX: isShown ? 1 : 0 }}
        transition={{ duration: 0.6, delay: isShown ? 0.35 : 0, ease: EASE }}
      />
    </motion.div>
  );
}

function AnswerCard({ isShown }: { isShown: boolean }) {
  const words = ANSWER.split(" ");
  return (
    <div className="relative mt-3 h-[92px] sm:h-[74px]">
      <AnimatePresence>
        {isShown && (
          <motion.div
            className="absolute inset-0 rounded-xl border border-brand-dark/10 bg-brand-light/70 px-3 py-2.5"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.35 } }}
            transition={{ duration: 0.55, ease: EASE }}
          >
            <p className="text-[12.5px] leading-snug text-ink">
              {words.map((w, i) => (
                <motion.span
                  key={i}
                  className="inline-block"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.045, duration: 0.3 }}
                >
                  {w}
                  {" "}
                </motion.span>
              ))}
            </p>
            <motion.div
              className="mt-1.5 flex items-center gap-1.5"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + words.length * 0.045, duration: 0.4, ease: EASE }}
            >
              <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-success">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
                {DOCS[SOURCE_DOC].name} · p.22
              </span>
              <span className="hidden font-mono text-[9px] uppercase tracking-wider text-brand-dark/45 sm:inline">
                approved source
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Resting placeholder so the panel never looks empty between answers */}
      <motion.div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center rounded-xl border border-dashed border-brand-dark/10 font-mono text-[9.5px] uppercase tracking-wider text-ink-soft/50"
        initial={false}
        animate={{ opacity: isShown ? 0 : 1 }}
        transition={{ duration: 0.3 }}
      >
        answers draw only from what&apos;s in scope
      </motion.div>
    </div>
  );
}

function ScopeTally({ states }: { states: RowState[] }) {
  const allowed = states.filter((s) => s === "allowed").length;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="hidden gap-0.5 sm:flex">
        {states.map((s, i) => (
          <motion.span
            key={i}
            className="h-1.5 w-3 rounded-full"
            initial={false}
            animate={{
              backgroundColor:
                s === "allowed"
                  ? "var(--success)"
                  : s === "blocked"
                    ? "rgba(200, 60, 50, 0.35)"
                    : s === "checking"
                      ? "rgba(61, 90, 62, 0.4)"
                      : "rgba(45, 58, 46, 0.1)",
              scaleY: s === "allowed" || s === "blocked" ? [1, 1.8, 1] : 1,
            }}
            transition={{ duration: 0.35 }}
          />
        ))}
      </div>
      <p className="whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-ink-soft">
        <motion.span
          key={allowed}
          className="inline-block tabular-nums text-ink"
          initial={{ y: -6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {allowed}
        </motion.span>
        /{DOCS.length} in scope
      </p>
    </div>
  );
}

/** How much of the query is typed: a live count only while typing. */
function useTypedQuery(phase: number, isPlaying: boolean, reduceMotion: boolean): number {
  const count = useTypedCount(QUERY.length, phase === TYPE && isPlaying, TYPE_MS);
  if (reduceMotion || phase > TYPE) return QUERY.length;
  if (phase < TYPE) return 0;
  return count;
}

export function RetrievalMockup() {
  const { ref, isPlaying, reduceMotion } = useStepPlayback<HTMLDivElement>();
  const cyclePhase = usePhaseCycle(PHASES, isPlaying);
  const phase = reduceMotion ? ANSWER_PHASE : cyclePhase;
  const typed = useTypedQuery(phase, isPlaying, reduceMotion);

  const isSorted = phase >= SORT && phase < UNWIND;
  const states: RowState[] = DOCS.map((d, i) => {
    const checkPhase = CHECK_START + i;
    if (phase === 0 || phase < checkPhase) return "pending";
    if (phase === checkPhase) return "checking";
    return d.approved ? "allowed" : "blocked";
  });

  return (
    <div ref={ref} className="relative p-1">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
          Lincoln Elementary · parent scope
        </p>
        <ScopeTally states={states} />
      </div>
      <QueryLine typed={typed} phase={phase} />

      <div className="relative mt-2" style={{ height: DOCS.length * ROW_H + DIVIDER_H }}>
        <HiddenDivider isShown={isSorted} />
        {DOCS.map((d, i) => {
          const sortedY = SORTED_SLOT[i] * ROW_H + (d.approved ? 0 : DIVIDER_H);
          return (
            <DocRow
              key={d.name}
              doc={d}
              state={states[i]}
              slot={isSorted ? sortedY : i * ROW_H}
              isSource={i === SOURCE_DOC && phase === ANSWER_PHASE}
            />
          );
        })}
      </div>

      <AnswerCard isShown={phase === ANSWER_PHASE} />
    </div>
  );
}
