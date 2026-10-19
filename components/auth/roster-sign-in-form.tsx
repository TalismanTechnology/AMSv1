"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoSpinner } from "@/components/logo-spinner";
import { requestParentCode, verifyParentCode } from "@/actions/roster-sign-in";

interface RosterSignInFormProps {
  schoolSlug: string;
  /** Shows (or clears) a message in the login card's error box. */
  onError: (message: string | null) => void;
  /** Called once the session exists, before navigating away. */
  onSignedIn: () => void;
}

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Email one-time-code sign-in for schools that use an uploaded parent roster
 * (actions/roster-sign-in.ts). Everything happens on this page, so it works
 * the same in the iOS / Android web view: no sign-in sheet, no handoff.
 */
export function RosterSignInForm({ schoolSlug, onError, onSignedIn }: RosterSignInFormProps) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  async function sendCode() {
    setBusy(true);
    onError(null);
    try {
      const result = await requestParentCode({ schoolSlug, email });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setNotice(result.message);
      setCode("");
      setStep("code");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      onError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signIn(value: string) {
    if (busy) return;
    setBusy(true);
    onError(null);
    try {
      const result = await verifyParentCode({ schoolSlug, email, code: value });
      if (!result.ok) {
        onError(result.error);
        setBusy(false);
        return;
      }
      onSignedIn();
      // A full navigation, so middleware sees the new session cookies (and
      // sends first-time parents to /welcome).
      window.location.assign(result.redirectTo);
    } catch {
      onError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendCode();
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="roster-email">Email</Label>
          <Input
            id="roster-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <Button type="submit" size="lg" className="group h-12 w-full text-base" disabled={busy}>
          {busy && <LogoSpinner className="mr-2" />}
          Email me a code
          {!busy && (
            <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </Button>
        <RosterHint />
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void signIn(code);
      }}
      className="space-y-4"
    >
      <p className="text-sm text-ink-soft" aria-live="polite">
        We sent a 6-digit code to <span className="break-all font-medium text-ink">{email}</span>
        {notice ? <span className="mt-1 block">{notice}</span> : null}
      </p>
      <div className="space-y-2">
        <Label htmlFor="roster-code">Sign-in code</Label>
        <Input
          ref={codeInput}
          id="roster-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="123456"
          className="h-11 text-center font-mono text-lg tracking-[0.4em] md:text-lg"
          value={code}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(digits);
            if (digits.length === 6) void signIn(digits);
          }}
          required
        />
      </div>
      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={busy || code.length !== 6}
      >
        {busy && <LogoSpinner className="mr-2" />}
        Sign in
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            onError(null);
            setNotice(null);
            setCode("");
            setStep("email");
          }}
          className="text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          Use a different email
        </button>
        <button
          type="button"
          onClick={() => void sendCode()}
          disabled={busy || cooldown > 0}
          className="text-ink-soft underline-offset-4 hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:no-underline"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </div>
      <RosterHint />
    </form>
  );
}

function RosterHint() {
  return (
    <p className="text-center text-sm text-ink-soft">
      Only parents and guardians on the school&apos;s list can sign in. Not getting a code?
      Check spam, or ask the school office to add your email.
    </p>
  );
}
