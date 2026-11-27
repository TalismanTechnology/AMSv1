"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, localeCookie, type Locale } from "@/lib/i18n/locale";
import { createTranslator, type Translate } from "@/lib/i18n/translate";

interface LocaleContextValue {
  locale: Locale;
  t: Translate;
  /** Saves the choice in the ams_locale cookie and re-renders server strings. */
  setLocale: (locale: Locale) => void;
}

// Outside a provider (admin pages, tests) everything renders in English.
const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  t: createTranslator(DEFAULT_LOCALE),
  setLocale: () => {},
});

/**
 * The parent-facing UI language. `initialLocale` comes from the server
 * (lib/i18n/server.ts) so the first paint is already in the right language.
 * Switching updates client strings at once and refreshes the route so server
 * components follow — no sign-out, no full reload.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // A server render with a different locale (another tab switched) wins.
  const [seenInitial, setSeenInitial] = useState(initialLocale);
  if (seenInitial !== initialLocale) {
    setSeenInitial(initialLocale);
    setLocaleState(initialLocale);
  }

  // The root layout is static and says lang="en"; parent pages set it here
  // so screen readers and the iOS keyboard pick up Spanish.
  useEffect(() => {
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = DEFAULT_LOCALE;
    };
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = localeCookie(next, { secure: window.location.protocol === "https:" });
      setLocaleState(next);
      router.refresh();
    },
    [router]
  );

  const value = useMemo(
    () => ({ locale, t: createTranslator(locale), setLocale }),
    [locale, setLocale]
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** t() for client components: English outside a LocaleProvider. */
export function useT(): Translate {
  return useContext(LocaleContext).t;
}
