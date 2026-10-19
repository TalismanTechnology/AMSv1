import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/landing/site-footer";
import { DemoVideo } from "./demo-video";

// Public demo-video page, shared as a link (email, social). Same paper
// background and type as the marketing site; the video is a native <video>
// (in a small client component that handles autoplay with sound). Assets
// live in public/demo.

const SITE_URL = "https://askmyschool.app";
const PAGE_URL = `${SITE_URL}/demo`;
const TITLE = "See Ask My School in action";
const DESCRIPTION =
  "See how Ask My School answers parents' questions from your school's own documents.";

export const metadata: Metadata = {
  title: `${TITLE} — AskMySchool`,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "video.other",
    url: PAGE_URL,
    title: TITLE,
    description: DESCRIPTION,
    siteName: "AskMySchool",
    images: [
      {
        url: `${SITE_URL}/demo/askmyschool-demo-poster.jpg`,
        width: 1920,
        height: 1080,
        alt: TITLE,
      },
    ],
    videos: [
      {
        url: `${SITE_URL}/demo/askmyschool-demo.mp4`,
        type: "video/mp4",
        width: 1920,
        height: 1080,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/demo/askmyschool-demo-poster.jpg`],
  },
};

// Plain content with no per-request data: always prerender at build time.
export const dynamic = "force-static";

export default function DemoPage() {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-[1100px] items-center justify-center px-6 pt-6">
        <Link href="/" className="flex items-center gap-2" aria-label="AskMySchool home">
          <Logo size={20} className="text-brand-dark" />
          <span className="text-xl tracking-tight text-brand-dark">AskMySchool</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <div className="text-center">
          <h1 className="font-serif-display text-4xl font-medium tracking-[-0.02em] text-ink sm:text-5xl">
            {TITLE}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">
            {DESCRIPTION}
          </p>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl bg-black shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)] sm:mt-10 sm:rounded-3xl">
          <DemoVideo />
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-8 py-3.5 text-sm uppercase tracking-wide text-white transition-colors hover:bg-brand-green"
          >
            Visit askmyschool.app
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
