"use client";

import Link from "next/link";
import {
  MessageSquare,
  FileText,
  Shield,
  Upload,
  Sparkles,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Waves } from "@/components/ui/waves";
import { DotGrid } from "@/components/ui/dot-grid";
import {
  RevealOnScroll,
  RevealOnScrollDirectional,
  StaggerChildren,
  AnimatedNumber,
  motion,
  fadeInUp,
  metallicCardEntrance,
} from "@/components/motion";
import { IntroOverlay } from "@/components/animated-logo";
import { Logo } from "@/components/logo";

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

const howItWorks = [
  {
    icon: Upload,
    title: "Admin uploads documents",
    description:
      "School administrators upload handbooks, policies, calendars, and other official documents to the platform.",
    neon: "neon-icon-blue",
  },
  {
    icon: Sparkles,
    title: "AI processes & indexes",
    description:
      "Our AI reads, understands, and indexes every document so it can instantly find relevant answers to any question.",
    neon: "neon-icon-amber",
  },
  {
    icon: CheckCircle,
    title: "Parents ask, AI answers",
    description:
      "Parents type questions in plain English and get accurate answers with citations to the exact source documents.",
    neon: "neon-icon-green",
  },
];

export default function LandingPage() {
  return (
    <div className="relative z-[1] min-h-screen bg-background">
      <IntroOverlay />
      <Waves
        lineColor="#5a9fd4"
        backgroundColor="transparent"
        waveSpeedX={0.0125}
        waveSpeedY={0.01}
        waveAmpX={40}
        waveAmpY={20}
        friction={0.9}
        tension={0.01}
        maxCursorMove={120}
        xGap={24}
        yGap={50}
      />
      <DotGrid />

      {/* Header */}
      <header className="fixed top-0 z-50 w-full">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <Logo size={28} className="text-primary drop-shadow-[0_0_8px_var(--glow-primary)] drop-shadow-[0_0_14px_oklch(1_0_0/40%)] sm:hidden" />
            <Logo size={32} className="text-primary drop-shadow-[0_0_8px_var(--glow-primary)] drop-shadow-[0_0_14px_oklch(1_0_0/40%)] hidden sm:block" />
            <span className="text-lg font-semibold metallic-text sm:text-xl">
              AskMySchool
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="sm" asChild className="sm:size-default">
              <Link href="/login">Log in</Link>
            </Button>
            <Button
              size="sm"
              asChild
              className="sm:size-default shadow-[0_0_20px_var(--glow-primary),0_0_8px_oklch(1_0_0/30%)]"
            >
              <Link href="/register">Sign up</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="light-source mx-auto max-w-6xl px-4 pt-24 pb-16 text-center sm:px-6 sm:pt-32 sm:pb-24">
        <div id="hero-logo" className="mb-6 flex justify-center sm:mb-8">
          <Logo size={80} className="text-primary brightness-200 drop-shadow-[0_0_30px_#fff] sm:hidden" />
          <Logo size={140} className="text-primary brightness-200 drop-shadow-[0_0_30px_#fff] hidden sm:block" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl neon-text">
          Get instant answers from{" "}
          <span className="metallic-text-animated">school documents</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:mt-6 sm:text-lg">
          Parents can ask questions in plain English and get AI-powered answers
          sourced directly from your school&apos;s official documents —
          handbooks, policies, calendars, and more.
        </p>
        <RevealOnScroll delay={0.2}>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:mt-10 sm:flex-row sm:gap-4">
            <Button
              size="lg"
              asChild
              className="w-full sm:w-auto shadow-[0_0_20px_var(--glow-primary),0_0_8px_oklch(1_0_0/30%)]"
            >
              <Link href="/register">Get started</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
        </RevealOnScroll>

        {/* Features */}
        <StaggerChildren className="mt-16 grid gap-6 sm:mt-24 sm:gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <motion.div variants={fadeInUp}>
            <div className="metallic-card rounded-xl p-5 text-left backdrop-blur-sm sm:p-8">
              <MessageSquare className="h-10 w-10 neon-icon-blue" />
              <h3 className="mt-4 text-lg font-medium text-foreground">
                Ask anything
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Type your question in natural language. Our AI searches through
                all school documents to find the answer.
              </p>
            </div>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <div className="metallic-card rounded-xl p-5 text-left backdrop-blur-sm sm:p-8">
              <FileText className="h-10 w-10 neon-icon-amber" />
              <h3 className="mt-4 text-lg font-medium text-foreground">
                Source citations
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Every answer includes references to the exact documents and
                sections it came from, so you can verify.
              </p>
            </div>
          </motion.div>
          <motion.div variants={fadeInUp}>
            <div className="metallic-card rounded-xl p-5 text-left backdrop-blur-sm sm:p-8">
              <Shield className="h-10 w-10 neon-icon-green" />
              <h3 className="mt-4 text-lg font-medium text-foreground">
                Admin controlled
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                School admins control which documents are available and approve
                parent access. Always accurate, always official.
              </p>
            </div>
          </motion.div>
        </StaggerChildren>
      </main>

      {/* How It Works */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <RevealOnScroll>
          <h2 className="text-center text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl">
            How it works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
            Three simple steps to get answers from your school&apos;s documents
          </p>
        </RevealOnScroll>

        <div className="mt-16 space-y-16">
          {howItWorks.map((step, i) => (
            <RevealOnScrollDirectional
              key={step.title}
              direction={i % 2 === 0 ? "left" : "right"}
            >
              <div className="flex flex-col items-center gap-6 text-center">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full metallic-surface border border-glass-border neon-border">
                  <step.icon className={`h-7 w-7 ${step.neon}`} />
                </div>
                <div>
                  <span className="text-sm font-medium text-muted-foreground/60">
                    Step {i + 1}
                  </span>
                  <h3 className="mt-1 text-xl font-medium text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-lg text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            </RevealOnScrollDirectional>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border/50 py-12 neon-divider sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <StaggerChildren className="grid grid-cols-2 gap-6 sm:gap-8 lg:grid-cols-4">
            {[
              { label: "Documents Processed", value: 500 },
              { label: "Questions Answered", value: 10000 },
              { label: "Happy Parents", value: 2500 },
              { label: "Schools Served", value: 50 },
            ].map((stat) => (
              <motion.div key={stat.label} variants={fadeInUp}>
                <div className="text-center">
                  <AnimatedNumber
                    value={stat.value}
                    className="text-2xl font-bold metallic-text-animated neon-text sm:text-4xl"
                  />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {stat.label}
                  </p>
                </div>
              </motion.div>
            ))}
          </StaggerChildren>
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <RevealOnScroll>
          <h2 className="text-center text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl">
            What parents are saying
          </h2>
        </RevealOnScroll>
        <StaggerChildren className="mt-10 grid gap-6 sm:mt-16 sm:gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.div key={i} variants={metallicCardEntrance}>
              <div className="metallic-card rounded-xl p-5 sm:p-8">
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
            </motion.div>
          ))}
        </StaggerChildren>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <RevealOnScroll>
          <div className="metallic-card rounded-2xl p-6 sm:p-12">
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
                <Button
                  size="lg"
                  asChild
                  className="shadow-[0_0_20px_var(--glow-primary),0_0_8px_oklch(1_0_0/30%)]"
                >
                  <Link href="/register">Create your account</Link>
                </Button>
              </div>
            </div>
          </div>
        </RevealOnScroll>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 neon-divider">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:px-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo size={20} className="text-primary drop-shadow-[0_0_6px_oklch(1_0_0/40%)]" />
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
