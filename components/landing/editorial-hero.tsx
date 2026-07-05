"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "@/components/motion";
import { MagneticButton } from "@/components/motion/magnetic-button";
import { HeroChatMockup } from "@/components/landing/hero-chat-mockup";

const ease = [0.16, 1, 0.3, 1] as const;

export function EditorialHero() {
  return (
    <section className="relative overflow-hidden px-6 pt-14 pb-8 sm:pt-20">
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8">
        {/* Copy */}
        <div className="relative z-10 max-w-xl">
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="eyebrow"
          >
            AI Answers. School Trusted.
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease, delay: 0.05 }}
            className="mt-5 font-serif-display text-[clamp(2.75rem,6vw,5rem)] font-medium leading-[0.98] tracking-[-0.02em] text-ink"
          >
            Your School
            <br />
            Questions,
            <br />
            Answered{" "}
            <span className="ink-underline italic font-normal text-ink">
              Clearly.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease, delay: 0.15 }}
            className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft"
          >
            Ask questions in plain English. Get instant answers from your
            school&apos;s official documents — with citations you can trust.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease, delay: 0.25 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <MagneticButton strength={0.3} radius={90}>
              <Button size="lg" asChild className="group h-12 px-6 text-base">
                <Link href="/register">
                  Get started free
                  <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
            </MagneticButton>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="h-12 px-6 text-base"
            >
              <Link href="#under-the-hood">See how it works</Link>
            </Button>
          </motion.div>
        </div>

        {/* Product preview */}
        <div className="relative z-0">
          <div className="rounded-[calc(var(--radius)+4px)]">
            <HeroChatMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
