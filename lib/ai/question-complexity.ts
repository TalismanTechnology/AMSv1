// Routes a parent's question to how hard the answer model should think.
// Model thinking dominates answer latency (10–13 s to the first token on
// gemini-3.8-flash at its default level), and a one-fact lookup like "When is
// Thanksgiving break?" takes as long as a multi-part question. A short single
// lookup gets a low thinking level; everything else a medium one (the
// provider's default, high, spent 10–11 s thinking on multi-part questions).
// Pure and cheap — no model call — and conservative: anything it isn't sure
// about is "complex".

import type { GoogleLanguageModelOptions } from "@ai-sdk/google";

export type QuestionComplexity = "simple" | "complex";

/** Above this many words a question is never "simple". */
export const SIMPLE_MAX_WORDS = 14;
/** Follow-ups lean on the conversation, so they get a shorter limit. */
export const SIMPLE_FOLLOW_UP_MAX_WORDS = 10;
/** A bare topic ("dress code?", "lunch menu") with no question opener. */
const BARE_TOPIC_MAX_WORDS = 5;

// Openers of a single factual lookup: when / what time / what is / where /
// who / how much… and yes-no checks ("is there school on Friday?").
const LOOKUP_OPENER =
  /^(when|where|who|whom|whose|which|what|what's|whats|how (much|many|long|late|early|often|far|old)|is|are|was|were|do|does|did|can|may|will|has|have)\b/;

// Reasoning, advice, hypotheticals, comparisons, open-ended or aggregate
// asks. Any one of these makes the question complex.
const COMPLEX_MARKERS = [
  /\b(why|how come|explain|explanation|reason|reasons)\b/,
  /\b(compare|comparison|compared|difference|differences|differ|versus|vs)\b/,
  /\b(better|best|worse|worst|prefer|recommend|recommendation|advice|advise|suggest|tips?)\b/,
  /\bshould\b/,
  /\b(would|could|might)\b/,
  /\b(if|unless|suppose|supposing|assuming|assume|hypothetically|otherwise|in case)\b/,
  /\bwhat if\b/,
  /\b(pros|cons|worth|plan|planning|strategy|prepare)\b/,
  /\b(summari[sz]e|summary|overview|everything|list|all|every|each|both|either|any)\b/,
  /\btell me (about|more)\b/,
  /\b(except|besides|instead|other than|rather than)\b/,
  /\b(conflict|conflicts|overlap|overlaps|clash)\b/,
  // Writing rather than looking up.
  /\b(write|draft|compose|rewrite|translate)\b/,
  // A span of the calendar rather than one date.
  /\b(this|next|coming) (week|month|semester|term|year|quarter)\b/,
  /\b(upcoming|coming up|between|until|since|so far|left)\b/,
  // Ask about one's own family that reasons across more than one child.
  /\b(my|our) (kids|children|sons|daughters|twins)\b/,
];

// Spanish has accented letters, which \b doesn't treat as word characters, so
// Spanish cues match on Unicode letter boundaries instead.
function spanish(pattern: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, "u");
}

// "¿Cuándo son las vacaciones de invierno?", "¿A qué hora empiezan las
// clases?", "¿Hay clases el viernes?".
const SPANISH_LOOKUP_OPENER = new RegExp(
  "^(?:cuándo|cuando|dónde|donde|quién|quiénes|quien|cuál|cuáles|cual|qué|que|a qué hora|cuánto|cuánta|cuántos|cuántas|hay|es|son|está|están|habrá|puedo|puede|tiene|tienen|necesito|necesita)(?![\\p{L}\\p{N}])",
  "u"
);

// The Spanish counterparts of COMPLEX_MARKERS.
const SPANISH_COMPLEX_MARKERS = [
  spanish("por qué|porqué|explica|explicar|explíqueme|explicación|razón|razones"),
  spanish("compara|comparar|comparación|diferencia|diferencias|versus"),
  spanish("mejor|mejores|peor|peores|prefiero|recomienda|recomiendan|recomendación|consejo|consejos|sugiere|sugerencia|sugerencias"),
  // Should / must: "¿Qué deben hacer los padres…?"
  spanish("debo|debe|deben|debemos|debería|deberían|deberíamos|tengo que|tienen que|hay que"),
  spanish("podría|podrían|pudiera"),
  spanish("si|a menos que|suponiendo|en caso de|de lo contrario"),
  spanish("qué pasa si|qué pasaría si"),
  spanish("ventajas|desventajas|vale la pena|plan|planear|planificar|preparar|prepararse|prepararnos"),
  spanish("resume|resumir|resumen|todo|todos|todas|lista|cada|ambos|ambas|cualquier|cualquiera"),
  spanish("cuénteme|cuéntame|hábleme|háblame|dígame todo"),
  spanish("excepto|además de|en lugar de|en vez de|aparte de"),
  spanish("conflicto|conflictos|se cruzan|choca|chocan"),
  spanish("escribe|escriba|redacta|redacte|traduce|traduzca|traducir"),
  spanish("(?:esta|la próxima|la siguiente) semana|(?:este|el próximo) (?:mes|semestre|trimestre|año)"),
  spanish("próximos|próximas|entre|hasta|desde|faltan|quedan"),
  spanish("(?:mis|nuestros|nuestras) (?:hijos|hijas|niños|niñas|gemelos)"),
];

// A second question joined to the first: "…y cuáles…", "…además…".
const SPANISH_MULTI_PART = spanish(
  "(?:y|o|pero|además) (?:cómo|qué|cuándo|dónde|quién|por qué|cuál|cuáles|cuánto|cuántos|es|son|hay|puedo|debo|deben)|además|también|otra pregunta"
);

// "mi hijo … y …".
const SPANISH_MY_CHILD_AND = spanish("(?:mi|nuestro|nuestra) (?:hijo|hija|niño|niña|estudiante).*(?<![\\p{L}\\p{N}])y");

// A second question joined to the first: "…and how…", "…also…", "…as well".
const MULTI_PART =
  /\b(and|or|but|plus) (how|what|what's|when|where|who|why|which|is|are|do|does|did|can|should|will|would|could)\b|\b(also|additionally|as well|another question)\b|;/;

// "my child … and …": a question about one's own child that brings in
// something else to reason over.
const MY_CHILD_AND = /\b(my|our) (child|kid|son|daughter|student)\b.*\band\b/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string): number {
  return text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// Abbreviations whose dot doesn't end a sentence ("Mr. Cho's email").
const ABBREVIATIONS = /\b(mr|mrs|ms|dr|st|mt|jr|sr|prof|rev|vs|no|approx|etc|e\.g|i\.e)\./g;

/** More than one question or sentence: "When is it? What should he wear?" */
function hasSeveralSentences(text: string): boolean {
  if ((text.match(/\?/g) ?? []).length > 1) return true;
  // A sentence end followed by more words (". ", "! ", "? ").
  return /[.!?]\s+[\p{L}\p{N}]/u.test(text.replace(ABBREVIATIONS, "$1"));
}

// A conjunction or filler that only ties the question to the conversation:
// "And what about winter break?", "So when is it?". It doesn't add a second
// question, so it is dropped before the multi-part check.
const LEADING_CONNECTIVE = /^(?:(?:and|but|or|so|plus|ok|okay|also)\b[,\s]*)+/;
const SPANISH_LEADING_CONNECTIVE =
  /^(?:(?:y|pero|o|entonces|bueno|pues|ok|okay|también)(?![\p{L}\p{N}])[,\s]*)+/u;

function isSimpleText(text: string, maxWords: number): boolean {
  // "¿" and "¡" only open the sentence: drop them so openers match.
  const q = normalize(text)
    .replace(/[¿¡]/g, "")
    .trim()
    .replace(LEADING_CONNECTIVE, "")
    .replace(SPANISH_LEADING_CONNECTIVE, "")
    .trim();
  if (!q) return false;
  const words = wordCount(q);
  if (words === 0 || words > maxWords) return false;
  if (hasSeveralSentences(q)) return false;
  if (MULTI_PART.test(q) || MY_CHILD_AND.test(q)) return false;
  if (SPANISH_MULTI_PART.test(q) || SPANISH_MY_CHILD_AND.test(q)) return false;
  if (COMPLEX_MARKERS.some((re) => re.test(q))) return false;
  if (SPANISH_COMPLEX_MARKERS.some((re) => re.test(q))) return false;
  // A lookup opener, or a bare topic ("dress code?", "Thanksgiving break dates").
  return LOOKUP_OPENER.test(q) || SPANISH_LOOKUP_OPENER.test(q) || words <= BARE_TOPIC_MAX_WORDS;
}

/**
 * "simple" for a short single factual lookup ("When is Thanksgiving break?",
 * "What's the dress code?"); "complex" for anything else, and whenever unsure.
 *
 * `question` is the parent's question as sent to the provider (children's
 * names redacted). A follow-up must be shorter still, and — when the rewrite
 * turned it into a standalone `searchQuery` — that query must read as simple
 * too: "what about Wednesdays?" is only as simple as what it stands for.
 */
export function classifyQuestion(
  question: string,
  { followUp = false, searchQuery }: { followUp?: boolean; searchQuery?: string } = {}
): QuestionComplexity {
  if (!followUp) return isSimpleText(question, SIMPLE_MAX_WORDS) ? "simple" : "complex";
  if (!isSimpleText(question, SIMPLE_FOLLOW_UP_MAX_WORDS)) return "complex";
  if (searchQuery && searchQuery !== question && !isSimpleText(searchQuery, SIMPLE_MAX_WORDS)) {
    return "complex";
  }
  return "simple";
}

// --------------------------------------------
// What each class gets from the answer model
// --------------------------------------------

export const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
const DEFAULT_SIMPLE_THINKING_LEVEL: ThinkingLevel = "low";
// Medium rather than the provider's default (high): the default spent ~1.4–1.8k
// thinking tokens, 10–11 s before the first word, on multi-part questions.
const DEFAULT_COMPLEX_THINKING_LEVEL: ThinkingLevel = "medium";
/** Env value that sends no thinkingConfig at all — the provider's default. */
export const PROVIDER_DEFAULT = "default";

/**
 * A thinking level from an env value: a known level, "default" for the
 * provider's own default (null — no thinkingConfig), or `fallback` when unset
 * or unrecognised. "default" is the rollback switch: no deploy needed.
 */
export function thinkingLevelSetting(
  value: string | undefined,
  fallback: ThinkingLevel
): ThinkingLevel | null {
  const level = value?.trim().toLowerCase() ?? "";
  if (level === PROVIDER_DEFAULT) return null;
  return (THINKING_LEVELS as readonly string[]).includes(level)
    ? (level as ThinkingLevel)
    : fallback;
}

/** CHAT_SIMPLE_THINKING_LEVEL if it is a known level, else "low". */
export function simpleThinkingLevel(value: string | undefined): ThinkingLevel {
  return thinkingLevelSetting(value, DEFAULT_SIMPLE_THINKING_LEVEL) ?? DEFAULT_SIMPLE_THINKING_LEVEL;
}

/**
 * CHAT_COMPLEX_THINKING_LEVEL: a known level, or "default" for the provider's
 * default (null); unset or unrecognised is "medium".
 */
export function complexThinkingLevel(value: string | undefined): ThinkingLevel | null {
  return thinkingLevelSetting(value, DEFAULT_COMPLEX_THINKING_LEVEL);
}

export interface AnswerSettings {
  complexity: QuestionComplexity;
  modelId: string;
  /** null = the provider's default (no thinkingConfig sent). */
  thinkingLevel: ThinkingLevel | null;
  /** Passed straight to streamText; undefined when the provider's default applies. */
  providerOptions: { google: GoogleLanguageModelOptions } | undefined;
}

function withThinking(
  complexity: QuestionComplexity,
  modelId: string,
  thinkingLevel: ThinkingLevel | null
): AnswerSettings {
  return {
    complexity,
    modelId,
    thinkingLevel,
    providerOptions: thinkingLevel
      ? { google: { thinkingConfig: { thinkingLevel } } }
      : undefined,
  };
}

/**
 * The answer model and thinking level for a question. Complex questions use
 * `defaultModelId` at a medium thinking level (CHAT_COMPLEX_THINKING_LEVEL;
 * "default" restores the old call with no provider options). Simple ones
 * keep the same model (its citation discipline is what was evaluated) unless
 * CHAT_SIMPLE_MODEL names another, with a low thinking level
 * (CHAT_SIMPLE_THINKING_LEVEL). Thoughts are never included in the output.
 */
export function answerSettings(
  complexity: QuestionComplexity,
  defaultModelId: string,
  env: Record<string, string | undefined> = process.env
): AnswerSettings {
  if (complexity === "complex") {
    return withThinking(
      complexity,
      defaultModelId,
      complexThinkingLevel(env.CHAT_COMPLEX_THINKING_LEVEL)
    );
  }
  return withThinking(
    complexity,
    env.CHAT_SIMPLE_MODEL?.trim() || defaultModelId,
    simpleThinkingLevel(env.CHAT_SIMPLE_THINKING_LEVEL)
  );
}
