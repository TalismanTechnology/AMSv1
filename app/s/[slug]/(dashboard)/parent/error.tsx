"use client";

import { PARENT_AI_ERROR_MESSAGE, isAiProviderError } from "@/lib/ai/provider-errors";

export default function ParentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="metallic-card rounded-xl border border-destructive/30 p-8 text-center max-w-md">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {/* Never error.message: it can carry provider or server internals. */}
          {isAiProviderError(error)
            ? PARENT_AI_ERROR_MESSAGE
            : "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
