import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LegalNotice } from "@/components/legal/legal-notice";

// askmyschool.app/collegiate (app/collegiate/page.tsx), the link Collegiate
// parents are sent while they are onboarded. Parents already know what the
// site is; this page only has to get them signed in.
//
// The hero wears Collegiate's colors (navy and orange, taken from the school
// seal) and fixes them in both themes, so it looks the same in dark mode.

const COLLEGIATE_NAVY = "#00306B";
const COLLEGIATE_ORANGE = "#F56800";

const STEPS = [
  "Tap “Sign in with Blackbaud”.",
  "Enter the email and password you use for the Collegiate parent portal.",
  "You're in. Ask anything about school.",
];

const QUESTIONS = [
  "My child is sick today. Who do I tell?",
  "What can students wear on Fridays?",
  "When is the next day off?",
  "How do I email my child's teacher?",
];

export function CollegiateOnboarding({ schoolSlug }: { schoolSlug: string | null }) {
  // A plain anchor rather than <Button>: the global button styles use
  // !important and would paint over the white-on-navy. Like
  // BlackbaudSignInButton, it must not be next/link (the target redirects
  // off-site), and the native app's bridge still catches /auth/blackbaud.
  const signInHref = schoolSlug
    ? `/auth/blackbaud?school=${encodeURIComponent(schoolSlug)}`
    : "/login";

  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-14">
      <div className="w-full max-w-md">
        <section
          className="overflow-hidden rounded-3xl text-center text-white shadow-xl"
          style={{ background: COLLEGIATE_NAVY }}
        >
          <div className="h-1.5" style={{ background: COLLEGIATE_ORANGE }} />
          <div className="px-7 pb-10 pt-9 sm:px-10">
            <Image
              src="/images/collegiate/seal.svg"
              alt="Collegiate School seal"
              width={96}
              height={96}
              priority
              unoptimized
              // The seal is transparent; its navy lettering needs a white disc.
              className="mx-auto size-24 rounded-full bg-white p-0.5 ring-4 ring-white/15"
            />
            <Image
              src="/images/collegiate/wordmark.svg"
              alt="Collegiate"
              width={245}
              height={35}
              unoptimized
              className="mx-auto mt-6 h-6 w-auto"
            />
            <h1
              className="mt-5 font-serif-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl"
              style={{ color: "#fff" }}
            >
              Parents, sign in to AskMySchool
            </h1>
            <p className="mx-auto mt-3 max-w-xs text-sm text-white/75">
              Use your Collegiate parent portal login. There&apos;s no new
              account or password to make.
            </p>

            <a
              href={signInHref}
              className="group mt-7 flex h-12 w-full items-center justify-center gap-1 rounded-md bg-white text-base font-medium shadow-sm transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
              style={{ color: COLLEGIATE_NAVY }}
            >
              {schoolSlug ? "Sign in with Blackbaud" : "Sign in"}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </section>

        <section className="metallic-card mt-6 rounded-2xl p-6 sm:p-7">
          <p className="eyebrow">How to get on</p>
          <ol className="mt-4 space-y-3">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm text-ink">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                  style={{ background: COLLEGIATE_NAVY }}
                >
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8 px-1">
          <p className="eyebrow">Once you&apos;re in, try</p>
          <ul className="mt-3 space-y-2">
            {QUESTIONS.map((question) => (
              <li key={question} className="text-sm text-ink-soft">
                “{question}”
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-10 text-center text-sm text-ink-soft">
          School staff?{" "}
          <Link
            href="/login/staff"
            className="font-medium text-ink underline-offset-4 hover:underline"
          >
            Staff sign-in
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Powered by AskMySchool
        </p>
        <LegalNotice className="mt-2" />
      </div>
    </div>
  );
}
