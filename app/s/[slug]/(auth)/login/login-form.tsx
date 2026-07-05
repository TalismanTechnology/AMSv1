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
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { AuthShell } from "@/components/auth/auth-shell";

interface LoginFormProps {
  schoolSlug: string;
  schoolId: string;
  schoolName: string;
}

export function LoginForm({ schoolSlug, schoolId, schoolName }: LoginFormProps) {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(searchParams.get("error"));
  const [loading, setLoading] = useState(false);

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
    <AuthShell
      eyebrow={schoolName}
      headline={
        <>
          Your questions, <span className="italic text-primary">answered</span>{" "}
          clearly.
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

        <GoogleSignInButton schoolSlug={schoolSlug} />

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wider">
            <span className="bg-card px-3 text-muted-foreground">or</span>
          </div>
        </div>

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
