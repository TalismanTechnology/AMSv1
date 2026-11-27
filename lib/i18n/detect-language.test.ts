import test from "node:test";
import assert from "node:assert/strict";

import { detectChatLanguage, detectMessageLanguage } from "./detect-language";

const lang = (text: string) => detectMessageLanguage(text).language;
const strength = (text: string) => detectMessageLanguage(text).strength;

test("Spanish questions are Spanish, with or without accents and ¿", () => {
  for (const q of [
    "¿Cuándo son las vacaciones de invierno?",
    "Cuando es el picnic",
    "¿Qué deben hacer los padres de 8.º grado antes de las vacaciones y cuáles son las fechas límite?",
    "Necesito el número de la enfermera",
    "Que hay para el almuerzo hoy",
    "Mi hija está en Lower School, ¿a qué hora sale?",
    "¿[your 8th Grade child] tiene clases mañana?",
  ]) {
    assert.equal(lang(q), "es", q);
    assert.equal(strength(q), "strong", q);
  }
});

test("English questions are English", () => {
  for (const q of [
    "When is winter break?",
    "Is there school on Friday?",
    "What about Wednesdays?",
    "Tell me about the lunch menu",
    "My son is in 8th grade, when are exams?",
    // Spanish words inside an English question don't flip it.
    "What is the horario for el viernes?",
  ]) {
    assert.equal(lang(q), "en", q);
    assert.equal(strength(q), "strong", q);
  }
});

test("names capitalised mid-sentence don't count as Spanish", () => {
  assert.notEqual(lang("When is Día de los Muertos celebrated?"), "es");
  assert.equal(
    detectChatLanguage({ latest: "When does Escuela Primavera Club meet?" }),
    "en"
  );
});

test("short or neutral messages carry no strong signal", () => {
  for (const q of ["ok", "8th grade?", "dress code", "gracias", "thanks", "Hola", "👍"]) {
    assert.notEqual(strength(q), "strong", q);
  }
  assert.equal(lang("ok"), null);
  assert.equal(lang("dress code"), null);
});

test("an ambiguous message inherits the language of the parent's earlier messages", () => {
  const spanishHistory = ["¿Cuándo es el picnic de primavera?"];
  const englishHistory = ["When is the spring picnic?"];
  assert.equal(detectChatLanguage({ latest: "ok", previousUserMessages: spanishHistory }), "es");
  assert.equal(detectChatLanguage({ latest: "thanks", previousUserMessages: spanishHistory }), "es");
  assert.equal(detectChatLanguage({ latest: "8th grade?", previousUserMessages: spanishHistory }), "es");
  assert.equal(detectChatLanguage({ latest: "gracias", previousUserMessages: englishHistory }), "en");
  assert.equal(detectChatLanguage({ latest: "ok", previousUserMessages: englishHistory }), "en");
  // The most recent clear message wins.
  assert.equal(
    detectChatLanguage({ latest: "ok", previousUserMessages: [...englishHistory, ...spanishHistory] }),
    "es"
  );
  assert.equal(
    detectChatLanguage({ latest: "ok", previousUserMessages: [...spanishHistory, ...englishHistory] }),
    "en"
  );
});

test("a Spanish follow-up stays Spanish; an English question after Spanish switches back", () => {
  const history = ["¿Cuándo son las vacaciones de invierno?"];
  assert.equal(detectChatLanguage({ latest: "¿y el viernes?", previousUserMessages: history }), "es");
  assert.equal(detectChatLanguage({ latest: "y el viernes?", previousUserMessages: history }), "es");
  assert.equal(
    detectChatLanguage({ latest: "When does the spring concert start?", previousUserMessages: history }),
    "en"
  );
  assert.equal(
    detectChatLanguage({
      latest: "¿Y a qué hora empieza?",
      previousUserMessages: ["When is the spring concert?"],
    }),
    "es"
  );
});

test("with no history, an ambiguous message uses its own lean, then the UI language, then English", () => {
  assert.equal(detectChatLanguage({ latest: "gracias" }), "es");
  assert.equal(detectChatLanguage({ latest: "thanks", uiLocale: "es" }), "en");
  assert.equal(detectChatLanguage({ latest: "ok", uiLocale: "es" }), "es");
  assert.equal(detectChatLanguage({ latest: "ok", uiLocale: "en" }), "en");
  assert.equal(detectChatLanguage({ latest: "ok" }), "en");
  assert.equal(detectChatLanguage({ latest: "" }), "en");
  // A clear message ignores the UI language.
  assert.equal(detectChatLanguage({ latest: "When is winter break?", uiLocale: "es" }), "en");
  assert.equal(detectChatLanguage({ latest: "¿Cuándo es la graduación?", uiLocale: "en" }), "es");
});
