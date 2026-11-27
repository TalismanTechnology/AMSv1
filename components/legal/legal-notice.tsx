"use client";

import Link from "next/link";
import { useT } from "@/components/i18n/locale-provider";

/**
 * Small print under sign-in forms linking to the Terms and Privacy Policy.
 * English outside a LocaleProvider (staff and landing pages).
 */
export function LegalNotice({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <p className={`text-center text-xs text-muted-foreground ${className}`}>
      {t("auth.legalPrefix")}{" "}
      <Link href="/terms" className="underline underline-offset-4 hover:text-ink">
        {t("auth.legalTerms")}
      </Link>{" "}
      {t("auth.legalAnd")}{" "}
      <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
        {t("auth.legalPrivacy")}
      </Link>
      .
    </p>
  );
}
