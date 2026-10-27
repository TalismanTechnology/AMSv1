"use client";

import { AlertTriangle } from "lucide-react";
import { adminAiErrorMessage, classifyAiError, isAiProviderError } from "@/lib/ai/provider-errors";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <AlertTriangle
          className="mx-auto mb-4 h-6 w-6 text-muted-foreground"
          strokeWidth={2}
        />
        <h2 className="mb-2 text-xl font-semibold tracking-[-0.01em] text-ink">
          Something went wrong
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          {/* An AI provider's own message (billing, keys…) is never shown. */}
          {isAiProviderError(error)
            ? adminAiErrorMessage(classifyAiError(error))
            : error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="rounded-[var(--radius)] bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
