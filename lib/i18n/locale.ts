// Which language the parent-facing UI renders in. Pure (no next/headers, no
// DOM), so the server helper (lib/i18n/server.ts), the client provider and the
// tests all share it.
//
// Resolution order: the parent's own choice (the ams_locale cookie, set by the
// English / Español toggle) → the browser's Accept-Language (es* → Spanish) →
// English. Admin and super-admin pages never read it: they stay English.

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** The cookie the language toggle writes. Read on every parent page render. */
export const LOCALE_COOKIE = "ams_locale";
/** One year: a parent's choice should outlast many sessions. */
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** A supported locale from a stored value ("es", "ES", " en "), else null. */
export function parseLocale(value: string | null | undefined): Locale | null {
  const v = value?.trim().toLowerCase();
  return (LOCALES as readonly string[]).includes(v ?? "") ? (v as Locale) : null;
}

/**
 * The preferred supported language from an Accept-Language header: tags are
 * weighed by their q-value (default 1, order breaks ties), and the best one
 * that is English or Spanish wins. "es-MX,es;q=0.9,en;q=0.8" → "es";
 * "en-US,es;q=0.5" → "en"; "fr-FR" → null.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return {
        lang: tag.trim().toLowerCase().split("-")[0],
        weight: Number.isFinite(weight) ? weight : 0,
        index,
      };
    })
    .filter((entry) => entry.lang && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { lang } of ranked) {
    const locale = parseLocale(lang);
    if (locale) return locale;
  }
  return null;
}

/** Cookie → (optional) profile preference → Accept-Language → English. */
export function resolveLocale({
  cookie,
  profile,
  acceptLanguage,
}: {
  cookie?: string | null;
  profile?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  return (
    parseLocale(cookie) ??
    parseLocale(profile) ??
    localeFromAcceptLanguage(acceptLanguage) ??
    DEFAULT_LOCALE
  );
}

/**
 * The Set-Cookie value the toggle writes through document.cookie: a year
 * long, the whole site, SameSite=Lax (sent on the Blackbaud / Google sign-in
 * redirects back to us), Secure on https. The iOS app's webview loads
 * https://askmyschool.app, so it keeps the cookie like any browser.
 */
export function localeCookie(locale: Locale, { secure = true }: { secure?: boolean } = {}): string {
  return [
    `${LOCALE_COOKIE}=${locale}`,
    "Path=/",
    `Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

