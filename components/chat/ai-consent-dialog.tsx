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
import { useT } from "@/components/i18n/locale-provider";
import { richText } from "./rich-text";

const bold = (text: string) => <strong className="font-semibold text-ink">{text}</strong>;
function policyLink(href: string) {
  return function PolicyLink(text: string) {
    return (
      <Link
        href={href}
        target="_blank"
        rel="noopener"
        className="font-medium text-ink underline underline-offset-4"
      >
        {text}
      </Link>
    );
  };
}
const POLICY_TAGS = { terms: policyLink("/terms"), privacy: policyLink("/privacy") };

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
  const t = useT();
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
          <DialogTitle>{t("chat.consentTitle")}</DialogTitle>
          <DialogDescription>{t("chat.consentDescription")}</DialogDescription>
        </DialogHeader>

        <ul className="list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-ink-soft marker:text-muted-foreground">
          <li>{richText(t("chat.consentBullet1"), { b: bold })}</li>
          <li>{richText(t("chat.consentBullet2"), { b: bold })}</li>
          <li>{t("chat.consentBullet3")}</li>
          <li>{t("chat.consentBullet4")}</li>
        </ul>

        <p className="rounded-lg bg-muted/40 px-4 py-3 text-sm leading-relaxed text-ink-soft">
          {richText(t("chat.consentTerms"), POLICY_TAGS)}
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
            {t("chat.notNow")}
          </Button>
          <Button onClick={handleAgree} disabled={saving || !acceptedTerms}>
            {saving ? t("chat.saving") : t("chat.agree")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
