"use client";

import { StaggerChildren, motion, metallicCardEntrance } from "@/components/motion";
import { Muted, SectionHeading } from "@/components/landing/showcase-primitives";
import { SectionBackdrop } from "@/components/landing/section-backdrop";
import { LANDING_IMAGES } from "@/components/landing/landing-images";

// How a parent actually gets in and uses it, as three cards in the fanned
// layout the page has used here: the middle one sits highest, the outer two
// lean in and rest a little lower; hovering a card levels and lifts it.
// Every line describes the product as it works today (Blackbaud sign-in,
// cited answers), not a promise or a quote.

const STEPS = [
  {
    n: "01",
    title: "Choose your school",
    body: "Pick your school and sign in with the same Blackbaud login you already use for its parent portal. There's no separate account to create.",
    lean: "md:-rotate-2 md:translate-y-6",
  },
  {
    n: "02",
    title: "Ask in plain words",
    body: "Type the question the way you'd ask the front office: pickup times, dress code, the next early dismissal. Answers come from your school's own documents, calendar, and announcements.",
    lean: "md:-translate-y-2",
  },
  {
    n: "03",
    title: "Check the source",
    body: "Every answer links to the document and page it came from. If your school hasn't written it down, the assistant says so and points you to the office.",
    lean: "md:rotate-2 md:translate-y-6",
  },
];

export function ParentSteps() {
  return (
    <section id="parents" className="relative isolate scroll-mt-24 pt-28 sm:pt-36">
      <SectionBackdrop
        image={LANDING_IMAGES.playgroundSoft}
        opacity={0.4}
        parallax={50}
        position="center 60%"
        className="-bottom-16"
      />
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          align="center"
          eyebrow="For parents"
          title={
            <>
              How parents <Muted>get started</Muted>
            </>
          }
        />
        <StaggerChildren className="mt-12 grid grid-cols-1 gap-5 sm:mt-16 md:grid-cols-3 md:gap-4 md:px-4">
          {STEPS.map((step) => (
            <motion.div
              key={step.n}
              variants={metallicCardEntrance}
              className={`lp-tile lp-tile-hover relative flex h-full flex-col rounded-[28px] p-7 transition-transform duration-500 hover:!rotate-0 hover:!translate-y-0 sm:p-8 ${step.lean}`}
            >
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-full bg-brand-light text-sm font-medium text-brand-dark ring-1 ring-brand-dark/10"
              >
                {step.n}
              </span>
              <h3 className="mt-6 text-lg font-semibold text-ink">{step.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                {step.body}
              </p>
            </motion.div>
          ))}
        </StaggerChildren>
      </div>
    </section>
  );
}
