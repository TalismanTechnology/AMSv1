"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { LogoLoading } from "@/components/logo-loading";
import { motion, AnimatePresence } from "framer-motion";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { LegalNotice } from "@/components/legal/legal-notice";

export function StaffLoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  // useActionState marks `pending` urgent as soon as the form submits and keeps
  // it true across `login()` and its post-sign-in redirect; plain `setState`
  // inside a `<form action>` handler is deferred by React 19's transition.
  const [error, formAction, pending] = useActionState<string | null, FormData>(
    async (_prevError: string | null, formData: FormData) => {
      const result = await login(formData);
      return result?.error ?? null;
    },
    searchParams.get("error")
  );

  return (
    <AuthShell
      headline={
        <>
          Welcome back to your{" "}
          <span className="italic text-primary">school desk</span>.
        </>
      }
      subhead="Sign in to ask questions and get instant, cited answers from your school's official documents."
      points={[
        "Instant answers from official handbooks",
        "Every reply cites its source document",
        "Built for busy parents and staff",
      ]}
    >
      <AnimatePresence>
        {pending && (
          <motion.div
            key="auth-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background"
          >
            <LogoLoading size={100} label="Signing you in…" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="metallic-card rounded-2xl p-8 sm:p-10">
        <div className="mb-7">
          <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary elev-1">
            <Logo size={24} className="text-primary" />
          </span>
          <p className="eyebrow">Staff sign in</p>
          <h2 className="mt-2 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink">
            Welcome back
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            For school administrators. Parents sign in with Blackbaud.
          </p>
        </div>

        {!pending && error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@school.org"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
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
              disabled={pending}
              required
            />
          </div>
          <SubmitButton className="h-11 w-full" pendingText="Signing in…">
            Sign in
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          A parent?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in with Blackbaud
          </Link>
        </p>
        <LegalNotice className="mt-4" />
      </div>
    </AuthShell>
  );
}
