import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerSettings,
  classifyQuestion,
  complexThinkingLevel,
  simpleThinkingLevel,
  thinkingLevelSetting,
} from "./question-complexity";

const SIMPLE = [
  "When is Thanksgiving break?",
  "What's the dress code?",
  "What’s the dress code?",
  "What time does school start?",
  "What time does school start tomorrow?",
  "Where is the lost and found?",
  "Who is the 5th grade teacher?",
  "How much is the lunch program?",
  "How many days of school are in the year",
  "Is there school on Friday?",
  "When is the spring concert?",
  "What is the phone number for the front office?",
  "When does 3rd grade get out on Wednesdays?",
  "dress code",
  "Lunch menu?",
  "Thanksgiving break dates",
  "What time is drop-off and pick-up?",
  "What is Mr. Cho's email address?",
  "When does Dr. Patel hold office hours?",
];

const COMPLEX = [
  // Multi-part
  "When is Thanksgiving break and what time is dismissal the day before?",
  "What's the dress code? Also, when are picture days?",
  "When is the concert? What should he wear?",
  "What time does school start and how do I report an absence?",
  "When is the field trip; is lunch provided?",
  "Where do I drop off, and is there aftercare?",
  // Reasoning / advice / hypotheticals
  "Why is school closed on Monday?",
  "Explain the attendance policy",
  "Compare the lunch plans",
  "What's the difference between the two lunch plans?",
  "Should I sign up for aftercare?",
  "What if my child misses the bus?",
  "What happens if my child is sick on test day?",
  "Can my child bring a phone if she rides the bus?",
  "Would my son need a permission slip?",
  "What's the best way to contact the teacher?",
  // My child … and …
  "My daughter has a dentist appointment and soccer, when should she leave?",
  "Do my kids have the same half days?",
  // Aggregates and calendar spans
  "What's happening this week?",
  "Are there any half days in November?",
  "List all the early dismissal days",
  "Tell me about the after school program",
  "What events are coming up?",
  "How many school days are left until winter break?",
  // Writing rather than looking up
  "Write an email to the teacher",
  "Can you draft an absence note?",
  // Long
  "Can you tell me what time the school day starts for the lower school students on a normal day",
  // Empty
  "",
  "   ",
];

test("short single lookups are simple", () => {
  for (const q of SIMPLE) assert.equal(classifyQuestion(q), "simple", q);
});

test("multi-part, reasoning, aggregate and long questions are complex", () => {
  for (const q of COMPLEX) assert.equal(classifyQuestion(q), "complex", q);
});

test("the word limit is inclusive at 14 words", () => {
  const fourteen = "What time does the lower school carpool line open on a normal school morning";
  assert.equal(fourteen.split(" ").length, 14);
  assert.equal(classifyQuestion(fourteen), "simple");
  const fifteen = "What time does the lower school carpool line open on a normal school day morning";
  assert.equal(fifteen.split(" ").length, 15);
  assert.equal(classifyQuestion(fifteen), "complex");
});

test("a short follow-up is simple when its rewrite is too", () => {
  assert.equal(
    classifyQuestion("What about Wednesdays?", {
      followUp: true,
      searchQuery: "What time does school start on Wednesdays?",
    }),
    "simple"
  );
  assert.equal(classifyQuestion("When is it?", { followUp: true }), "simple");
  // Not rewritten: the question itself is the query.
  assert.equal(
    classifyQuestion("When is picture day?", { followUp: true, searchQuery: "When is picture day?" }),
    "simple"
  );
});

test("a follow-up whose rewrite is complex is complex", () => {
  assert.equal(
    classifyQuestion("What about 8th grade?", {
      followUp: true,
      searchQuery: "What is the dress code for 8th grade and how does it differ from 7th grade?",
    }),
    "complex"
  );
});

test("follow-ups get a shorter word limit", () => {
  const q = "What time does the carpool line open on a normal morning";
  assert.equal(q.split(" ").length, 11);
  assert.equal(classifyQuestion(q), "simple");
  assert.equal(classifyQuestion(q, { followUp: true }), "complex");
});

test("a follow-up chaining another question is complex", () => {
  assert.equal(classifyQuestion("What about lunch and what about recess?", { followUp: true }), "complex");
  assert.equal(classifyQuestion("Why?", { followUp: true }), "complex");
  assert.equal(classifyQuestion("Should we go?", { followUp: true }), "complex");
});

test("a leading 'and' / 'so' only ties a follow-up to the conversation", () => {
  // Classified complex in production (Nov 19 2026) and thought for 6.4 s.
  assert.equal(
    classifyQuestion("And what about winter break?", {
      followUp: true,
      searchQuery: "When is winter break?",
    }),
    "simple"
  );
  assert.equal(classifyQuestion("And what about lunch?", { followUp: true }), "simple");
  assert.equal(classifyQuestion("So when is it?", { followUp: true }), "simple");
  assert.equal(classifyQuestion("Ok, and what time?", { followUp: true }), "simple");
  // Still complex when what follows is.
  assert.equal(classifyQuestion("And why is that?", { followUp: true }), "complex");
  assert.equal(
    classifyQuestion("And what about winter break?", {
      followUp: true,
      searchQuery: "What are all the key dates and deadlines before winter break?",
    }),
    "complex"
  );
  assert.equal(classifyQuestion("And when is it, and what should he wear?"), "complex");
});

test("the simple thinking level is validated, defaulting to low", () => {
  assert.equal(simpleThinkingLevel(undefined), "low");
  assert.equal(simpleThinkingLevel(""), "low");
  assert.equal(simpleThinkingLevel("bogus"), "low");
  assert.equal(simpleThinkingLevel("0"), "low");
  assert.equal(simpleThinkingLevel("minimal"), "minimal");
  assert.equal(simpleThinkingLevel(" Medium "), "medium");
  assert.equal(simpleThinkingLevel("high"), "high");
});

test("thinking-level env values: a level, 'default' (provider default), or the fallback", () => {
  assert.equal(thinkingLevelSetting(undefined, "medium"), "medium");
  assert.equal(thinkingLevelSetting("", "medium"), "medium");
  assert.equal(thinkingLevelSetting("nope", "medium"), "medium");
  assert.equal(thinkingLevelSetting(" LOW ", "medium"), "low");
  assert.equal(thinkingLevelSetting("default", "medium"), null);
  assert.equal(thinkingLevelSetting(" Default ", "low"), null);
  assert.equal(complexThinkingLevel(undefined), "medium");
  assert.equal(complexThinkingLevel("high"), "high");
  assert.equal(complexThinkingLevel("default"), null);
  // The simple level never falls back to the provider default.
  assert.equal(simpleThinkingLevel("default"), "low");
});

test("complex questions think at medium by default, on the default model", () => {
  const s = answerSettings("complex", "gemini-x", {
    CHAT_SIMPLE_THINKING_LEVEL: "minimal",
    CHAT_SIMPLE_MODEL: "other-model",
  });
  assert.deepEqual(s, {
    complexity: "complex",
    modelId: "gemini-x",
    thinkingLevel: "medium",
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "medium" } } },
  });
});

test("CHAT_COMPLEX_THINKING_LEVEL overrides, and 'default' restores the old call", () => {
  assert.deepEqual(
    answerSettings("complex", "gemini-x", { CHAT_COMPLEX_THINKING_LEVEL: "low" }).providerOptions,
    { google: { thinkingConfig: { thinkingLevel: "low" } } }
  );
  assert.deepEqual(answerSettings("complex", "gemini-x", { CHAT_COMPLEX_THINKING_LEVEL: "default" }), {
    complexity: "complex",
    modelId: "gemini-x",
    thinkingLevel: null,
    providerOptions: undefined,
  });
  // Unrecognised → medium, never an invalid level sent to the provider.
  assert.equal(
    answerSettings("complex", "gemini-x", { CHAT_COMPLEX_THINKING_LEVEL: "max" }).thinkingLevel,
    "medium"
  );
  // The simple level is independent.
  assert.equal(
    answerSettings("simple", "gemini-x", { CHAT_COMPLEX_THINKING_LEVEL: "default" }).thinkingLevel,
    "low"
  );
});

test("simple questions keep the model and think low, without thoughts in the output", () => {
  const s = answerSettings("simple", "gemini-x", {});
  assert.equal(s.modelId, "gemini-x");
  assert.equal(s.thinkingLevel, "low");
  assert.deepEqual(s.providerOptions, { google: { thinkingConfig: { thinkingLevel: "low" } } });
  assert.equal(s.providerOptions?.google.thinkingConfig?.includeThoughts, undefined);
});

test("simple-question env overrides", () => {
  const s = answerSettings("simple", "gemini-x", {
    CHAT_SIMPLE_THINKING_LEVEL: "minimal",
    CHAT_SIMPLE_MODEL: " gemini-y ",
  });
  assert.equal(s.modelId, "gemini-y");
  assert.equal(s.thinkingLevel, "minimal");
  assert.deepEqual(s.providerOptions, { google: { thinkingConfig: { thinkingLevel: "minimal" } } });
  assert.equal(answerSettings("simple", "gemini-x", { CHAT_SIMPLE_MODEL: "  " }).modelId, "gemini-x");
  assert.equal(
    answerSettings("simple", "gemini-x", { CHAT_SIMPLE_THINKING_LEVEL: "nope" }).thinkingLevel,
    "low"
  );
});

test("Spanish: a single lookup is simple, a multi-part or should-question is complex", () => {
  for (const q of [
    "¿Cuándo son las vacaciones de invierno?",
    "¿A qué hora empiezan las clases?",
    "¿Hay clases el viernes?",
    "¿Dónde está la oficina?",
    "¿Cuál es el código de vestimenta?",
    "uniforme",
  ]) {
    assert.equal(classifyQuestion(q), "simple", q);
  }
  for (const q of [
    "¿Qué deben hacer los padres de 8.º grado antes de las vacaciones y cuáles son las fechas límite?",
    "¿Por qué cierran temprano el viernes?",
    "¿Qué debo llevar a la excursión?",
    "¿Qué pasa si mi hijo llega tarde?",
    "¿Cuál es la diferencia entre el uniforme de verano y el de invierno?",
    "¿Qué eventos hay esta semana?",
    "Cuénteme sobre el programa de después de clases",
    "¿Cuándo es la graduación? ¿Dónde será?",
    "¿Cuándo empiezan las clases y cómo me inscribo?",
    "Resuma todas las fechas de exámenes",
    "¿Mis hijos tienen clases el lunes?",
  ]) {
    assert.equal(classifyQuestion(q), "complex", q);
  }
});

test("Spanish follow-ups: leading connectives are dropped, the search query must be simple too", () => {
  assert.equal(
    classifyQuestion("¿Y el viernes?", { followUp: true, searchQuery: "Is there school on Friday?" }),
    "simple"
  );
  assert.equal(
    classifyQuestion("¿Y el viernes?", {
      followUp: true,
      searchQuery: "What should parents prepare for Friday and what are the deadlines?",
    }),
    "complex"
  );
});

test("Spanish complex questions get CHAT_COMPLEX_THINKING_LEVEL like English ones", () => {
  const complex = classifyQuestion(
    "¿Qué deben hacer los padres de 8.º grado antes de las vacaciones y cuáles son las fechas límite?"
  );
  assert.equal(answerSettings(complex, "gemini-3.8-flash", { CHAT_COMPLEX_THINKING_LEVEL: "low" }).thinkingLevel, "low");
});
