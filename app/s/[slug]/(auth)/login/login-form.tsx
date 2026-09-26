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
import { BlackbaudSignInButton } from "@/components/auth/blackbaud-sign-in-button";

interface LoginFormProps {
  schoolSlug: string;
  schoolId: string;
  schoolName: string;
  blackbaudEnabled: boolean;
}

export function LoginForm({
  schoolSlug,
  schoolId,
  schoolName,
  blackbaudEnabled,
}: LoginFormProps) {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const [loading, setLoading] = useState(false);
  // Parents only ever use Blackbaud. The password form is for staff, so it
  // stays collapsed behind a quiet link.
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
            {schoolName}
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {showStaffSignIn
              ? "For school administrators."
              : `Sign in with your ${schoolName} Blackbaud account.`}
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
          (blackbaudEnabled ? (
            <>
              <BlackbaudSignInButton schoolSlug={schoolSlug} />
              <p className="mt-5 text-center text-sm text-ink-soft">
                Use the same login you use for {schoolName}&apos;s Blackbaud
                parent portal. Only parents and guardians can sign in.
              </p>
            </>
          ) : (
            <p className="rounded-xl border border-border bg-secondary/60 px-5 py-6 text-center text-sm text-ink-soft">
              {schoolName} hasn&apos;t turned on Blackbaud sign-in yet. Please
              check back soon.
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
      </div>
    </AuthShell>
  );
}
