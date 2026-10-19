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
      <header className="mx-auto flex w-full max-w-[1100px] items-center justify-center px-6 pt-4">
        <Link href="/" className="flex items-center gap-2" aria-label="AskMySchool home">
          <Logo size={16} className="text-brand-dark" />
          <span className="text-base tracking-tight text-brand-dark">AskMySchool</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pb-10 pt-4 sm:px-6 sm:pt-5">
        <div className="text-center">
          <h1 className="font-serif-display text-2xl font-medium tracking-[-0.02em] text-ink sm:text-3xl">
            {TITLE}
          </h1>
          <p className="mx-auto mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft sm:text-base">
            {DESCRIPTION}
          </p>
        </div>

        {/* Capped so the whole video plus the button below fit in one
            viewport: max width = 62svh at 16:9, so height <= 62svh. */}
        <div className="mx-auto mt-4 w-full max-w-[calc(62svh*16/9)] overflow-hidden rounded-2xl bg-black shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)] sm:mt-5 sm:rounded-3xl">
          <DemoVideo />
        </div>

        <div className="mt-5 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-7 py-3 text-sm uppercase tracking-wide text-white transition-colors hover:bg-brand-green"
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
