"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import {
  IngestionMockup,
  EmbeddingsMockup,
  RetrievalMockup,
} from "@/components/landing/mockups";
import { Muted, SectionHeading } from "@/components/landing/showcase-primitives";
import { SectionBackdrop } from "@/components/landing/section-backdrop";
import { LANDING_IMAGES } from "@/components/landing/landing-images";

// "How it's grounded" as a deck of cards. Each step is a sticky card; as the
// next one scrolls up it lands on top, and the card underneath shrinks and
// dims a touch, so by the end the three sit as a visible stack. The
// stacking itself is CSS `position: sticky`; the shrink is scroll-driven.

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
    visual: <IngestionMockup />,
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

const STACK_OFFSET_REM = 1.75;
const SHRINK_PER_LAYER = 0.045;

function StackCard({
  step,
  index,
  count,
  progress,
}: {
  step: Step;
  index: number;
  count: number;
  progress: MotionValue<number>;
}) {
  const reduceMotion = useReducedMotion();
  const isLast = index === count - 1;
  // Once card i+1 starts arriving, card i shrinks toward its resting size.
  const from = (index + 1) / count;
  const layersAbove = count - 1 - index;
  const scale = useTransform(
    progress,
    [from, 1],
    [1, isLast || reduceMotion ? 1 : 1 - layersAbove * SHRINK_PER_LAYER]
  );
  const dim = useTransform(progress, [from, 1], [0, isLast ? 0 : 0.35]);

  const isAccent = step.tone === "accent";
  const surface = isAccent ? "lp-tile-accent text-white" : "lp-tile text-brand-dark";
  const body = isAccent ? "text-white/70" : "text-ink-soft";
  const numeral = isAccent ? "text-white/40" : "text-brand-dark/30";

  return (
    <motion.article
      style={{
        scale,
        top: `calc(6rem + ${index * STACK_OFFSET_REM}rem)`,
        transformOrigin: "50% 0%",
      }}
      className={`sticky mb-8 overflow-hidden rounded-[28px] ${surface}`}
    >
      <div className="grid grid-cols-1 gap-8 p-7 sm:p-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-center md:gap-12 lg:p-14">
        <div>
          <p className={`text-5xl tracking-tight tabular-nums sm:text-6xl ${numeral}`}>
            {step.n}
          </p>
          <h3 className="mt-5 text-2xl leading-snug tracking-tight sm:text-3xl">
            {step.title}
          </h3>
          <p className={`mt-4 max-w-md text-[15px] leading-relaxed sm:text-base ${body}`}>
            {step.body}
          </p>
        </div>
        {/* Visual on a white panel regardless of tone: the mockups paint
            their own ink-on-light colors. */}
        <div className="lp-offscreen-skip rounded-2xl border border-brand-dark/10 bg-white p-4 shadow-[var(--lp-shadow-2)] sm:p-5">
          {step.visual}
        </div>
      </div>
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
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 60%", "end 90%"],
  });

  return (
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
      <div ref={ref} className="relative mt-12 sm:mt-16">
        {STEPS.map((step, i) => (
          <StackCard
            key={step.n}
            step={step}
            index={i}
            count={STEPS.length}
            progress={scrollYProgress}
          />
        ))}
      </div>
      </div>
    </section>
  );
}
