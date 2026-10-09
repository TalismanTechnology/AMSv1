import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/landing/site-footer";

// Shared shell for the public legal pages (/privacy, /terms): the paper
// background and type of the marketing site, a readable single column, and
// the same footer as the landing page.

// TODO(lucas): replace with the real, monitored contact address before launch.
export const LEGAL_CONTACT_EMAIL = "privacy@askmyschool.app";

export const LEGAL_LAST_UPDATED = "October 9, 2026";

interface LegalPageProps {
  eyebrow: string;
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}

export function LegalPage({ eyebrow, title, intro, children }: LegalPageProps) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 pt-6">
        <Link
          href="/"
          className="group flex items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back
        </Link>
        <Link href="/" className="flex items-center gap-2">
          <Logo size={18} className="text-brand-dark" />
          <span className="text-sm tracking-tight text-brand-dark">AskMySchool</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-20 pt-12 sm:pt-16">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 font-serif-display text-4xl font-medium tracking-[-0.02em] text-ink sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: {LEGAL_LAST_UPDATED}
        </p>
        <div className="mt-6 text-base leading-relaxed text-ink-soft">{intro}</div>
        <div className="mt-12 space-y-12">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}

interface LegalSectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

export function LegalSection({ id, title, children }: LegalSectionProps) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-serif-display text-2xl font-medium tracking-[-0.01em] text-ink">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[0.95rem] leading-relaxed text-ink-soft [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">{children}</ul>;
}

export function ContactEmailLink() {
  return (
    <a
      href={`mailto:${LEGAL_CONTACT_EMAIL}`}
      className="font-medium text-ink underline underline-offset-4"
    >
      {LEGAL_CONTACT_EMAIL}
    </a>
  );
}
