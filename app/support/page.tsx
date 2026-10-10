import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/landing/site-footer";
import { PRIVACY_EMAIL, SUPPORT_EMAIL } from "@/lib/contact";

// Public support page (App Store Review Guideline 1.5: the Support URL must
// lead to a way to contact us). Allowed without sign-in in
// lib/supabase/middleware.ts. Styled like the marketing site and the /privacy
// and /terms pages (PR #8's components/legal/legal-page.tsx); kept standalone
// so it doesn't depend on that PR.

export const metadata: Metadata = {
  title: "Support — AskMySchool",
  description:
    "Get help with AskMySchool: signing in, finding your school, reporting a wrong answer, deleting your account, and contacting us.",
};

const LINK = "font-medium text-ink underline underline-offset-4";

const FAQS: { id: string; q: string; a: React.ReactNode }[] = [
  {
    id: "sign-in",
    q: "How do I sign in?",
    a: (
      <>
        <p>
          Parents sign in with the same parent portal login your school
          already gives you (for example, Blackbaud). There&apos;s no separate
          AskMySchool password to create.
        </p>
        <p>
          Go to{" "}
          <Link href="/login" className={LINK}>
            Sign in
          </Link>
          , choose your school, and sign in through your school&apos;s portal.
          You&apos;ll come straight back to AskMySchool once you&apos;re in. If
          your portal login doesn&apos;t work, your school&apos;s office or IT
          help desk can reset it. School staff sign in at{" "}
          <Link href="/login/staff" className={LINK}>
            Staff sign in
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: "school-not-listed",
    q: "My school isn't listed",
    a: (
      <p>
        AskMySchool is only available at schools that have set it up, so your
        school may not be using it yet. If you think it should be listed, ask
        your school&apos;s office, or email us at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
          {SUPPORT_EMAIL}
        </a>{" "}
        with your school&apos;s name and we&apos;ll look into it. Schools
        interested in AskMySchool can reach us at the same address.
      </p>
    ),
  },
  {
    id: "wrong-answer",
    q: "An answer looks wrong",
    a: (
      <>
        <p>
          Answers are written by AI from your school&apos;s documents, and AI
          can make mistakes. Every fact links to the document it came from, so
          open the citation to check anything important, and contact your
          school directly if something matters (a deadline, a cost, a medical
          or safety question).
        </p>
        <p>
          Tap the <strong>thumbs-down</strong> under the answer to flag it.
          Flagged answers go to your school&apos;s staff, who can see the
          question and fix or add the document behind it.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    q: "How is AI used, and can I turn it off?",
    a: (
      <p>
        To answer a question, your question and the relevant excerpts from your
        school&apos;s documents are sent to Google&apos;s Gemini AI. Your
        children are described by grade level, not by name. You&apos;re asked
        to agree before your first question, and you can withdraw that at any
        time from your Profile (you won&apos;t be able to ask questions until
        you agree again).
      </p>
    ),
  },
  {
    id: "delete-account",
    q: "How do I delete my account?",
    a: (
      <p>
        In the app, open <strong>Profile</strong> and choose{" "}
        <strong>Delete account</strong>. If you can&apos;t sign in, or would
        rather we do it, email{" "}
        <a href={`mailto:${PRIVACY_EMAIL}?subject=Delete%20my%20account`} className={LINK}>
          {PRIVACY_EMAIL}
        </a>{" "}
        from the address on your account and we&apos;ll delete it for you.
      </p>
    ),
  },
  {
    id: "privacy",
    q: "Privacy and terms",
    a: (
      <p>
        Read our{" "}
        <Link href="/privacy" className={LINK}>
          Privacy Policy
        </Link>{" "}
        to see what we collect and why, and our{" "}
        <Link href="/terms" className={LINK}>
          Terms of Service
        </Link>
        . Privacy questions can go to{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`} className={LINK}>
          {PRIVACY_EMAIL}
        </a>
        .
      </p>
    ),
  },
];

export default function SupportPage() {
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
        <p className="eyebrow">Help</p>
        <h1 className="mt-2 font-serif-display text-4xl font-medium tracking-[-0.02em] text-ink sm:text-5xl">
          Support
        </h1>
        <p className="mt-6 text-base leading-relaxed text-ink-soft">
          Questions about AskMySchool, trouble signing in, or something not
          working? We&apos;re happy to help.
        </p>

        <section
          id="contact"
          aria-labelledby="contact-heading"
          className="mt-10 rounded-2xl border border-border bg-card p-6 sm:p-8"
        >
          <h2
            id="contact-heading"
            className="font-serif-display text-2xl font-medium tracking-[-0.01em] text-ink"
          >
            Contact us
          </h2>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">
            Email us and a real person will reply. Include your school&apos;s
            name and, if something went wrong, what you were doing when it
            happened.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=AskMySchool%20support`}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {SUPPORT_EMAIL}
          </a>
          <p className="mt-4 text-sm text-muted-foreground">
            We aim to reply within one business day (Monday–Friday, US Eastern
            time).
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            For questions about a school policy, date, or form, your
            school&apos;s office is the best place to ask — they own the
            documents AskMySchool answers from.
          </p>
        </section>

        <section aria-labelledby="faq-heading" className="mt-14">
          <h2
            id="faq-heading"
            className="font-serif-display text-2xl font-medium tracking-[-0.01em] text-ink"
          >
            Common questions
          </h2>
          <div className="mt-6 divide-y divide-border border-y border-border">
            {FAQS.map((item) => (
              <div key={item.id} id={item.id} className="scroll-mt-24 py-6">
                <h3 className="text-base font-medium text-ink sm:text-lg">{item.q}</h3>
                <div className="mt-3 space-y-3 text-[0.95rem] leading-relaxed text-ink-soft [&_strong]:font-semibold [&_strong]:text-ink">
                  {item.a}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
