import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./locale";
import { createTranslator, type Translate } from "./translate";

/**
 * The parent-facing UI language for this request: the ams_locale cookie (the
 * toggle), else Accept-Language, else English. Reading cookies/headers makes
 * the page dynamic — only call it from pages that already are (signed-in
 * parent pages, the school login page).
 */
export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });
}

export async function getTranslator(): Promise<{ locale: Locale; t: Translate }> {
  const locale = await getLocale();
  return { locale, t: createTranslator(locale) };
}
