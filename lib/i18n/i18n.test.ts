import test from "node:test";
import assert from "node:assert/strict";

import { MESSAGES, en, es } from "./messages";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  localeCookie,
  localeFromAcceptLanguage,
  parseLocale,
  resolveLocale,
} from "./locale";
import { createTranslator, interpolate, translate, type MessageKey } from "./translate";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<\/?(\w+)>/g)].map((m) => m[0]).sort();

test("every English key has a Spanish translation, and Spanish has no extra keys", () => {
  const enKeys = Object.keys(en).sort();
  const esKeys = Object.keys(es).sort();
  assert.deepEqual(esKeys, enKeys);
  assert.ok(enKeys.length > 100, `expected the parent UI to be covered, got ${enKeys.length} keys`);
});

test("no empty or placeholder strings in either language", () => {
  for (const [locale, messages] of Object.entries(MESSAGES)) {
    for (const [key, value] of Object.entries(messages)) {
      assert.equal(typeof value, "string", `${locale}:${key}`);
      assert.ok(value.trim().length > 0, `${locale}:${key} is empty`);
      assert.ok(!/^(placeholder|marcador|TODO|TBD)$/i.test(value.trim()), `${locale}:${key}`);
    }
  }
});

test("interpolation placeholders and inline tags match between English and Spanish", () => {
  for (const key of Object.keys(en) as MessageKey[]) {
    assert.deepEqual(placeholders(es[key]), placeholders(en[key]), `placeholders differ for ${key}`);
    assert.deepEqual(tags(es[key]), tags(en[key]), `tags differ for ${key}`);
  }
});

test("Spanish strings are actually translated (not copied English) for most keys", () => {
  const keys = Object.keys(en) as MessageKey[];
  const same = keys.filter((k) => es[k] === en[k]);
  // Names and labels like "Google Calendar", "Email", "English" may stay as they are.
  assert.ok(same.length / keys.length < 0.1, `too many untranslated strings: ${same.join(", ")}`);
});

test("translate() fills placeholders and falls back to English", () => {
  assert.equal(interpolate("Hi {name}, {n} new", { name: "Ana", n: 3 }), "Hi Ana, 3 new");
  assert.equal(interpolate("Hi {name}", {}), "Hi {name}");
  assert.equal(translate("es", "common.language"), "Idioma");
  assert.equal(translate("en", "common.language"), "Language");
  assert.equal(createTranslator("es")("common.switchLanguage"), "Cambiar idioma");
});

test("parseLocale accepts only supported locales", () => {
  assert.equal(parseLocale("es"), "es");
  assert.equal(parseLocale(" EN "), "en");
  assert.equal(parseLocale("fr"), null);
  assert.equal(parseLocale("es-MX"), null);
  assert.equal(parseLocale(undefined), null);
});

test("Accept-Language: es* means Spanish, by q-value", () => {
  assert.equal(localeFromAcceptLanguage("es-MX,es;q=0.9,en;q=0.8"), "es");
  assert.equal(localeFromAcceptLanguage("es-419"), "es");
  assert.equal(localeFromAcceptLanguage("en-US,en;q=0.9,es;q=0.8"), "en");
  assert.equal(localeFromAcceptLanguage("fr-FR,es;q=0.7,en;q=0.5"), "es");
  assert.equal(localeFromAcceptLanguage("en;q=0.3,es;q=0.9"), "es");
  assert.equal(localeFromAcceptLanguage("fr-FR,de"), null);
  assert.equal(localeFromAcceptLanguage("es;q=0"), null);
  assert.equal(localeFromAcceptLanguage(""), null);
  assert.equal(localeFromAcceptLanguage(null), null);
});

test("locale resolution: cookie, then profile, then Accept-Language, then English", () => {
  assert.equal(resolveLocale({ cookie: "es", acceptLanguage: "en-US" }), "es");
  assert.equal(resolveLocale({ cookie: "en", acceptLanguage: "es-MX" }), "en");
  assert.equal(resolveLocale({ cookie: "xx", acceptLanguage: "es-MX" }), "es");
  assert.equal(resolveLocale({ profile: "es", acceptLanguage: "en-US" }), "es");
  assert.equal(resolveLocale({ cookie: "en", profile: "es" }), "en");
  assert.equal(resolveLocale({ acceptLanguage: "es-US,es;q=0.9" }), "es");
  assert.equal(resolveLocale({ acceptLanguage: "fr" }), DEFAULT_LOCALE);
  assert.equal(resolveLocale({}), "en");
});

test("the locale cookie lasts a year, site-wide, SameSite=Lax", () => {
  assert.equal(LOCALE_COOKIE, "ams_locale");
  assert.equal(LOCALE_COOKIE_MAX_AGE_SECONDS, 31536000);
  assert.equal(localeCookie("es"), "ams_locale=es; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  assert.equal(localeCookie("en", { secure: false }), "ams_locale=en; Path=/; Max-Age=31536000; SameSite=Lax");
});
