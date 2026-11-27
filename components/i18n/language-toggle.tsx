"use client";

import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALES, type Locale } from "@/lib/i18n/locale";
import { useLocale } from "./locale-provider";

const LABEL_KEYS = { en: "common.english", es: "common.spanish" } as const;

/**
 * English / Español switch. Each option is labelled in its own language so a
 * parent who reads only one can always find it.
 */
export function LanguageToggle({
  className,
  compact = false,
}: {
  className?: string;
  /** Icon + "EN | ES" for tight spots (collapsed sidebar). */
  compact?: boolean;
}) {
  const { locale, setLocale, t } = useLocale();
  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className={cn("flex items-center gap-1 text-xs", className)}
      data-language-toggle
    >
      <Languages aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      {LOCALES.map((option: Locale, i) => (
        <span key={option} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className="text-muted-foreground/60">|</span>}
          <button
            type="button"
            lang={option}
            aria-pressed={locale === option}
            onClick={() => locale !== option && setLocale(option)}
            className={cn(
              "rounded px-1 py-0.5 underline-offset-4 transition-colors",
              locale === option
                ? "font-semibold text-ink"
                : "text-ink-soft hover:text-ink hover:underline"
            )}
          >
            {compact ? option.toUpperCase() : t(LABEL_KEYS[option])}
          </button>
        </span>
      ))}
    </div>
  );
}
