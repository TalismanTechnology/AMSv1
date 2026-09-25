"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  MotionConfig,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { RetrievalMockup } from "@/components/landing/retrieval-mockup";
import { EmbeddingsMockup } from "@/components/landing/embeddings-mockup";
import { FormatCarousel } from "@/components/landing/format-carousel";
import { StepActiveProvider, usePrefersReducedMotion } from "@/components/landing/step-playback";
import { Muted, SectionHeading } from "@/components/landing/showcase-primitives";
import { SectionBackdrop } from "@/components/landing/section-backdrop";
import { LANDING_IMAGES } from "@/components/landing/landing-images";

// "How it's grounded" as a deck of cards. Each step is a sticky card; as the
// next one scrolls up it lands on top, and the card underneath shrinks, tips
// back, and dims, so by the end the three sit as a visible stack. The
// stacking itself is CSS `position: sticky`; the rest is driven by where the
// cards physically are, measured each scroll frame, so a card only starts
// receding once the next one is actually sliding over it.
//
// The deck also tracks which card is on top and hands that down, so only the
// visible card's visual loops. Each card sets its copy on landing: the
// numeral rolls up, the title rises word by word, the visual tips upright.

type Step = {
  n: string;
  title: string;
  body: string;
  visual: ReactNode;
  tone: "light" | "accent";
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Every format goes in.",
    body: "PDFs, Word, Excel, PowerPoint, scanned handouts, forwarded emails, and calendar feeds. Scans run through a vision model that keeps tables and headings intact.",
    visual: <FormatCarousel />,
    tone: "light",
  },
  {
    n: "02",
    title: "Only your school's approved documents.",
    body: "Row-level security scopes every search to the documents your school has published. Drafts, staff memos, and unpublished files never surface in an answer.",
    visual: <RetrievalMockup />,
    tone: "accent",
  },
  {
    n: "03",
    title: "Meaning, not keywords.",
    body: "Documents are split into overlapping chunks and embedded, so a question phrased nothing like the handbook still lands on the right passage.",
    visual: <EmbeddingsMockup />,
    tone: "light",
  },
];

const STICKY_TOP_REM = 6;
const STACK_OFFSET_REM = 1.75;
const SHRINK_PER_LAYER = 0.045;
const TILT_PER_LAYER_DEG = 3;
/** A card takes over the top of the deck once it has landed this far. */
const TAKEOVER = 0.5;
const MAX_DIM = 0.35;

/**
 * How far each card has landed: 0 while its top edge is still at the bottom
 * of the viewport, 1 once it sits on its sticky line.
 */
type DeckState = { landed: number[] };
const EASE = [0.16, 1, 0.3, 1] as const;

function RisingWords({ text, delay }: { text: string; delay: number }) {
  return text.split(" ").map((word, i) => (
    <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
      <motion.span
        className="inline-block"
        variants={{
          hidden: { y: "105%" },
          shown: { y: 0, transition: { duration: 0.8, delay: delay + i * 0.05, ease: EASE } },
        }}
      >
        {word}
        {" "}
      </motion.span>
    </span>
  ));
}

function StepCounter({ index, count, isAccent }: { index: number; count: number; isAccent: boolean }) {
  const on = isAccent ? "bg-white" : "bg-brand-dark";
  const off = isAccent ? "bg-white/15" : "bg-brand-dark/10";
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className={`relative h-1 w-6 overflow-hidden rounded-full ${off}`}>
            <motion.span
              className={`absolute inset-0 origin-left rounded-full ${on}`}
              variants={{
                hidden: { scaleX: 0 },
                shown: {
                  scaleX: i <= index ? 1 : 0,
                  transition: { duration: 0.6, delay: 0.35 + i * 0.12, ease: EASE },
                },
              }}
            />
          </span>
        ))}
      </div>
      <span className={`font-mono text-[10px] tracking-[0.2em] ${isAccent ? "text-white/45" : "text-brand-dark/40"}`}>
        STEP {index + 1} / {count}
      </span>
    </div>
  );
}

function StackCard({
  step,
  index,
  count,
  deck,
  isOnTop,
  cardRef,
}: {
  step: Step;
  index: number;
  count: number;
  deck: MotionValue<DeckState>;
  isOnTop: boolean;
  cardRef: (el: HTMLElement | null) => void;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const isLast = index === count - 1;
  // Depth = how many cards have landed on top of this one, fractionally.
  // Each layer shrinks it and tips it back toward its place in the stack.
  const depth = useTransform(deck, (d) => d.landed.slice(index + 1).reduce((sum, v) => sum + v, 0));
  const scale = useTransform(depth, (v) => (reduceMotion ? 1 : 1 - v * SHRINK_PER_LAYER));
  const rotateX = useTransform(depth, (v) => (reduceMotion ? 0 : v * TILT_PER_LAYER_DEG));
  const dim = useTransform(depth, (v) => Math.min(1, v) * MAX_DIM);
  // A hairline along the bottom edge fills as the next card approaches, so
  // the reader can feel it coming.
  const hold = useTransform(deck, (d) => d.landed[index + 1] ?? 0);

  const isAccent = step.tone === "accent";
  const surface = isAccent ? "lp-tile-accent text-white" : "lp-tile text-brand-dark";
  const body = isAccent ? "text-white/70" : "text-ink-soft";
  const numeral = isAccent ? "text-white/40" : "text-brand-dark/30";

  return (
    <motion.article
      ref={cardRef}
      style={{
        scale,
        rotateX,
        transformPerspective: 1600,
        top: `calc(${STICKY_TOP_REM}rem + ${index * STACK_OFFSET_REM}rem)`,
        transformOrigin: "50% 0%",
      }}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.35 }}
      className={`sticky mb-8 overflow-hidden rounded-[28px] ${surface}`}
    >
      <div className="grid grid-cols-1 gap-8 p-7 sm:p-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-center md:gap-12 lg:p-14">
        <div>
          <StepCounter index={index} count={count} isAccent={isAccent} />
          <p className={`mt-6 overflow-hidden text-5xl tracking-tight tabular-nums sm:text-6xl ${numeral}`}>
            <motion.span
              className="inline-block"
              variants={{
                hidden: { y: "100%", opacity: 0 },
                shown: { y: 0, opacity: 1, transition: { duration: 0.9, ease: EASE } },
              }}
            >
              {step.n}
            </motion.span>
          </p>
          <h3 className="mt-5 text-2xl leading-snug tracking-tight sm:text-3xl">
            <RisingWords text={step.title} delay={0.12} />
          </h3>
          <motion.p
            className={`mt-4 max-w-md text-[15px] leading-relaxed sm:text-base ${body}`}
            variants={{
              hidden: { opacity: 0, y: 14 },
              shown: { opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.45, ease: EASE } },
            }}
          >
            {step.body}
          </motion.p>
        </div>
        {/* Visual on a white panel regardless of tone: the mockups paint
            their own ink-on-light colors. It tips upright as the card lands. */}
        <motion.div
          className="lp-offscreen-skip rounded-2xl border border-brand-dark/10 bg-white p-4 shadow-[var(--lp-shadow-2)] sm:p-5"
          style={{ transformPerspective: 1200, transformOrigin: "50% 100%" }}
          variants={{
            hidden: { opacity: 0, y: 40, rotateX: 10, scale: 0.97 },
            shown: {
              opacity: 1,
              y: 0,
              rotateX: 0,
              scale: 1,
              transition: { duration: 1, delay: 0.2, ease: EASE },
            },
          }}
        >
          <StepActiveProvider value={isOnTop}>{step.visual}</StepActiveProvider>
        </motion.div>
      </div>
      {!isLast && (
        <motion.div
          aria-hidden
          style={{ scaleX: hold }}
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left ${
            isAccent ? "bg-white/40" : "bg-brand-green/50"
          }`}
        />
      )}
      {/* Dimming veil as the next card covers this one */}
      <motion.div
        aria-hidden
        style={{ opacity: dim }}
        className="pointer-events-none absolute inset-0 bg-brand-dark"
      />
    </motion.article>
  );
}

export function StackingSteps() {
  const cards = useRef<(HTMLElement | null)[]>([]);
  const [topIndex, setTopIndex] = useState(0);
  const deck = useMotionValue<DeckState>({ landed: STEPS.map(() => 0) });

  // Three rect reads per scroll frame: how far each card has landed, and
  // which one is now on top.
  const measure = useCallback(() => {
    // A card starts landing when its top edge meets the bottom of the card
    // below it (untransformed height, so the shrink doesn't feed back), and
    // has landed when it reaches its sticky line.
    const landed = cards.current.map((el, i) => {
      const prev = cards.current[i - 1];
      if (!el || !prev) return 0;
      const stickyTop = parseFloat(getComputedStyle(el).top) || 0;
      const top = el.getBoundingClientRect().top;
      const start = prev.getBoundingClientRect().top + prev.offsetHeight;
      return Math.min(1, Math.max(0, (start - top) / Math.max(1, start - stickyTop)));
    });
    deck.set({ landed });
    const next = landed.reduce((top, v, i) => (i > 0 && v >= TAKEOVER ? i : top), 0);
    setTopIndex((prev) => (prev === next ? prev : next));
  }, [deck]);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", measure);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // reducedMotion="user": the entrances still fade, but skip their movement
  return (
    <MotionConfig reducedMotion="user">
      <section id="grounded" className="relative isolate scroll-mt-24 pt-28 sm:pt-36">
        {/* Faint hallway behind the deck, extending past the section so the
            fade never lands on a card edge */}
        <SectionBackdrop
          image={LANDING_IMAGES.hallwayLockersSoft}
          opacity={0.34}
          parallax={70}
          className="-inset-y-24"
        />
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            align="center"
            eyebrow="For schools"
            title={
              <>
                Grounded <Muted>in every way</Muted>
              </>
            }
            subtitle="Built so parents only ever see approved, official information."
          />
          <div className="relative mt-12 sm:mt-16">
            {STEPS.map((step, i) => (
              <StackCard
                key={step.n}
                step={step}
                index={i}
                count={STEPS.length}
                deck={deck}
                isOnTop={topIndex === i}
                cardRef={(el) => {
                  cards.current[i] = el;
                }}
              />
            ))}
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
