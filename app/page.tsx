"use client";

import Link from "next/link";
import {
  MessageSquare,
  FileText,
  Shield,
  Upload,
  Sparkles,
  CheckCircle,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  RevealOnScroll,
  RevealOnScrollDirectional,
  StaggerChildren,
  AnimatedNumber,
  ScrollProgressBar,
  ScrollHeader,
  BlurReveal,
  SlotMachineHero,
  motion,
  fadeInUp,
  metallicCardEntrance,
} from "@/components/motion";
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
      <section className="relative z-10 flex min-h-svh flex-col items-center justify-center px-6 text-center">
        <div>
          <SlotMachineHero className="text-6xl font-bold metallic-heading neon-text-soft sm:text-7xl lg:text-9xl">
            {"Your Questions\nAnswered Instantly"}
          </SlotMachineHero>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Parents ask questions in plain English. AI finds the answer from
            your school&apos;s official documents — with citations.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Button
              size="lg"
              asChild
              className="shadow-[0_0_20px_var(--glow-primary),0_0_8px_oklch(1_0_0/30%)]"
            >
              <Link href="/register">Get started free</Link>
            </Button>
            <Button variant="ghost" size="lg" asChild>
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
        <div className="absolute bottom-8 flex flex-col items-center gap-1">
          <span className="text-sm text-muted-foreground">Scroll to explore</span>
          <ChevronDown className="h-5 w-5 text-muted-foreground animate-bounce" />
        </div>
      </section>


      {/* ═══ Traditional Landing Page ═══ */}
      <div className="relative">

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <BlurReveal>
            <h2 className="text-center text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl">
              Why parents love AskMySchool
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
              Everything you need to stay informed about your child&apos;s school
            </p>
          </BlurReveal>
          <StaggerChildren className="mt-16 grid gap-8 sm:grid-cols-3">
            <motion.div variants={fadeInUp}>
              <div className="metallic-card rounded-xl p-8 text-left backdrop-blur-sm">
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
              <div className="metallic-card rounded-xl p-8 text-left backdrop-blur-sm">
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
              <div className="metallic-card rounded-xl p-8 text-left backdrop-blur-sm">
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
        </section>

        {/* How It Works */}
        <section className="mx-auto max-w-5xl px-6 py-24">
          <BlurReveal>
            <h2 className="text-center text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl">
              How it works
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
              Three simple steps to get answers from your school&apos;s documents
            </p>
          </BlurReveal>

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
        <section className="py-20">
          <div className="mx-auto max-w-5xl px-6">
            <StaggerChildren className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
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
                      className="text-4xl font-bold metallic-text-animated neon-text"
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
        <section className="mx-auto max-w-5xl px-6 py-24">
          <BlurReveal>
            <h2 className="text-center text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl">
              What parents are saying
            </h2>
          </BlurReveal>
          <StaggerChildren className="mt-16 grid gap-8 sm:grid-cols-3">
            {testimonials.map((t, i) => (
              <motion.div key={i} variants={metallicCardEntrance}>
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
              </motion.div>
            ))}
          </StaggerChildren>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
          <RevealOnScroll>
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
