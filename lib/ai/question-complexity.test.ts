import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerSettings,
  classifyQuestion,
  simpleThinkingLevel,
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
  assert.equal(classifyQuestion("And what about lunch?", { followUp: true }), "complex");
  assert.equal(classifyQuestion("Why?", { followUp: true }), "complex");
  assert.equal(classifyQuestion("Should we go?", { followUp: true }), "complex");
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

test("complex questions get exactly the default call", () => {
  const s = answerSettings("complex", "gemini-x", {
    CHAT_SIMPLE_THINKING_LEVEL: "minimal",
    CHAT_SIMPLE_MODEL: "other-model",
  });
  assert.deepEqual(s, {
    complexity: "complex",
    modelId: "gemini-x",
    thinkingLevel: null,
    providerOptions: undefined,
  });
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
