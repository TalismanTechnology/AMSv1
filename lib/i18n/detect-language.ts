// Which language a parent wrote a chat message in: English or Spanish. Pure,
// deterministic and cheap (no model call), so it adds nothing to an English
// question's latency.
//
// A message is scored on Spanish signals (¿ ¡, ñ and accented words, common
// Spanish words) against English ones (common English words, an English
// question opener). Words capitalised mid-sentence are skipped as likely
// names ("When is Día de los Muertos?" is still English). Messages too short
// to tell ("ok", "gracias", "thanks") take the language of the parent's
// earlier messages, then the UI language, then English.

import type { Locale } from "./locale";

export type DetectionStrength = "strong" | "weak";

export interface MessageLanguage {
  /** null: no signal either way ("ok", "8th grade?"). */
  language: Locale | null;
  strength: DetectionStrength | null;
  scores: { es: number; en: number };
}

// Only words that are not also everyday English (no "a", "no", "me", "son",
// "has", "come", "solo"), so a one-word overlap can't tip an English message.
const SPANISH_WORDS = new Set(
  `el la los las un una unos unas de del al en y con sin por para que qué se lo le les su sus mi mis tu tus
  nuestro nuestra nuestros nuestras usted ustedes yo ellos ellas es está están estan esta este estos estas
  ese esa eso esto hay ser estar hacer hace tiene tienen tengo puedo puede pueden necesito quiero saber
  debo debe deben debería deberían hijo hija hijos hijas niño niña niños niñas escuela colegio clase clases
  padres maestro maestra maestros grado día días semana mes año hoy mañana ayer hora horario fecha fechas
  límite cuándo cuando dónde donde cómo como cuál cuáles cuánto cuánta cuántos cuántas quién quiénes porque
  lunes martes miércoles jueves viernes sábado domingo vacaciones invierno verano primavera otoño
  almuerzo uniforme recoger salida entrada transporte autobús excursión reunión tarea tareas pago pagar
  cuesta costo hola gracias buenos buenas tardes noches favor también pero más muy otro otra otros otras
  todos todas sobre hasta desde entre antes después empiezan comienzan terminan termina sí dime cuéntame`
    .split(/\s+/)
    .filter(Boolean)
);

const ENGLISH_WORDS = new Set(
  `the an of and is are was were be been what what's whats when when's where where's how who whom why which
  do does did don't doesn't my your our their for to in on at with about from by there it it's this that
  these those can could will would should i i'm you we they them he she school time day days week month
  year today tomorrow yesterday thanks thank please hi hello yes kids kid child children daughter grade
  break start starts end ends pick pickup get need any or if not am much many lunch next last
  monday tuesday wednesday thursday friday saturday sunday teacher class classes parents`
    .split(/\s+/)
    .filter(Boolean)
);

const ENGLISH_OPENER =
  /^(what|what's|whats|when|when's|where|where's|how|who|why|which|is|are|do|does|did|can|could|will|would|should|was|were)$/;

const ACCENTED = /[áéíóúüñ]/;
const LETTER = /\p{L}/u;

/** Words with their position, punctuation trimmed. */
function tokenize(text: string): { word: string; raw: string; sentenceStart: boolean }[] {
  const cleaned = text
    // A redacted child ("[your 8th Grade child]") or a citation is never the parent's language.
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[’‘]/g, "'");
  const tokens: { word: string; raw: string; sentenceStart: boolean }[] = [];
  let sentenceStart = true;
  for (const piece of cleaned.split(/\s+/)) {
    if (!piece) continue;
    const raw = piece.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
    if (raw && LETTER.test(raw)) {
      // "¿" and "¡" open a sentence too.
      tokens.push({ word: raw.toLowerCase(), raw, sentenceStart: sentenceStart || /^[¿¡]/.test(piece) });
      sentenceStart = false;
    }
    if (/[.!?:]$/.test(piece)) sentenceStart = true;
  }
  return tokens;
}

/** Scores one message on its own. */
export function detectMessageLanguage(text: string): MessageLanguage {
  const tokens = tokenize(text);
  let es = 0;
  let en = 0;
  const esWords = new Set<string>();
  const enWords = new Set<string>();
  // ¿ and ¡ are only ever Spanish.
  const invertedMarks = /[¿¡]/.test(text);
  if (invertedMarks) es += 2;
  let spanishLetters = false;

  tokens.forEach(({ word, raw, sentenceStart }, i) => {
    // A capitalised word mid-sentence is most likely a name ("Día de los
    // Muertos", "Mr. Alvarez", "Lower School"); "I" is the exception.
    if (!sentenceStart && /^\p{Lu}/u.test(raw) && word !== "i" && word !== "i'm") return;
    if (SPANISH_WORDS.has(word) || ACCENTED.test(word)) {
      es += 1;
      esWords.add(word);
      if (ACCENTED.test(word)) spanishLetters = true;
    } else if (ENGLISH_WORDS.has(word)) {
      en += 1;
      enWords.add(word);
      if (i === 0 && ENGLISH_OPENER.test(word)) en += 1;
    }
  });

  const scores = { es, en };
  if (es === en) return { language: null, strength: null, scores };
  const language: Locale = es > en ? "es" : "en";
  const winner = Math.max(es, en);
  const loser = Math.min(es, en);
  const distinct = language === "es" ? esWords.size : enWords.size;
  // Strong: two or more distinct words and a clear margin, or unmistakably
  // Spanish punctuation/letters with Spanish ahead.
  const strong =
    (distinct >= 2 && winner - loser >= 2) ||
    (language === "es" && (invertedMarks || spanishLetters) && winner - loser >= 1);
  return { language, strength: strong ? "strong" : "weak", scores };
}

/**
 * The language to answer the latest message in.
 *
 * - The latest message decides when it clearly reads as one language, so a
 *   Spanish follow-up stays Spanish and an English question after Spanish
 *   switches back to English.
 * - A short or unclear message ("ok", "gracias", "y el 8?") takes the
 *   language of the most recent earlier message that was clear.
 * - Then the message's own weak lean, then the UI language, then English.
 *
 * `previousUserMessages` are the parent's earlier messages, oldest first.
 */
export function detectChatLanguage({
  latest,
  previousUserMessages = [],
  uiLocale,
}: {
  latest: string;
  previousUserMessages?: string[];
  uiLocale?: Locale | null;
}): Locale {
  const own = detectMessageLanguage(latest);
  if (own.strength === "strong") return own.language!;

  for (let i = previousUserMessages.length - 1; i >= 0; i--) {
    const earlier = detectMessageLanguage(previousUserMessages[i]);
    if (earlier.strength === "strong") return earlier.language!;
  }
  for (let i = previousUserMessages.length - 1; i >= 0; i--) {
    const earlier = detectMessageLanguage(previousUserMessages[i]);
    if (earlier.language) return earlier.language;
  }
  if (own.language) return own.language;
  return uiLocale ?? "en";
}
