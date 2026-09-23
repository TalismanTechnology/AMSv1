"use client";

import { MessageSquare, Quote } from "lucide-react";
import { RevealOnScroll, ScrollProgressBar } from "@/components/motion";
import { VideoHero } from "@/components/landing/video-hero";
import { QuestionMarquee } from "@/components/landing/question-marquee";
import { DemoStage } from "@/components/landing/demo-stage";
import { ProductDemoMockup } from "@/components/landing/product-demo";
import { AnswerMockup } from "@/components/landing/mockups";
import { AskVisual } from "@/components/landing/showcase-visuals";
import { StackingSteps } from "@/components/landing/stacking-steps";
import { Testimonials } from "@/components/landing/testimonials";
import { SectionBackdrop } from "@/components/landing/section-backdrop";
import { LANDING_IMAGES } from "@/components/landing/landing-images";
import { Faq } from "@/components/landing/faq";
import { ClosingCta } from "@/components/landing/closing-cta";
import { SiteFooter } from "@/components/landing/site-footer";
import {
  Chip,
  FeatureCard,
  Muted,
  SectionHeading,
} from "@/components/landing/showcase-primitives";

// The marketing page, top to bottom:
//
//   VideoHero        full-viewport landscape video, nav, headline
//   QuestionMarquee  ticker of real questions, fading at the edges
//   Demo             the looping product demo on a tilting stage
//   Families         two cards: ask anything / every answer cited
//   StackingSteps    three grounding steps as a deck of sticky cards
//   Testimonials     fanned quote cards over a faint playground
//   FAQ              sticky heading beside the accordion
//   ClosingCta       forest tile with a photo leaning out of it
//   SiteFooter
//
// One beat per job: show it, say what it does for parents, say why schools
// can trust it, prove it, answer the objections, ask for the signup.
//
// `.landing` scopes the depth tokens (globals.css, "LANDING PAGE — DEPTH
// LAYER"): the app shell stays flat; only this page gets real lift.

const SECTION = "mx-auto max-w-6xl px-6 scroll-mt-24";

export function LandingPage() {
  return (
    <div className="landing relative z-[1]">
      <ScrollProgressBar />

      <VideoHero />

      <div className="relative">
        <div className="pt-8 sm:pt-10">
          <QuestionMarquee />
        </div>

        {/* ── Live demo on the stage, over a faint campus scene ── */}
        <section id="demo" className="relative isolate scroll-mt-24 pt-20 sm:pt-28">
          <SectionBackdrop
            image={LANDING_IMAGES.campusTrees}
            opacity={0.42}
            parallax={80}
            position="center top"
            fade="both"
            className="-bottom-40 top-0"
          />
          <div className="mx-auto max-w-6xl px-6">
            <SectionHeading
              align="center"
              eyebrow="The product"
              title={
                <>
                  See it <Muted>in action</Muted>
                </>
              }
              subtitle="The same loop the product runs: a question, a grounded answer, and the source opened to the cited passage."
            />
            <div className="mt-14 sm:mt-20">
              <DemoStage>
                <ProductDemoMockup />
              </DemoStage>
            </div>
          </div>
        </section>

        {/* ── For families ── */}
        <section id="families" className={`${SECTION} pt-28 sm:pt-36`}>
          <SectionHeading
            eyebrow="For families"
            title={
              <>
                How AskMySchool helps <Muted>parents</Muted>
              </>
            }
            subtitle="It's 9pm on a Sunday and the handbook is forty pages. Ask the way you'd ask the front office, and get a plain answer back with the page it came from."
          />
          {/* Explicit grid-cols-1 everywhere: an implicit auto track sizes
              to its items' min-content, and the nowrap rows inside the
              visuals would push it past a phone viewport. */}
          <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 md:grid-cols-2">
            <RevealOnScroll>
              <FeatureCard
                tone="accent"
                title={
                  <>
                    Ask <Chip icon={MessageSquare}>anything</Chip> about your school
                  </>
                }
                description="Pickup times, dress code, bus routes, snow days. If the school wrote it down, you can ask about it, any time of day."
                visual={<AskVisual />}
              />
            </RevealOnScroll>
            <RevealOnScroll delay={0.1}>
              <FeatureCard
                title={
                  <>
                    Every answer is <Chip icon={Quote}>cited</Chip> to its source
                  </>
                }
                description="Each claim links to the exact document and page it came from. If the answer isn't in the documents, it says so instead of guessing."
                visual={<AnswerMockup />}
              />
            </RevealOnScroll>
          </div>
        </section>

        <StackingSteps />
        <Testimonials />

        {/* ── FAQ: heading stays put while the accordion scrolls ── */}
        <section
          id="faq"
          className={`${SECTION} grid grid-cols-1 gap-10 pt-28 sm:pt-36 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16`}
        >
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading
              eyebrow="Questions"
              title={
                <>
                  Frequently asked <Muted>questions</Muted>
                </>
              }
              subtitle="Everything here describes what the product does today, not a roadmap."
            />
          </div>
          <RevealOnScroll>
            <Faq />
          </RevealOnScroll>
        </section>

        <ClosingCta />
      </div>

      <SiteFooter />
    </div>
  );
}
