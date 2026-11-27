"use client";

import { isAiProviderError, parentAiErrorMessage } from "@/lib/ai/provider-errors";
import { useLocale } from "@/components/i18n/locale-provider";

export default function ParentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale, t } = useLocale();
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="metallic-card rounded-xl border border-destructive/30 p-8 text-center max-w-md">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          {t("parent.error.title")}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {/* Never error.message: it can carry provider or server internals. */}
          {isAiProviderError(error) ? parentAiErrorMessage(locale) : t("parent.error.body")}
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {t("parent.error.retry")}
        </button>
      </div>
    </div>
  );
}
