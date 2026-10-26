"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";

const LINK = "font-medium text-ink underline underline-offset-4 hover:text-ink/80";

/**
 * "I have read and agree to AskMySchool's Terms of Service and Privacy
 * Policy" — starts unchecked; the caller keeps its Agree button disabled until
 * it is ticked. The links open in a new tab so the dialog isn't lost.
 */
export function TermsAssentCheckbox({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <label htmlFor={id} className="text-sm leading-relaxed text-ink-soft">
        I have read and agree to AskMySchool&apos;s{" "}
        <a href="/terms" target="_blank" rel="noopener" className={LINK}>
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noopener" className={LINK}>
          Privacy Policy
        </a>
        .
      </label>
    </div>
  );
}
