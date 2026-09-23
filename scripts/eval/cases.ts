/**
 * Golden questions for the chat eval, drawn from what parents actually asked
 * the demo school (analytics_events). Expected answers were written from the
 * demo documents and calendar, not from model output — so a case failing means
 * the answer is wrong, not merely different.
 *
 * Dates are relative to EVAL_NOW in eval-chat.ts (Wed 23 Sep 2026).
 */

export interface EvalCase {
  id: string;
  /** Earlier turns, oldest first. The eval question is the final user turn. */
  history?: { role: "user" | "assistant"; text: string }[];
  question: string;
  children?: { name: string; grade: string }[];
  /** What a correct answer says — handed to the judge as ground truth. */
  expected: string;
  /** Substrings of document titles that retrieval must surface. */
  expectDocs?: string[];
  /** Every pattern must appear in the answer. */
  mustMatch?: RegExp[];
  /** No pattern may appear in the answer. */
  mustNotMatch?: RegExp[];
}

export const CASES: EvalCase[] = [
  // --- Contact lookups (directory pages embeddings under-rank) ---
  {
    id: "ms-dean",
    question: "who is the middle school dean of students",
    expected: "Nikki Solyom. Giving her number, (212) 812-8674, is a plus but not required.",
    expectDocs: ["MSHandbook"],
    mustMatch: [/Solyom/],
  },
  {
    id: "sick-who-to-call",
    question: "who do I call if my son is sick",
    expected:
      "Middle School: call the MS administrative assistant (Luisa Carrizo) at (212) 812-8558 or the nurse at (212) 812-8536 by 8:00 am and email the advisor. Dr. Jones's orientation email says to call or email Luisa Carrizo (lcarrizo@collegiateschool.org) before 8:30 am. The two sources give different cut-off times; a strong answer notices it or picks the handbook while mentioning Carrizo. May note the documents found are Middle School specific.",
    expectDocs: ["MSHandbook"],
    mustMatch: [/812-8558|lcarrizo@/],
  },
  {
    id: "sick-then-nurse",
    history: [
      { role: "user", text: "who do I call if my son is sick" },
      {
        role: "assistant",
        text: "Call the Middle School administrative assistant, Luisa Carrizo, at (212) 812-8558 before 8:00 am and email your son's advisor.",
      },
    ],
    question: "what about the nurse",
    expected: "The nurse is Sharon McGahan, (212) 812-8536.",
    expectDocs: ["MSHandbook"],
    mustMatch: [/812-8536/],
  },
  {
    id: "late-email",
    question: "who do i email when my middle school son is late?",
    expected:
      "Luisa Carrizo at lcarrizo@collegiateschool.org (from the orientation email). The MS handbook also says to call (212) 812-8558 and email the advisor.",
    mustMatch: [/lcarrizo@collegiateschool\.org/i],
  },
  {
    id: "main-office-number",
    question: "what is the number of the main office",
    expected:
      "The documents give the Middle School Office number, (212) 812-8558 (8th floor, 8:00 am–4:30 pm). No separate main-office switchboard number is listed; the answer should say so rather than invent one.",
    mustMatch: [/812-8558/],
  },
  {
    id: "contact-teacher",
    question: "How do I contact my child's teacher?",
    expected:
      "Email them. Collegiate addresses are first initial + full last name @collegiateschool.org (MS handbook, Contacting Teachers). Addresses are also on Connect; the advisor is the first point of contact.",
    expectDocs: ["MSHandbook"],
    mustMatch: [/collegiateschool\.org/i],
  },
  {
    id: "teacher-not-in-docs",
    question: "What is Mr. Cho's email address?",
    expected:
      "No Mr. Cho appears in the documents, so his address is not available. Explaining the documented address format or pointing to Connect is fine; stating a specific address as fact is not.",
    mustNotMatch: [/\b\w*cho@collegiateschool\.org/i],
  },

  // --- Policies ---
  {
    id: "smartwatch",
    question: "is my student allowed to use smart watches during the day",
    expected:
      "No. Middle School students leave phones and smart watches with their homeroom teacher or in the MS office from 8:00 am to 3:20 pm; the orientation email also says devices incl. smartwatches are stored during the day.",
    expectDocs: ["MSHandbook"],
    mustMatch: [/3:20/],
  },
  {
    id: "dress-code",
    question: "what is the dress code?",
    expected:
      "Collared shirt; long pants (slacks/jeans) or cargo/golf/khaki shorts; socks and shoes; ties in the winter term. No hats, sweatpants, gym shorts, sandals/flip-flops. Middle and Upper School handbooks both have near-identical codes.",
    mustMatch: [/collared/i],
  },
  {
    id: "winter-dress-code",
    question: "when does the winter dress code begin",
    expected:
      "Ties are required during the winter term, but the documents don't give a start date for it. The answer must not invent a date.",
  },
  {
    id: "smart-casual",
    question: 'What exactly does "Smart Casual" entail?',
    expected:
      "The documents don't define 'smart casual'. The honest answer says so (it may summarise the actual dress code instead) and must not invent a definition presented as school policy.",
  },

  // --- Calendar ---
  {
    id: "winter-break",
    question: "when does winter break start and end",
    expected:
      "Monday December 21, 2026 through Friday January 1, 2027 (begins after the Winter Program on December 18); classes resume Monday January 4.",
    mustMatch: [/December 21/, /January 1\b/],
  },
  {
    id: "spring-break",
    question: "how long is spring break this year?",
    expected:
      "Spring Recess runs Monday March 15 through Friday March 26, 2027 (two weeks); classes resume Monday March 29.",
    mustMatch: [/March 15/, /March 26/],
  },
  {
    id: "yom-kippur-past",
    question: "do we have a holiday for yom kippur?",
    expected:
      "Yes — school was closed Monday September 21, 2026. Since today is September 23, that date has already passed; a good answer makes that clear.",
    mustMatch: [/September 21/],
  },
  {
    id: "lunar-new-year",
    question: "is the chinese new year a day off?",
    expected:
      "It is not listed as a closure on the school calendar. The answer must not claim it is a day off.",
  },
  {
    id: "eid",
    question: "do we have eid off",
    expected: "Yes — school is closed Tuesday March 9, 2027.",
    mustMatch: [/March 9/],
  },
  {
    id: "kindergarten-start",
    question: "when do classes begin for kindergarteners",
    expected: "Friday September 11, 2026 (already passed as of today).",
    mustMatch: [/September 11/],
  },

  // --- New faculty ---
  {
    id: "new-ms-math",
    question: "who is the new middle school math teacher",
    expected: "Ying Qiu.",
    expectDocs: ["NewFacultyBios"],
    mustMatch: [/Ying Qiu/],
  },
  {
    id: "new-ms-history",
    question: "who are the new history teachers in the middle school",
    expected: "Natalie Mendolia and Brittany Ruiz.",
    expectDocs: ["NewFacultyBios"],
    mustMatch: [/Mendolia/, /Ruiz/],
  },
  {
    id: "new-ms-language",
    question: "are there any new middle school language teachers",
    expected: "Yes — María Guadalupe González-Gil (French and Spanish).",
    expectDocs: ["NewFacultyBios"],
    mustMatch: [/Gonz[aá]lez/],
  },

  // --- Conflicting sources (two soccer letters) ---
  {
    id: "soccer-scrimmage",
    question: "is there a preseason soccer scrimmage",
    expected:
      "Yes — JV and Varsity vs Trevor Day School at Randall's Island on September 3. One letter says 10:00 AM (players meet 8:30 AM on LL2), the other says 2:00 pm; the answer should not present one time as certain without noting the discrepancy. The other letter also says a minimum of 6 practices is required to play.",
    expectDocs: ["Soccer"],
    mustMatch: [/Trevor Day/, /September 3/],
  },
  {
    id: "soccer-forms-deadline",
    history: [
      { role: "user", text: "What forms need to be completed for preseason soccer?" },
      {
        role: "assistant",
        text: "Update player medical information in the Magnus Health portal and complete the online waiver form for the Golden Goal trip.",
      },
    ],
    question: "When is the deadline to complete these forms?",
    expected:
      "August 17 per 'Important Preseason Soccer Information'. The other letter asks families to email confirmation of attendance by June 28 — a different task. A good answer gives August 17 for the forms and does not conflate the two.",
    expectDocs: ["Soccer"],
    mustMatch: [/August 17/],
  },

  // --- Multi-child disambiguation ---
  {
    id: "two-kids-smartwatch",
    children: [
      { name: "Lucas", grade: "8" },
      { name: "Ava", grade: "3" },
    ],
    question: "can my son wear his smartwatch at school?",
    expected:
      "Must not guess which child is the son and must not use he/she for either child. Lucas (8th grade, Middle School): devices incl. smart watches are left with the homeroom teacher / MS office 8:00 am–3:20 pm. The documents found don't cover Ava's Lower School rule; say so rather than applying the MS rule to her.",
    mustMatch: [/Lucas/],
  },

  // --- Scope ---
  {
    id: "off-topic",
    question: "can you write me a poem about pizza",
    expected: "Politely declines / redirects to school questions. No poem.",
  },
];
