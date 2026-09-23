"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RevealOnScroll } from "@/components/motion";
import { MagneticButton } from "@/components/motion/magnetic-button";
import { ImagePlate } from "@/components/landing/image-plate";
import { LANDING_IMAGES } from "@/components/landing/landing-images";

// The close: a forest tile with a photograph leaning out of its right edge.
// The photo overflows the tile's corner and the section's cream shows behind
// it, so the two surfaces sit at visibly different heights.

export function ClosingCta() {
  return (
    <section id="get-started" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-28 pt-28 sm:pb-36 sm:pt-36">
      <RevealOnScroll>
        <div className="relative">
          <div className="lp-tile-accent relative overflow-hidden rounded-[32px] p-8 text-white sm:p-12 lg:p-16">
            {/* Soft glow behind the copy */}
            <div
              aria-hidden
              className="pointer-events-none absolute -left-20 -top-20 size-80 rounded-full bg-[#7a9a7c]/25 blur-3xl"
            />
            <div className="relative max-w-xl lg:max-w-[52%]">
              <p className="eyebrow !text-white/50">Get started</p>
              <h2 className="mt-4 text-3xl leading-[1.12] tracking-tight sm:text-4xl lg:text-[2.9rem]">
                <span className="text-white">Answers parents can trust.</span>
                <br />
                <span className="text-white/55">Bring it to your school.</span>
              </h2>
              <p className="mt-5 max-w-md text-base text-white/70 sm:text-lg">
                Create an account, add your school&apos;s documents, and start
                answering the questions families ask every week.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <MagneticButton strength={0.4} radius={100}>
                  {/* Plain link, not <Button>: the app-wide button rule
                      forces the forest fill, and this needs the inverse. */}
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm uppercase tracking-wide text-brand-dark shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5)] transition-colors hover:bg-brand-light"
                  >
                    Create your account
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </MagneticButton>
                <Link
                  href="/login"
                  className="text-sm text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline"
                >
                  Already set up? Sign in
                </Link>
              </div>
            </div>
          </div>

          {/* The photograph leaning out of the tile */}
          <div className="relative mx-6 -mt-10 rotate-[2deg] sm:mx-10 sm:-mt-14 lg:absolute lg:-right-6 lg:-top-10 lg:bottom-auto lg:mx-0 lg:mt-0 lg:w-[42%] lg:rotate-[3deg]">
            <ImagePlate
              image={LANDING_IMAGES.pickupLine}
              ratio="4/3"
              parallax={30}
              rounded="rounded-[24px]"
              className="shadow-[var(--lp-shadow-float)]"
            />
          </div>
        </div>
      </RevealOnScroll>
    </section>
  );
}
