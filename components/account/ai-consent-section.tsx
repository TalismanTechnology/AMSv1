"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { grantAiConsent, revokeAiConsent } from "@/actions/ai-consent";

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
    toast.success("AI processing turned off");
  }

  async function handleGrant() {
    setSaving(true);
    const result = await grantAiConsent();
    setSaving(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    setConsented(true);
    toast.success("AI processing turned on");
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">
          AI processing
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          How your questions are answered.
        </p>
      </div>
      <div className="space-y-4 rounded-xl border border-border p-4">
        <p className="text-sm leading-relaxed text-ink-soft">
          To answer a question, AskMySchool sends it, along with the relevant
          excerpts from your school&apos;s documents, to Google&apos;s Gemini AI.
          Your children are described by grade level, not by name. AI answers
          can be wrong, so
          check the linked documents for anything important. See our{" "}
          <Link href="/privacy" className="font-medium text-ink underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink">
            {consented ? (
              <>
                <span className="font-medium">On</span>
                {consentedAt && (
                  <span className="text-muted-foreground">
                    {" "}
                    · agreed{" "}
                    {new Date(consentedAt).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="font-medium">Off</span>
                <span className="text-muted-foreground"> · you&apos;ll be asked before your next question</span>
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
              Withdraw consent
            </Button>
          ) : (
            <Button size="sm" onClick={handleGrant} disabled={saving}>
              Agree
            </Button>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Questions about your account?{" "}
        <Link href="/support" className="underline underline-offset-4 hover:text-ink">
          Get support
        </Link>
      </p>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Withdraw consent to AI processing?"
        description="You won't be able to ask questions until you agree again. Your past conversations stay in your history."
        confirmLabel="Withdraw"
        onConfirm={handleRevoke}
        loading={saving}
      />
    </section>
  );
}
