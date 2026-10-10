"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { LogoSpinner } from "@/components/logo-spinner";
import { Logo } from "@/components/logo";
import { LogoLoading } from "@/components/logo-loading";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { ParentSignInButton } from "@/components/auth/parent-sign-in-button";
import { LegalNotice } from "@/components/legal/legal-notice";
import { AUTH_PROVIDERS, type AuthProvider } from "@/lib/auth/provider";
import { schoolPossessive } from "@/lib/school-display-name";

interface LoginFormProps {
  schoolSlug: string;
  schoolId: string;
  /** Null when the school has no usable name; copy falls back to "your school". */
  schoolName: string | null;
  provider: AuthProvider;
  signInEnabled: boolean;
}

export function LoginForm({
  schoolSlug,
  schoolId,
  schoolName,
  provider,
  signInEnabled,
}: LoginFormProps) {
  const { label: providerLabel, portalName } = AUTH_PROVIDERS[provider];
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const [loading, setLoading] = useState(false);
  // Parents only ever use the school's provider (Blackbaud or Veracross). The
  // password form is for staff, so it stays collapsed behind a quiet link.
  const [showStaffSignIn, setShowStaffSignIn] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  const showTransition = loading && !error;

  // Built as whole strings so each sentence renders as one text node, and a
  // missing name reads "your school's" rather than "'s".
  const possessive = schoolPossessive(schoolName);
  const heading = schoolName ?? "Sign in";
  const subheading = schoolName
    ? `Sign in with your ${schoolName} ${providerLabel} account.`
    : `Sign in with your school's ${providerLabel} account.`;
  const portalHint = `Use the same login you use for ${possessive} ${portalName}. Only parents and guardians can sign in.`;
  const notEnabled = `${schoolName ?? "Your school"} hasn't turned on ${providerLabel} sign-in yet. Please check back soon.`;

  return (
    <AuthShell>
      <AnimatePresence>
        {showTransition && (
          <motion.div
            key="auth-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background"
          >
            <LogoLoading size={100} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="metallic-card rounded-2xl p-8 sm:p-10">
        <div className="mb-7">
          <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary elev-1">
            <Logo size={24} className="text-primary" />
          </span>
          <p className="eyebrow">{showStaffSignIn ? "Staff sign in" : "Parent sign in"}</p>
          <h1 className="mt-2 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink">
            {heading}
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {showStaffSignIn
              ? "For school administrators."
              : subheading}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {!showStaffSignIn &&
          (signInEnabled ? (
            <>
              <ParentSignInButton schoolSlug={schoolSlug} provider={provider} />
              <p className="mt-5 text-center text-sm text-ink-soft">
                {portalHint}
              </p>
            </>
          ) : (
            <p className="rounded-xl border border-border bg-secondary/60 px-5 py-6 text-center text-sm text-ink-soft">
              {notEnabled}
            </p>
          ))}

        {showStaffSignIn && (
          <form action={handleSubmit} className="space-y-4">
            <input type="hidden" name="school_slug" value={schoolSlug} />
            <input type="hidden" name="school_id" value={schoolId} />
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@school.org"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                required
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading && <LogoSpinner className="mr-2" />}
              Sign in
            </Button>
          </form>
        )}

        <button
          type="button"
          onClick={() => {
            setError(null);
            setShowStaffSignIn((shown) => !shown);
          }}
          className="mt-6 w-full text-center text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          {showStaffSignIn ? "Back to parent sign-in" : "School staff sign-in"}
        </button>
        <LegalNotice className="mt-4" />
      </div>
    </AuthShell>
  );
}
