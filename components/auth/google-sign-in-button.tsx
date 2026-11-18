"use client";

import { useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/logo-spinner";
import { usePendingNavigation } from "@/hooks/use-pending-navigation";
import { getNativePlatform } from "@/lib/native/platform";

interface GoogleSignInButtonProps {
  /** Where to land afterwards (validated again on the server). */
  next?: string;
  /** The login page to come back to with an error (used by the native app). */
  loginPath: string;
  disabled?: boolean;
}

/**
 * "Continue with Google" in the staff sign-in sections, shown only while
 * GOOGLE_SIGNIN_ENABLED is on (lib/auth/google-sign-in.ts). Never in the
 * parent sign-in section (a parent who already has an approved membership
 * can still use it from the staff section and gets a parent session). A plain anchor to the route handler that redirects to Google; in
 * the native app it opens the system sign-in sheet instead, because Google
 * blocks sign-in inside web views.
 */
export function GoogleSignInButton({ next, loginPath, disabled }: GoogleSignInButtonProps) {
  const { pending, start } = usePendingNavigation();
  const [nativePending, setNativePending] = useState(false);
  const busy = Boolean(pending) || nativePending;
  const href = next ? `/auth/google?next=${encodeURIComponent(next)}` : "/auth/google";

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (busy || disabled) {
      event.preventDefault();
      return;
    }
    const platform = getNativePlatform();
    if (!platform) {
      start(event);
      return;
    }

    event.preventDefault();
    setNativePending(true);
    void import("@/lib/native/google-sign-in")
      .then(({ signInWithGoogleInApp }) =>
        signInWithGoogleInApp(platform, { next: next ?? null, loginPath })
      )
      .catch((caught: unknown) => console.error("[native] Google sign-in failed", caught))
      .finally(() => setNativePending(false));
  }

  return (
    <Button
      asChild
      variant="outline"
      size="lg"
      className="h-11 w-full gap-3 bg-background text-sm font-medium aria-busy:pointer-events-none aria-busy:opacity-80 aria-disabled:pointer-events-none aria-disabled:opacity-60"
    >
      <a
        href={href}
        onClick={onClick}
        aria-busy={busy || undefined}
        aria-disabled={disabled || undefined}
        data-google-sign-in
      >
        {busy ? (
          <>
            <LogoSpinner />
            Redirecting to Google…
          </>
        ) : (
          <>
            <GoogleLogo />
            Continue with Google
          </>
        )}
      </a>
    </Button>
  );
}

/** The divider between the Google button and the password form. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-[0.12em] text-ink-soft">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-[18px] shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
