"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TermsAssentCheckbox } from "@/components/legal/terms-assent-checkbox";
import { grantAiConsent, revokeAiConsent } from "@/actions/ai-consent";
import { useLocale } from "@/components/i18n/locale-provider";

interface AiConsentSectionProps {
  /** Agreed to the current notice version. */
  consented: boolean;
  /** When they agreed (ISO), if they have. */
  consentedAt?: string | null;
}

/**
 * Profile settings: see and withdraw (or give) consent to AI processing.
 * Withdrawing means the chat asks again before the next question, and the chat
 * API refuses questions until then.
 */
export function AiConsentSection({ consented: initial, consentedAt }: AiConsentSectionProps) {
  const [consented, setConsented] = useState(initial);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { locale, t } = useLocale();

  async function handleRevoke() {
    setSaving(true);
    const result = await revokeAiConsent();
    setSaving(false);
    setConfirmOpen(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    setConsented(false);
    setAcceptedTerms(false);
    toast.success(t("parent.ai.turnedOff"));
  }

  async function handleGrant() {
    if (!acceptedTerms) return;
    setSaving(true);
    const result = await grantAiConsent({ acceptedTerms });
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    setConsented(true);
    toast.success(t("parent.ai.turnedOn"));
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">
          {t("parent.ai.title")}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("parent.ai.subtitle")}
        </p>
      </div>
      <div className="space-y-4 rounded-xl border border-border p-4">
        <p className="text-sm leading-relaxed text-ink-soft">
          {t("parent.ai.notice")}
          <Link href="/privacy" className="font-medium text-ink underline underline-offset-4">
            {t("parent.ai.privacyPolicy")}
          </Link>
          {t("parent.ai.noticeEnd")}
        </p>
        {!consented && (
          <TermsAssentCheckbox
            checked={acceptedTerms}
            onCheckedChange={setAcceptedTerms}
            disabled={saving}
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink">
            {consented ? (
              <>
                <span className="font-medium">{t("parent.ai.on")}</span>
                {consentedAt && (
                  <span className="text-muted-foreground">
                    {" · "}
                    {t("parent.ai.agreed", {
                      date: new Date(consentedAt).toLocaleDateString(
                        locale === "es" ? "es-US" : "en-US",
                        { month: "long", day: "numeric", year: "numeric" }
                      ),
                    })}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="font-medium">{t("parent.ai.off")}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {t("parent.ai.offHint")}
                </span>
              </>
            )}
          </p>
          {consented ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={saving}
            >
              {t("parent.ai.withdraw")}
            </Button>
          ) : (
            <Button size="sm" onClick={handleGrant} disabled={saving || !acceptedTerms}>
              {t("parent.ai.agree")}
            </Button>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("parent.ai.supportQuestion")}{" "}
        <Link href="/support" className="underline underline-offset-4 hover:text-ink">
          {t("parent.ai.getSupport")}
        </Link>
      </p>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("parent.ai.confirmTitle")}
        description={t("parent.ai.confirmDescription")}
        confirmLabel={t("parent.ai.confirmWithdraw")}
        cancelLabel={t("parent.action.cancel")}
        onConfirm={handleRevoke}
        loading={saving}
      />
    </section>
  );
}
