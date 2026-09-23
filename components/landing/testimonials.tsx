"use client";

import { Quote } from "lucide-react";
import { StaggerChildren, motion, metallicCardEntrance } from "@/components/motion";
import { Muted, SectionHeading } from "@/components/landing/showcase-primitives";
import { SectionBackdrop } from "@/components/landing/section-backdrop";
import { LANDING_IMAGES } from "@/components/landing/landing-images";

// Three quotes as a fanned hand of cards: the middle one sits highest, the
// outer two lean in and rest a little lower. Hovering a card levels and
// lifts it. The fan breaks the "three equal boxes" rhythm and reads as
// objects laid on the desk.

const TESTIMONIALS = [
  {
    quote:
      "I found the dress code policy in seconds instead of digging through a 40-page handbook. This is a game changer for busy parents.",
    name: "Sarah M.",
    initials: "SM",
    role: "Parent, Grade 3",
    lean: "md:-rotate-2 md:translate-y-6",
  },
  {
    quote:
      "No more digging through emails and PDFs. I just ask my question and get a clear answer with the exact source document.",
    name: "James K.",
    initials: "JK",
    role: "Parent, Grade 5",
    lean: "md:-translate-y-2",
  },
  {
    quote:
      "The answers are surprisingly accurate and always cite the official school documents. I trust it completely.",
    name: "Emily R.",
    initials: "ER",
    role: "Parent, Grade 1",
    lean: "md:rotate-2 md:translate-y-6",
  },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="relative isolate scroll-mt-24 pt-28 sm:pt-36">
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
        title={
          <>
            Loved by <Muted>families</Muted>
          </>
        }
      />
      <StaggerChildren className="mt-12 grid grid-cols-1 gap-5 sm:mt-16 md:grid-cols-3 md:gap-4 md:px-4">
        {TESTIMONIALS.map((t) => (
          <motion.figure
            key={t.name}
            variants={metallicCardEntrance}
            className={`lp-tile lp-tile-hover relative flex h-full flex-col rounded-[28px] p-7 transition-transform duration-500 hover:!rotate-0 hover:!translate-y-0 sm:p-8 ${t.lean}`}
          >
            <Quote
              aria-hidden="true"
              className="absolute right-6 top-6 size-10 text-brand-dark/8"
              strokeWidth={1.5}
            />
            <blockquote className="text-[15px] leading-relaxed text-ink-soft">
              &ldquo;{t.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-auto flex items-center gap-3 pt-7">
              <span className="flex size-10 items-center justify-center rounded-full bg-brand-light text-sm font-medium text-brand-dark ring-1 ring-brand-dark/10">
                {t.initials}
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{t.name}</span>
                <span className="block text-xs text-muted-foreground">{t.role}</span>
              </span>
            </figcaption>
          </motion.figure>
        ))}
      </StaggerChildren>
      </div>
    </section>
  );
}
