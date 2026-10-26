"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TermsAssentCheckbox } from "@/components/legal/terms-assent-checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { grantAiConsent } from "@/actions/ai-consent";

interface AiConsentDialogProps {
  open: boolean;
  /** Called after consent is saved server-side. */
  onAgree: () => void;
  /** "Not now" or dismiss — nothing is sent. */
  onDecline: () => void;
}

/**
 * One-time notice shown before a parent's first question (App Store Review
 * Guideline 5.1.2(i)). The server enforces the same rule in /api/chat, so this
 * is the explanation, not the lock. "Not now" (or dismissing) records nothing
 * and sends nothing; the question goes back into the input.
 *
 * It is also the first AskMySchool screen after Blackbaud's sign-in page, which
 * shows Blackbaud's own policies, so it says which terms govern AskMySchool and
 * asks the parent to agree to them (TermsAssentCheckbox, required for Agree).
 */
export function AiConsentDialog({ open, onAgree, onDecline }: AiConsentDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  async function handleAgree() {
    if (!acceptedTerms) return;
    setSaving(true);
    setError(null);
    const result = await grantAiConsent({ acceptedTerms });
    setSaving(false);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    onAgree();
  }

  // "Not now" records nothing; the box starts unticked next time too.
  function handleDecline() {
    setAcceptedTerms(false);
    setError(null);
    onDecline();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) handleDecline();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-lg sm:p-8"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-full bg-muted">
            <Sparkles className="size-4 text-ink" aria-hidden="true" />
          </div>
          <DialogTitle>Before you ask: how answers are made</DialogTitle>
          <DialogDescription>
            AskMySchool uses AI to answer your questions.
          </DialogDescription>
        </DialogHeader>

        <ul className="list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-ink-soft marker:text-muted-foreground">
          <li>
            When you ask a question, <strong className="font-semibold text-ink">your question</strong> and{" "}
            <strong className="font-semibold text-ink">the relevant excerpts from your school&apos;s documents</strong>{" "}
            are sent to <strong className="font-semibold text-ink">Google&apos;s Gemini AI</strong> to
            write the answer. Your children&apos;s grade levels may be included so
            answers fit their division, but their names are removed first.
          </li>
          <li>
            <strong className="font-semibold text-ink">AI answers can be wrong.</strong> Check
            the linked school documents for anything important, and contact the
            school if something doesn&apos;t look right.
          </li>
          <li>
            Your data isn&apos;t used to train our models. We use Google&apos;s paid
            Gemini API, under which Google doesn&apos;t use it to train its models
            either.
          </li>
          <li>
            You can withdraw this at any time from your Profile.
          </li>
        </ul>

        <p className="rounded-lg bg-muted/40 px-4 py-3 text-sm leading-relaxed text-ink-soft">
          The privacy policy and terms shown when you signed in with Blackbaud
          (or your school&apos;s other sign-in service) cover that account only.
          Your use of AskMySchool is governed by AskMySchool&apos;s own{" "}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener"
            className="font-medium text-ink underline underline-offset-4"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener"
            className="font-medium text-ink underline underline-offset-4"
          >
            Privacy Policy
          </Link>
          .
        </p>

        <TermsAssentCheckbox
          checked={acceptedTerms}
          onCheckedChange={setAcceptedTerms}
          disabled={saving}
        />

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleDecline} disabled={saving}>
            Not now
          </Button>
          <Button onClick={handleAgree} disabled={saving || !acceptedTerms}>
            {saving ? "Saving…" : "Agree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
