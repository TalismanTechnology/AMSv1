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
  SlotMachineHero,
  motion,
  metallicCardEntrance,
} from "@/components/motion";
import { CursorSpotlight } from "@/components/motion/cursor-spotlight";
import { MagneticButton } from "@/components/motion/magnetic-button";
import { Logo } from "@/components/logo";
import { HowItWorksDemo } from "@/components/landing/how-it-works-demo";
import { FloatingOrbs } from "@/components/landing/floating-orbs";
import { AuroraMesh } from "@/components/landing/aurora-mesh";
import {
  IngestionMockup,
  EmbeddingsMockup,
  RetrievalMockup,
  AnswerMockup,
} from "@/components/landing/mockups";

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
    <section className="relative mx-auto max-w-6xl px-6 py-28 sm:py-40">
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
              whileInView={{ opacity: 0.08, x: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] }}
              className="pointer-events-none absolute -top-10 -left-2 select-none text-[7rem] font-bold leading-none tracking-tighter metallic-heading sm:-top-14 sm:text-[10rem]"
            >
              {number}
            </motion.span>
            <div className="relative">
              <div className="inline-flex items-center gap-3">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Step {number}
                </span>
                <span className="h-px w-10 bg-glass-border" />
              </div>
              <h3 className="mt-4 text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl lg:text-5xl">
                {title}
              </h3>
              <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
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
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_var(--glow-primary)]" />
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
              <CursorSpotlight radius={420} intensity={0.10} className="rounded-2xl">
                <div className="metallic-card relative rounded-2xl p-6 backdrop-blur-sm sm:p-8">
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
      <ScrollHeader className="fixed top-0 z-50 w-full">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Logo
              size={32}
              className="text-primary drop-shadow-[0_0_8px_var(--glow-primary)] drop-shadow-[0_0_14px_oklch(1_0_0/40%)]"
            />
            <span className="text-xl font-semibold metallic-text">
              AskMySchool
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button
              asChild
              className="shadow-[0_0_20px_var(--glow-primary),0_0_8px_oklch(1_0_0/30%)]"
            >
              <Link href="/register">Sign up</Link>
            </Button>
          </div>
        </div>
      </ScrollHeader>

      {/* Hero */}
      <section className="relative z-10 flex min-h-[80svh] flex-col items-center justify-center overflow-hidden px-6 text-center">
        <AuroraMesh />
        <FloatingOrbs />
        <div className="relative z-10">
          <div className="inline-block">
            <SlotMachineHero className="text-6xl font-bold metallic-heading neon-text-soft sm:text-7xl lg:text-9xl">
              {"Your Questions\nAnswered Instantly"}
            </SlotMachineHero>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Parents ask questions in plain English. AI finds the answer from
            your school&apos;s official documents — with citations.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <MagneticButton strength={0.35} radius={90}>
              <Button
                size="lg"
                asChild
                className="shadow-[0_0_20px_var(--glow-primary),0_0_8px_oklch(1_0_0/30%)]"
              >
                <Link href="/register">Get started free</Link>
              </Button>
            </MagneticButton>
            <Button variant="ghost" size="lg" asChild>
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </section>


      {/* ═══ Traditional Landing Page ═══ */}
      <div className="relative">

        {/* How It Works — live demo */}
        <section className="mx-auto max-w-5xl px-6 pt-4 pb-24">
          <HowItWorksDemo />
        </section>

        {/* Under the hood — intro */}
        <section className="mx-auto max-w-4xl px-6 pt-24 pb-8 text-center">
          <BlurReveal>
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Under the hood
            </p>
            <h2 className="mt-4 text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl lg:text-5xl">
              Retrieval-augmented generation,
              <br className="hidden sm:block" /> grounded in your documents.
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-muted-foreground">
              Every answer is built from your school&apos;s own source
              material — never invented. Here&apos;s how it works, end to end.
            </p>
          </BlurReveal>
        </section>

        {/* Step 1 — Ingestion */}
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

        {/* Step 2 — Embeddings */}
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

        {/* Step 3 — Retrieval */}
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

        {/* Step 4 — Answer */}
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
        <section className="mx-auto max-w-5xl px-6 py-24">
          <BlurReveal>
            <h2 className="text-center text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl">
              What parents are saying
            </h2>
          </BlurReveal>
          <StaggerChildren className="mt-16 grid gap-8 sm:grid-cols-3">
            {testimonials.map((t, i) => (
              <motion.div key={i} variants={metallicCardEntrance}>
                <CursorSpotlight radius={280} intensity={0.14} className="rounded-xl">
                  <div className="metallic-card rounded-xl p-8">
                    <p className="text-sm leading-relaxed text-muted-foreground italic">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <div className="mt-6 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full metallic-surface border border-glass-border neon-border">
                        <span className="text-sm font-medium metallic-text">
                          {t.initials}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
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
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
          <RevealOnScroll>
            <CursorSpotlight radius={500} intensity={0.12} className="rounded-2xl">
              <div className="metallic-card rounded-2xl p-12">
                <div className="relative z-10">
                  <h2 className="text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl">
                    Ready to get started?
                  </h2>
                  <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                    Sign up today and start getting instant answers from your
                    school&apos;s documents. It&apos;s fast, accurate, and always
                    up to date.
                  </p>
                  <div className="mt-8 flex items-center justify-center gap-4">
                    <MagneticButton strength={0.4} radius={100}>
                      <Button
                        size="lg"
                        asChild
                        className="shadow-[0_0_20px_var(--glow-primary),0_0_8px_oklch(1_0_0/30%)]"
                      >
                        <Link href="/register">Create your account</Link>
                      </Button>
                    </MagneticButton>
                  </div>
                </div>
              </div>
            </CursorSpotlight>
          </RevealOnScroll>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 neon-divider">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo
              size={20}
              className="text-primary drop-shadow-[0_0_6px_oklch(1_0_0/40%)]"
            />
            <span className="text-sm metallic-text">AskMySchool</span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} AskMySchool. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
