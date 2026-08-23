"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  RevealOnScroll,
  RevealOnScrollDirectional,
  StaggerChildren,
  ScrollProgressBar,
  ScrollHeader,
  BlurReveal,
  motion,
  metallicCardEntrance,
} from "@/components/motion";
import { CursorSpotlight } from "@/components/motion/cursor-spotlight";
import { MagneticButton } from "@/components/motion/magnetic-button";
import { Logo } from "@/components/logo";
import { EditorialHero } from "@/components/landing/editorial-hero";
import {
  IngestionMockup,
  EmbeddingsMockup,
  RetrievalMockup,
  AnswerMockup,
} from "@/components/landing/mockups";

const navLinks = [
  { label: "Under the hood", href: "#under-the-hood" },
  { label: "Families", href: "#testimonials" },
];

const testimonials = [
  {
    quote:
      "I found the school dress code policy in seconds instead of digging through a 40-page handbook. This is a game changer for busy parents.",
    name: "Sarah M.",
    initials: "SM",
    role: "Parent, Grade 3",
  },
  {
    quote:
      "No more digging through emails and PDFs. I just ask my question and get a clear answer with the exact source document.",
    name: "James K.",
    initials: "JK",
    role: "Parent, Grade 5",
  },
  {
    quote:
      "The AI answers are surprisingly accurate and always cite the official school documents. I trust it completely.",
    name: "Emily R.",
    initials: "ER",
    role: "Parent, Grade 1",
  },
];

function Step({
  number,
  title,
  description,
  highlights,
  mockup,
  mockupSide,
}: {
  number: string;
  title: string;
  description: string;
  highlights: string[];
  mockup: React.ReactNode;
  mockupSide: "left" | "right";
}) {
  const textFirst = mockupSide === "right";
  const textDirection = textFirst ? "left" : "right";
  const mockupDirection = textFirst ? "right" : "left";
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="grid gap-12 md:grid-cols-2 md:items-start md:gap-16">
        {/* Copy column */}
        <RevealOnScrollDirectional
          direction={textDirection}
          className={textFirst ? "md:order-1" : "md:order-2"}
        >
          <div className="relative">
            <motion.span
              aria-hidden
              initial={{ opacity: 0, x: textFirst ? -120 : 120, scale: 0.7 }}
              whileInView={{ opacity: 0.1, x: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] }}
              className="pointer-events-none absolute -top-10 -left-2 select-none font-serif-display text-[7rem] font-semibold leading-none tracking-tighter text-primary/25 sm:-top-14 sm:text-[10rem]"
            >
              {number}
            </motion.span>
            <div className="relative">
              <div className="inline-flex items-center gap-3">
                <span className="eyebrow">Step {number}</span>
                <span className="h-px w-10 bg-border" />
              </div>
              <h3 className="mt-4 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink sm:text-4xl lg:text-5xl">
                {title}
              </h3>
              <p className="mt-6 max-w-md text-base leading-relaxed text-ink-soft">
                {description}
              </p>
              <motion.ul
                className="mt-6 space-y-2"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.25 } },
                }}
              >
                {highlights.map((h) => (
                  <motion.li
                    key={h}
                    variants={{
                      hidden: { opacity: 0, x: -16 },
                      visible: {
                        opacity: 1,
                        x: 0,
                        transition: { duration: 0.4, ease: [0, 0, 0.2, 1] },
                      },
                    }}
                    className="flex items-start gap-2.5 text-sm text-foreground/85"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{h}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          </div>
        </RevealOnScrollDirectional>

        {/* Mockup column — pinned while text scrolls */}
        <div
          className={`md:sticky md:top-28 md:self-start ${
            textFirst ? "md:order-2" : "md:order-1"
          }`}
        >
          <RevealOnScrollDirectional direction={mockupDirection}>
            <motion.div
              variants={metallicCardEntrance}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
            >
              <CursorSpotlight radius={420} intensity={0.06} className="rounded-2xl">
                <div className="metallic-card relative rounded-2xl p-6 sm:p-8">
                  {mockup}
                </div>
              </CursorSpotlight>
            </motion.div>
          </RevealOnScrollDirectional>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="relative z-[1]">
      <ScrollProgressBar />

      {/* Header */}
      <ScrollHeader className="fixed top-0 z-50 w-full px-2 sm:px-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 bg-background/80 px-3 py-4 backdrop-blur-md sm:gap-6 sm:px-6">
          {/* Below 375px the wordmark cannot fit beside both buttons without
              shrinking the tap targets, so the mark stands alone there. Above
              it, min-w-0 + truncate keep the text yielding first if a font
              renders wider than expected — never the buttons. */}
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <Logo size={26} className="shrink-0 text-primary" />
            <span className="hidden truncate text-base font-semibold tracking-[-0.01em] text-ink min-[375px]:block sm:text-lg">
              AskMySchool
            </span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-ink-soft transition-colors hover:text-ink"
              >
                {l.label}
              </a>
            ))}
          </nav>
          {/* Sign in stays visible at every width — hiding it below `sm` left
              returning parents with no way into the app from a phone. */}
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <Button variant="ghost" asChild className="px-2 sm:px-4">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="px-2.5 sm:px-4">
              <Link href="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </ScrollHeader>

      {/* Hero */}
      <div className="pt-20">
        <EditorialHero />
      </div>

      {/* ═══ Editorial sections ═══ */}
      <div className="relative">
        {/* Under the hood — intro */}
        <section
          id="under-the-hood"
          className="mx-auto max-w-4xl px-6 pt-24 pb-8 text-center scroll-mt-24"
        >
          <BlurReveal>
            <p className="eyebrow">Under the hood</p>
            <h2 className="mt-4 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink sm:text-4xl lg:text-5xl">
              Retrieval-augmented generation,
              <br className="hidden sm:block" /> grounded in your documents.
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-ink-soft">
              Every answer is built from your school&apos;s own source
              material — never invented. Here&apos;s how it works, end to end.
            </p>
          </BlurReveal>
        </section>

        <Step
          number="01"
          title="Multi-format ingestion"
          description="PDFs, Word, Excel, and PowerPoint flow through our ingestion pipeline. Scanned PDFs and image-based handouts are routed through our in-house vision model, which extracts text while preserving tables, headings, and structure."
          highlights={[
            "PDF · DOCX · XLSX · PPTX · images",
            "Vision-model OCR for scanned files",
            "Tables and structure preserved",
          ]}
          mockup={<IngestionMockup />}
          mockupSide="right"
        />

        <Step
          number="02"
          title="Semantic embeddings"
          description="Each document is split into overlapping chunks and embedded with our proprietary 768-dimensional embedding model. Vectors are stored in Postgres via pgvector for fast similarity search at query time."
          highlights={[
            "768-dimensional embedding model",
            "Overlapping chunks preserve context",
            "pgvector for millisecond similarity search",
          ]}
          mockup={<EmbeddingsMockup />}
          mockupSide="left"
        />

        <Step
          number="03"
          title="Row-level secure retrieval"
          description="Row-level security guarantees parents only retrieve chunks from documents their school has approved. Each question is embedded on the fly and matched against the corpus by vector similarity."
          highlights={[
            "Per-school document scoping",
            "Drafts and internal memos stay private",
            "Vector similarity ranks the best matches",
          ]}
          mockup={<RetrievalMockup />}
          mockupSide="right"
        />

        <Step
          number="04"
          title="Grounded answers with citations"
          description="The top-ranked chunks are passed as context to our answer model, which composes a response with inline citations linking back to the exact source document and section — so every claim is verifiable."
          highlights={[
            "Inline citations on every claim",
            "Click through to the exact passage",
            "If we don't know, we say so",
          ]}
          mockup={<AnswerMockup />}
          mockupSide="left"
        />

        {/* Testimonials */}
        <section id="testimonials" className="mx-auto max-w-5xl px-6 py-24 scroll-mt-24">
          <BlurReveal>
            <p className="eyebrow text-center">Loved by families</p>
            <h2 className="mt-4 text-center font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink sm:text-4xl">
              What parents are saying
            </h2>
          </BlurReveal>
          <StaggerChildren className="mt-14 grid gap-8 sm:grid-cols-3">
            {testimonials.map((t, i) => (
              <motion.div key={i} variants={metallicCardEntrance}>
                <CursorSpotlight radius={280} intensity={0.06} className="rounded-xl">
                  <div className="metallic-card h-full rounded-xl p-8">
                    <p className="text-sm leading-relaxed text-ink-soft italic">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <div className="mt-6 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <span className="text-sm font-semibold text-primary">
                          {t.initials}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {t.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{t.role}</p>
                      </div>
                    </div>
                  </div>
                </CursorSpotlight>
              </motion.div>
            ))}
          </StaggerChildren>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-4xl px-6 pb-28 pt-8 text-center">
          <RevealOnScroll>
            <div className="metallic-card relative overflow-hidden rounded-3xl p-12 sm:p-16">
              <div
                className="depth-glow left-1/2 top-0 h-64 w-64 -translate-x-1/2"
                style={{ background: "oklch(0.635 0.148 47 / 14%)" }}
              />
              <div className="relative z-10">
                <p className="eyebrow">Get started</p>
                <h2 className="mt-4 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink sm:text-4xl">
                  Ready to get answers you can{" "}
                  <span className="italic text-primary">trust</span>?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-ink-soft">
                  Sign up today and start getting instant answers from your
                  school&apos;s documents. Fast, accurate, and always up to date.
                </p>
                <div className="mt-8 flex items-center justify-center gap-4">
                  <MagneticButton strength={0.4} radius={100}>
                    <Button size="lg" asChild className="h-12 px-6 text-base">
                      <Link href="/register">Create your account</Link>
                    </Button>
                  </MagneticButton>
                </div>
              </div>
            </div>
          </RevealOnScroll>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo size={20} className="text-primary" />
            <span className="font-serif-display text-sm font-semibold text-ink">
              AskMySchool
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} AskMySchool. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
