"use client";

import { useState } from "react";
import Link from "next/link";
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
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyState, setVerifyState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerifyState("sending");

    try {
      const response = await fetch("/api/auth/verify-blackbaud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolSlug, email: verifyEmail }),
      });

      // The endpoint answers identically whether or not the email is on file,
      // so "sent" here means "request accepted", not "we found you".
      setVerifyState(response.ok ? "sent" : "error");
    } catch {
      setVerifyState("error");
    }
  }

  const showTransition = loading && !error;

  return (
    <AuthShell
      eyebrow={schoolName}
      headline={
        <>
          Your questions, <span className="italic text-primary">answered</span>{" "}
          instantly.
        </>
      }
      subhead={`Sign in to ${schoolName} on AskMySchool and get instant, cited answers from official school documents.`}
      points={[
        "Instant answers from official handbooks",
        "Every reply cites its source document",
        "Private to your school community",
      ]}
    >
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
          <p className="eyebrow">Sign in</p>
          <h2 className="mt-2 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink">
            Welcome back
          </h2>
          <p className="mt-2 text-sm text-ink-soft">Sign in to {schoolName}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {blackbaudEnabled && (
          <div className="mb-5 rounded-xl border border-primary/20 bg-primary/[0.04] p-5">
            <p className="eyebrow text-primary">Verify with school records</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Enter the email {schoolName} has on file and we&apos;ll send you a
              sign-in link. No password needed.
            </p>

            {verifyState === "sent" ? (
              <p
                aria-live="polite"
                className="mt-4 rounded-lg border border-primary/25 bg-card p-3 text-sm text-ink"
              >
                If your email is on file with {schoolName}, we&apos;ve sent a
                sign-in link. Check your inbox.
              </p>
            ) : (
              <form onSubmit={handleVerify} className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="verify-email" className="sr-only">
                    School email address
                  </Label>
                  <Input
                    id="verify-email"
                    type="email"
                    autoComplete="email"
                    placeholder="parent@example.com"
                    value={verifyEmail}
                    onChange={(event) => setVerifyEmail(event.target.value)}
                    required
                  />
                </div>

                {verifyState === "error" && (
                  <p
                    aria-live="polite"
                    className="text-sm text-destructive"
                  >
                    Something went wrong. Please try again in a moment.
                  </p>
                )}

                <Button
                  type="submit"
                  variant="secondary"
                  className="h-11 w-full"
                  disabled={verifyState === "sending"}
                >
                  {verifyState === "sending" && (
                    <LogoSpinner className="mr-2" />
                  )}
                  Send sign-in link
                </Button>
              </form>
            )}
          </div>
        )}

        {/* Only meaningful when something sits above the password form; with
            the verify panel hidden this would be an orphaned rule. */}
        {blackbaudEnabled && (
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-card px-3 text-muted-foreground">or</span>
            </div>
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="school_slug" value={schoolSlug} />
          <input type="hidden" name="school_id" value={schoolId} />
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="parent@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Enter your password"
              required
            />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading && <LogoSpinner className="mr-2" />}
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Don&apos;t have an account?{" "}
          <Link
            href={`/s/${schoolSlug}/register`}
            className="font-medium text-primary hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
