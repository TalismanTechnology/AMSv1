"use client";

import { Logo } from "@/components/logo";

// A slow, seamless ticker of real questions parents ask, directly under the
// hero. Two rows drift in opposite directions; the edges fade into the cream
// so the strip reads as a band the page passes behind. Pure CSS animation
// (keyframes in globals.css), paused under prefers-reduced-motion.

const ROW_A = [
  "When is spring break?",
  "What time does pickup end on early-dismissal days?",
  "Is there a late bus on Wednesdays?",
  "What's the dress code on spirit days?",
  "Are nut products allowed in packed lunches?",
  "When are parent–teacher conferences?",
  "What's the snow day policy?",
];

const ROW_B = [
  "How do I report an absence?",
  "Which forms are due before the field trip?",
  "What are the after-care hours?",
  "When do report cards come out?",
  "Where do I find the lunch menu?",
  "What time does the library close?",
  "Who do I call about a bus change?",
];

function Row({ items, reverse }: { items: string[]; reverse?: boolean }) {
  // Duplicated once so the loop point lands on identical content.
  const loop = [...items, ...items];
  return (
    <div className="flex w-max gap-3" style={{ animation: `lp-marquee ${reverse ? "58s" : "46s"} linear infinite ${reverse ? "reverse" : ""}` }}>
      {loop.map((q, i) => (
        <span
          key={`${q}-${i}`}
          aria-hidden={i >= items.length}
          className="flex shrink-0 items-center gap-2.5 rounded-full border border-brand-dark/12 bg-white px-4 py-2 text-sm text-brand-dark/80 shadow-[var(--lp-shadow-1)]"
        >
          <Logo size={12} className="text-brand-green/70" />
          {q}
        </span>
      ))}
    </div>
  );
}

export function QuestionMarquee() {
  return (
    <section
      aria-label="Questions parents ask"
      className="lp-marquee relative overflow-hidden py-3 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]"
    >
      <div className="space-y-3">
        <Row items={ROW_A} />
        <Row items={ROW_B} reverse />
      </div>
    </section>
  );
}
