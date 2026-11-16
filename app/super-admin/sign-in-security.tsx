"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setRequireGoogleSignIn } from "@/actions/super-admin";

interface SignInSecurityProps {
  email: string;
  googleSignInEnabled: boolean;
  googleLinked: boolean;
  passwordDisabled: boolean;
}

/**
 * "Require Google sign-in for my account". Can only be switched on once the
 * account has a linked Google identity (sign in with Google once) and Google
 * sign-in is on, so it can't lock the super-admin out.
 */
export function SignInSecurity({
  email,
  googleSignInEnabled,
  googleLinked,
  passwordDisabled,
}: SignInSecurityProps) {
  const [checked, setChecked] = useState(passwordDisabled);
  const [pending, startTransition] = useTransition();
  const canEnable = googleSignInEnabled && googleLinked;

  function onChange(next: boolean) {
    startTransition(async () => {
      const result = await setRequireGoogleSignIn(next);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setChecked(next);
      toast.success(next ? "Password sign-in is off for your account" : "Password sign-in is back on");
    });
  }

  const hint = !googleSignInEnabled
    ? "Google sign-in isn't turned on yet (GOOGLE_SIGNIN_ENABLED)."
    : !googleLinked
      ? `Sign out and use “Continue with Google” with ${email} once to link your Google account first.`
      : checked
        ? "Only Google can sign in to this account. Password sign-ins are refused and ended."
        : "Your Google account is linked. Turn this on to stop password sign-ins.";

  return (
    <section className="max-w-4xl mx-auto mt-10">
      <h2 className="text-lg font-semibold text-ink tracking-[-0.01em]">Sign-in security</h2>
      <div className="mt-4 flex items-start justify-between gap-6 rounded-xl border border-border p-5">
        <div className="min-w-0">
          <label htmlFor="require-google" className="text-sm font-medium text-ink">
            Require Google sign-in for my account
          </label>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
        <Switch
          id="require-google"
          checked={checked}
          onCheckedChange={onChange}
          // Turning it off is always allowed, so it can never get stuck on.
          disabled={pending || (!checked && !canEnable)}
        />
      </div>
    </section>
  );
}
