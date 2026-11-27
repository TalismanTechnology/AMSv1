// t() for server and client components alike. Pure: the locale is passed in
// (server: lib/i18n/server.ts, client: useT() in components/i18n).
import { DEFAULT_LOCALE, type Locale } from "./locale";
import { MESSAGES, type MessageKey } from "./messages";

export type { MessageKey } from "./messages";
export type TranslationValues = Record<string, string | number>;
export type Translate = (key: MessageKey, values?: TranslationValues) => string;

/** Replaces each {name} with values.name; unknown placeholders stay as written. */
export function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match
  );
}

/** The string for `key` in `locale`, falling back to English. */
export function translate(locale: Locale, key: MessageKey, values?: TranslationValues): string {
  const template = MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  return interpolate(template, values);
}

export function createTranslator(locale: Locale): Translate {
  return (key, values) => translate(locale, key, values);
}
