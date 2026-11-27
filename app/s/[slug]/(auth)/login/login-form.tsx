"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { LogoLoading } from "@/components/logo-loading";
import { motion, AnimatePresence } from "framer-motion";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { ParentSignInButton } from "@/components/auth/parent-sign-in-button";
import { LegalNotice } from "@/components/legal/legal-notice";
import { AuthDivider, GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { staffPasswordForm, type StaffSignInMode } from "@/lib/auth/admin-google-only";
import { AUTH_PROVIDERS, isRetiredAuthProvider, type AuthProvider } from "@/lib/auth/provider";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useLocale } from "@/components/i18n/locale-provider";
import { localizeAuthError, schoolPossessiveFor } from "@/lib/i18n/auth-errors";

interface LoginFormProps {
  schoolSlug: string;
  schoolId: string;
  /** Null when the school has no usable name; copy falls back to "your school". */
  schoolName: string | null;
  provider: AuthProvider;
  signInEnabled: boolean;
  /**
   * What the staff section offers (GOOGLE_SIGNIN_ENABLED, ADMIN_GOOGLE_ONLY).
   * Google is offered in the staff section only.
   */
  staffSignIn: StaffSignInMode;
}

export function LoginForm({
  schoolSlug,
  schoolId,
  schoolName,
  provider,
  signInEnabled,
  staffSignIn,
}: LoginFormProps) {
  const googleSignInEnabled = staffSignIn === "google-only" || staffSignIn === "google-and-password";
  const passwordForm = staffPasswordForm(staffSignIn);
  const { label: providerLabel } = AUTH_PROVIDERS[provider];
  const { locale, t } = useLocale();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  // Errors from the provider callbacks arrive as ?error=.
  const [parentError, setParentError] = useState<string | null>(searchParams.get("error"));
  const [dismissedAttempt, setDismissedAttempt] = useState(0);
  // Parents only ever use the school's provider (Blackbaud or Veracross). The
  // password form is for staff, so it stays collapsed behind a quiet link.
  const [showStaffSignIn, setShowStaffSignIn] = useState(false);
  // ADMIN_GOOGLE_ONLY: inside the staff section the password form is for
  // parents only (see staffPasswordForm), behind one more quiet link.
  const [showParentPassword, setShowParentPassword] = useState(false);
  const staffPasswordShown = passwordForm === "open" || showParentPassword;

  const [actionState, formAction, formPending] = useActionState<{ attempt: number; error: string | null }, FormData>(
    async (prev: { attempt: number; error: string | null }, formData: FormData) => {
      const result = await login(formData);
      return { attempt: prev.attempt + 1, error: result?.error ?? null };
    },
    { attempt: 0, error: null }
  );

  const loading = formPending;
  const staffError = actionState.attempt > dismissedAttempt ? actionState.error : null;
  const error = showStaffSignIn ? staffError : parentError;

  // Built as whole strings so each sentence renders as one text node, and a
  // missing name reads "your school's" rather than "'s".
  const possessive = schoolPossessiveFor(locale, schoolName);
  const heading = schoolName ?? t("auth.signIn");
  // A leftover auth_provider = 'roster' (emailed codes, removed) has no
  // parent sign-in at all: say so rather than offer anything.
  const retired = isRetiredAuthProvider(provider);
  const subheading = retired
    ? t("auth.parentSignInUnavailable")
    : schoolName
      ? t("auth.subheadingNamed", { school: schoolName, provider: providerLabel })
      : t("auth.subheadingUnnamed", { provider: providerLabel });
  const portalHint = t("auth.portalHint", { possessive, portal: t(`auth.portal.${provider}`) });
  const notEnabled = retired
    ? t("auth.notSetUp", { school: schoolName ?? t("auth.yourSchool") })
    : schoolName
      ? t("auth.notEnabledNamed", { school: schoolName, provider: providerLabel })
      : t("auth.notEnabledUnnamed", { provider: providerLabel });

  return (
    <AuthShell>
      <AnimatePresence>
        {loading && (
          <motion.div
            key="auth-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background"
          >
            <LogoLoading size={100} label={t("auth.signingYouIn")} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="metallic-card rounded-2xl p-8 sm:p-10">
        <div className="mb-7">
          <div className="mb-5 flex items-start justify-between gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary elev-1">
              <Logo size={24} className="text-primary" />
            </span>
            <LanguageToggle />
          </div>
          <p className="eyebrow">{showStaffSignIn ? t("auth.staffSignIn") : t("auth.parentSignIn")}</p>
          <h1 className="mt-2 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink">
            {heading}
          </h1>
          <p className="mt-2 text-sm text-ink-soft">
            {showStaffSignIn ? t("auth.staffSubheading") : subheading}
          </p>
        </div>

        {!loading && error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {localizeAuthError(error, locale)}
          </div>
        )}

        {!showStaffSignIn &&
          (signInEnabled && !retired ? (
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

        {showStaffSignIn && googleSignInEnabled && (
          <>
            <GoogleSignInButton
              next={`/s/${schoolSlug}/admin`}
              loginPath={`/s/${schoolSlug}/login`}
              disabled={formPending}
            />
            {passwordForm === "open" ? (
              <AuthDivider />
            ) : (
              <p className="mt-3 text-center text-sm text-ink-soft">{t("auth.adminsSignInWithGoogle")}</p>
            )}
          </>
        )}

        {showStaffSignIn && staffSignIn === "unavailable" && (
          <p className="rounded-xl border border-border bg-secondary/60 px-5 py-6 text-center text-sm text-ink-soft">
            {t("auth.adminSignInUnavailable")}
          </p>
        )}

        {showStaffSignIn && passwordForm === "parent-link" && (
          <button
            type="button"
            aria-expanded={showParentPassword}
            onClick={() => setShowParentPassword((shown) => !shown)}
            className="mt-5 w-full text-center text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
            data-parent-password-link
          >
            {t("auth.parentPasswordLink")}
          </button>
        )}

        {showStaffSignIn && passwordForm === "parent-link" && showParentPassword && (
          <p className="mt-4 mb-3 text-center text-xs text-ink-soft">{t("auth.parentPasswordNote")}</p>
        )}

        {showStaffSignIn && staffPasswordShown && (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="school_slug" value={schoolSlug} />
            <input type="hidden" name="school_id" value={schoolId} />
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={formPending}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder={t("auth.passwordPlaceholder")}
                disabled={formPending}
                required
              />
            </div>
            <SubmitButton className="h-11 w-full" pendingText={t("auth.signingIn")}>
              {t("auth.signIn")}
            </SubmitButton>
          </form>
        )}

        <button
          type="button"
          onClick={() => {
            setParentError(null);
            setDismissedAttempt(actionState.attempt);
            setShowStaffSignIn((shown) => !shown);
          }}
          className="mt-6 w-full text-center text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          {showStaffSignIn ? t("auth.backToParentSignIn") : t("auth.staffSignInLink")}
        </button>
        <LegalNotice className="mt-4" />
      </div>
    </AuthShell>
  );
}
